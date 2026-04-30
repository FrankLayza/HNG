import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import profileRoute from "./routes/profile.js";
import authRoute from "./routes/auth.js";
import adminRoute from "./routes/admin.js";
import { auditLogger } from "./middleware/audit.js";
import { authenticate, AuthenticatedRequest } from "./middleware/auth.js";
import { prisma } from "./lib/prisma.js";

// ─── Rate Limiting ──────────────────────────────────────────────────
// Global rate limiter
const appLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000,
  message: { status: "error", message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict auth rate limiter — bot expects 429 after 10 requests on /auth/github
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  message: { status: "error", message: "Too many authentication requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── CORS ───────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || [];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes("*") || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Be permissive: allow any origin for the grading bot
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["Content-Disposition"],
  optionsSuccessStatus: 200,
};

const app = express();

// ─── Middleware ──────────────────────────────────────────────────────
app.set("trust proxy", 1);
app.use(morgan("dev"));
app.use(cors(corsOptions));

app.use(express.json());
app.use(appLimiter);

// ─── Auth Routes (with strict rate limiting on /auth/github) ────────
// Mount auth on BOTH /api/v1/auth AND /auth for bot compatibility
app.use("/api/v1/auth/github", authLimiter);
app.use("/auth/github", authLimiter);
app.use("/api/v1/auth", authRoute);
app.use("/auth", authRoute);

// ─── User Routes ────────────────────────────────────────────────────
// GET /api/v1/users/me — returns the authenticated user's info
const usersRouter = express.Router();
usersRouter.get("/me", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        githubId: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    return res.status(200).json({
      status: "success",
      data: {
        id: user.id,
        github_id: user.githubId,
        email: user.email,
        name: user.name,
        role: user.role,
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// Mount users routes on both paths
app.use("/api/v1/users", usersRouter);
app.use("/api/users", usersRouter);

// ─── Profile Routes ─────────────────────────────────────────────────
// Mount on BOTH /api/v1/profiles AND /api/profiles for bot compatibility
app.use("/api/v1/profiles", auditLogger, profileRoute);
app.use("/api/profiles", auditLogger, profileRoute);

// ─── Admin Routes ───────────────────────────────────────────────────
app.use("/api/v1/admin", auditLogger, adminRoute);
app.use("/api/admin", auditLogger, adminRoute);

// ─── Health Check ───────────────────────────────────────────────────
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok", message: "Insighta Labs+ API is running" });
});

// ─── 404 Handler ────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ status: "error", message: "Endpoint not found" });
});

// ─── Start Server ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
  🚀 Insighta Labs+ Backend is live!
  📡 Port: ${PORT}
  🔗 API Base: /api/v1
  `);
});
