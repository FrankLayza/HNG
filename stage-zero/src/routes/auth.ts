import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { generateAccessToken, generateRefreshToken } from "../lib/jwt.js";
import { z } from "zod";

const router: Router = Router();

const githubCallbackSchema = z.object({
  code: z.string(),
  code_verifier: z.string(),
  redirect_uri: z.string().optional(),
});

/**
 * @route   GET /api/v1/auth/github/url
 * @desc    Get GitHub OAuth Authorization URL (Client should append state and code_challenge)
 */
router.get("/github/url", (req, res) => {
  const client_id = process.env.GITHUB_CLIENT_ID;
  const redirect_uri = req.query.redirect_uri || process.env.GITHUB_REDIRECT_URI;
  const scope = "user:email";
  
  if (!client_id) {
    return res.status(500).json({ status: "error", message: "GitHub Client ID not configured" });
  }

  const url = `https://github.com/login/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&scope=${scope}&response_type=code`;
  
  return res.status(200).json({
    status: "success",
    data: { url }
  });
});

/**
 * @route   POST /api/v1/auth/github/callback
 * @desc    Exchange GitHub code + PKCE verifier for local tokens
 */
router.post("/github/callback", async (req, res) => {
  const result = githubCallbackSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ status: "error", message: "Invalid request body", errors: result.error.issues });
  }

  const { code, code_verifier, redirect_uri } = result.data;

  try {
    // 1. Exchange code for GitHub access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        code_verifier,
        redirect_uri: redirect_uri || process.env.GITHUB_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json() as any;

    if (tokenData.error || !tokenData.access_token) {
      return res.status(400).json({ 
        status: "error", 
        message: tokenData.error_description || tokenData.error || "Failed to exchange code" 
      });
    }

    // 2. Get user info from GitHub
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${tokenData.access_token}`,
        "User-Agent": "Insighta-Labs-Backend",
      },
    });

    const userData = await userResponse.json() as any;

    if (!userData.id) {
      return res.status(400).json({ status: "error", message: "Failed to fetch GitHub user data" });
    }

    // 3. Find or create user in our DB
    let user = await prisma.user.findUnique({
      where: { githubId: userData.id.toString() },
    });

    if (!user) {
      const userCount = await prisma.user.count();
      user = await prisma.user.create({
        data: {
          githubId: userData.id.toString(),
          email: userData.email,
          name: userData.name || userData.login,
          role: userCount === 0 ? "ADMIN" : "ANALYST", // First user is Admin
        },
      });
    }

    // 4. Generate our local tokens
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
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error during authentication" });
  }
});

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token using refresh token
 */
router.post("/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ status: "error", message: "Refresh token is required" });
  }

  try {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refresh_token },
      include: { user: true },
    });

    if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
      return res.status(401).json({ status: "error", message: "Invalid or expired refresh token" });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(storedToken.user);
    const newRefreshToken = generateRefreshToken(storedToken.user);

    // Revoke old token and store new one (Token Rotation)
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

export default router;
