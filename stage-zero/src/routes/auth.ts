import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../lib/jwt.js";
import { authenticate, AuthenticatedRequest } from "../middleware/auth.js";

const router: Router = Router();

// ─── In-memory PKCE + state store (maps state → { code_challenge, redirect_uri }) ──
const pendingAuths = new Map<string, { code_challenge: string; redirect_uri?: string; createdAt: number }>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingAuths) {
    if (now - val.createdAt > 10 * 60 * 1000) pendingAuths.delete(key); // 10 min TTL
  }
}, 5 * 60 * 1000);

/**
 * @route   GET /auth/github
 * @desc    Redirect user to GitHub OAuth with PKCE and state.
 *          The bot / browser hits this endpoint directly and gets a 302.
 *
 * Query params accepted (optional – the server generates defaults):
 *   - redirect_uri   – where GitHub should redirect after login
 *   - code_challenge  – S256 PKCE challenge (if omitted, server generates its own)
 *   - code_challenge_method – must be "S256" if provided
 *   - state           – opaque string (if omitted, server generates one)
 */
router.get("/github", (req: Request, res: Response) => {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  if (!clientId) {
    return res.status(500).json({ status: "error", message: "GitHub Client ID not configured" });
  }

  // Use provided or generate state
  const state = (req.query.state as string) || crypto.randomBytes(16).toString("hex");

  // PKCE: use provided code_challenge or generate one
  let codeChallenge = req.query.code_challenge as string | undefined;
  if (!codeChallenge) {
    // Generate a dummy verifier/challenge so the flow always has PKCE
    const verifier = crypto.randomBytes(32).toString("base64url");
    codeChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  }

  // Store state → challenge mapping for callback validation
  const redirectUri = (req.query.redirect_uri as string) || process.env.GITHUB_REDIRECT_URI || "";
  pendingAuths.set(state, {
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
    createdAt: Date.now(),
  });

  const scope = "user:email read:user";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    response_type: "code",
  });

  const githubUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  return res.redirect(githubUrl);
});

/**
 * @route   GET /auth/github/callback
 * @desc    Handle GitHub's OAuth redirect. Exchange code + state for local tokens.
 *          Returns JSON with access_token, refresh_token, user.
 *
 * Query params:
 *   - code  (required) – GitHub authorization code
 *   - state (required) – must match a pending auth entry
 */
router.get("/github/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;

  if (!code) {
    return res.status(400).json({ status: "error", message: "Missing authorization code" });
  }
  if (!state) {
    return res.status(400).json({ status: "error", message: "Missing state parameter" });
  }

  // Validate state
  const pending = pendingAuths.get(state);
  if (!pending) {
    return res.status(400).json({ status: "error", message: "Invalid or expired state parameter" });
  }
  pendingAuths.delete(state);

  try {
    // 1. Exchange code for GitHub access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID?.trim(),
        client_secret: process.env.GITHUB_CLIENT_SECRET?.trim(),
        code,
        redirect_uri: pending.redirect_uri || process.env.GITHUB_REDIRECT_URI,
      }),
    });

    const tokenData = (await tokenResponse.json()) as any;

    if (tokenData.error || !tokenData.access_token) {
      return res.status(400).json({
        status: "error",
        message: tokenData.error_description || tokenData.error || "Failed to exchange code",
      });
    }

    // 2. Get user info from GitHub
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${tokenData.access_token}`,
        "User-Agent": "Insighta-Labs-Backend",
      },
    });

    const userData = (await userResponse.json()) as any;

    if (!userData.id) {
      return res.status(400).json({ status: "error", message: "Failed to fetch GitHub user data" });
    }

    // 2b. Try to get email if not public
    let email = userData.email;
    if (!email) {
      try {
        const emailRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `token ${tokenData.access_token}`,
            "User-Agent": "Insighta-Labs-Backend",
          },
        });
        const emails = (await emailRes.json()) as any[];
        const primary = emails?.find((e: any) => e.primary && e.verified);
        if (primary) email = primary.email;
      } catch {
        // email remains null
      }
    }

    // 3. Find or create user in our DB — first user gets ADMIN
    let user = await prisma.user.findUnique({
      where: { githubId: userData.id.toString() },
    });

    if (!user) {
      const userCount = await prisma.user.count();
      user = await prisma.user.create({
        data: {
          githubId: userData.id.toString(),
          email: email || null,
          name: userData.name || userData.login,
          role: userCount === 0 ? "ADMIN" : "ANALYST",
        },
      });
    }

    // 4. Generate local tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // 5. Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    return res.status(200).json({
      status: "success",
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Auth callback error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error during authentication" });
  }
});

/**
 * @route   POST /auth/github/callback
 * @desc    Alternative POST-based callback (for CLI/SPA flows)
 *          Accepts { code, state } or { code, code_verifier } in body
 */
router.post("/github/callback", async (req: Request, res: Response) => {
  const { code, state, code_verifier, redirect_uri } = req.body || {};

  if (!code) {
    return res.status(400).json({ status: "error", message: "Missing authorization code" });
  }
  if (!state && !code_verifier) {
    return res.status(400).json({ status: "error", message: "Missing state or code_verifier parameter" });
  }

  // If state was provided, validate it
  if (state) {
    const pending = pendingAuths.get(state);
    if (!pending) {
      return res.status(400).json({ status: "error", message: "Invalid or expired state parameter" });
    }
    pendingAuths.delete(state);
  }

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID?.trim(),
        client_secret: process.env.GITHUB_CLIENT_SECRET?.trim(),
        code,
        code_verifier: code_verifier || undefined,
        redirect_uri: redirect_uri || process.env.GITHUB_REDIRECT_URI,
      }),
    });

    const tokenData = (await tokenResponse.json()) as any;

    if (tokenData.error || !tokenData.access_token) {
      return res.status(400).json({
        status: "error",
        message: tokenData.error_description || tokenData.error || "Failed to exchange code",
      });
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${tokenData.access_token}`,
        "User-Agent": "Insighta-Labs-Backend",
      },
    });

    const userData = (await userResponse.json()) as any;

    if (!userData.id) {
      return res.status(400).json({ status: "error", message: "Failed to fetch GitHub user data" });
    }

    let email = userData.email;
    if (!email) {
      try {
        const emailRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `token ${tokenData.access_token}`,
            "User-Agent": "Insighta-Labs-Backend",
          },
        });
        const emails = (await emailRes.json()) as any[];
        const primary = emails?.find((e: any) => e.primary && e.verified);
        if (primary) email = primary.email;
      } catch {
        // email remains null
      }
    }

    let user = await prisma.user.findUnique({
      where: { githubId: userData.id.toString() },
    });

    if (!user) {
      const userCount = await prisma.user.count();
      user = await prisma.user.create({
        data: {
          githubId: userData.id.toString(),
          email: email || null,
          name: userData.name || userData.login,
          role: userCount === 0 ? "ADMIN" : "ANALYST",
        },
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    return res.status(200).json({
      status: "success",
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Auth POST callback error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error during authentication" });
  }
});

/**
 * @route   POST /auth/refresh
 * @desc    Refresh access token using refresh token (POST only)
 */
router.post("/refresh", async (req: Request, res: Response) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) {
    return res.status(400).json({ status: "error", message: "Refresh token is required" });
  }

  try {
    // Verify the JWT signature first
    const payload = verifyRefreshToken(refresh_token);
    if (!payload) {
      return res.status(401).json({ status: "error", message: "Invalid or expired refresh token" });
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refresh_token },
      include: { user: true },
    });

    if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
      return res.status(401).json({ status: "error", message: "Invalid or expired refresh token" });
    }

    // Generate new tokens (Token Rotation)
    const newAccessToken = generateAccessToken(storedToken.user);
    const newRefreshToken = generateRefreshToken(storedToken.user);

    // Revoke old token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: storedToken.user.id,
        expiresAt,
      },
    });

    return res.status(200).json({
      status: "success",
      data: {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
      },
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error during token refresh" });
  }
});

// Reject non-POST on /refresh
router.all("/refresh", (req: Request, res: Response) => {
  return res.status(405).json({ status: "error", message: "Method not allowed. Use POST." });
});

/**
 * @route   POST /auth/logout
 * @desc    Revoke the current refresh token (logout)
 */
router.post("/logout", async (req: Request, res: Response) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) {
    return res.status(400).json({ status: "error", message: "Refresh token is required" });
  }

  try {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refresh_token },
    });

    if (!storedToken) {
      return res.status(400).json({ status: "error", message: "Invalid refresh token" });
    }

    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    return res.status(200).json({ status: "success", message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error during logout" });
  }
});

// Reject non-POST on /logout
router.all("/logout", (req: Request, res: Response) => {
  return res.status(405).json({ status: "error", message: "Method not allowed. Use POST." });
});

/**
 * @route   GET /auth/github/url
 * @desc    Get GitHub OAuth URL as JSON (kept for backward compat)
 */
router.get("/github/url", (req: Request, res: Response) => {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const redirectUri = (req.query.redirect_uri as string) || process.env.GITHUB_REDIRECT_URI;
  const scope = "user:email read:user";

  if (!clientId) {
    return res.status(500).json({ status: "error", message: "GitHub Client ID not configured" });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");

  pendingAuths.set(state, {
    code_challenge: codeChallenge,
    redirect_uri: redirectUri || "",
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri || "",
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    response_type: "code",
  });

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;

  return res.status(200).json({
    status: "success",
    data: { url, state, code_verifier: verifier },
  });
});

export default router;
