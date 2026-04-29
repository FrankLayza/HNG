import { Router, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, AuthenticatedRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { z } from "zod";

const router: Router = Router();

// All admin routes require authentication + ADMIN role
router.use(authenticate);
router.use(requireAdmin);

// ─── USERS ──────────────────────────────────────────────────────────

/**
 * @route   GET /api/v1/admin/users
 * @desc    List all registered users with their roles
 */
router.get("/users", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        githubId: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            refreshTokens: {
              where: { revoked: false, expiresAt: { gt: new Date() } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Reshape for frontend consumption
    const data = users.map((u) => ({
      id: u.id,
      github_id: u.githubId,
      email: u.email,
      name: u.name,
      role: u.role,
      active_sessions: u._count.refreshTokens,
      created_at: u.createdAt.toISOString(),
      updated_at: u.updatedAt.toISOString(),
    }));

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    console.error("Admin list users error:", error);
    return res.status(500).json({ status: "error", message: "Failed to fetch users" });
  }
});

/**
 * @route   PATCH /api/v1/admin/users/:id/role
 * @desc    Update a user's role (ADMIN or ANALYST)
 */
const roleUpdateSchema = z.object({
  role: z.enum(["ADMIN", "ANALYST"]),
});

router.patch("/users/:id/role", async (req: AuthenticatedRequest, res: Response) => {
  const parsed = roleUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: "error", message: "Invalid role. Must be ADMIN or ANALYST." });
  }

  const id = req.params.id as string;

  // Prevent self-demotion
  if (id === req.user?.userId && parsed.data.role !== "ADMIN") {
    return res.status(400).json({ status: "error", message: "Cannot demote your own account" });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { role: parsed.data.role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return res.status(200).json({
      status: "success",
      message: `User role updated to ${parsed.data.role}`,
      data: user,
    });
  } catch (error) {
    return res.status(404).json({ status: "error", message: "User not found" });
  }
});


// ─── SESSIONS (Active Refresh Tokens) ───────────────────────────────

/**
 * @route   GET /api/v1/admin/sessions
 * @desc    List all active (non-revoked, non-expired) sessions
 */
router.get("/sessions", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = await prisma.refreshToken.findMany({
      where: {
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = sessions.map((s) => ({
      id: s.id,
      user_id: s.user.id,
      user_name: s.user.name,
      user_email: s.user.email,
      user_role: s.user.role,
      created_at: s.createdAt.toISOString(),
      expires_at: s.expiresAt.toISOString(),
      // The "current" session is the one whose userId matches the requesting admin
      is_current: s.userId === req.user?.userId,
    }));

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    console.error("Admin list sessions error:", error);
    return res.status(500).json({ status: "error", message: "Failed to fetch sessions" });
  }
});

/**
 * @route   DELETE /api/v1/admin/sessions/:id
 * @desc    Revoke a specific session (refresh token)
 */
router.delete("/sessions/:id", async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;

  try {
    await prisma.refreshToken.update({
      where: { id },
      data: { revoked: true },
    });

    return res.status(200).json({
      status: "success",
      message: "Session revoked successfully",
    });
  } catch (error) {
    return res.status(404).json({ status: "error", message: "Session not found" });
  }
});

/**
 * @route   DELETE /api/v1/admin/sessions
 * @desc    Revoke ALL sessions (except the caller's current one, optionally)
 */
router.delete("/sessions", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await prisma.refreshToken.updateMany({
      where: {
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      data: { revoked: true },
    });

    return res.status(200).json({
      status: "success",
      message: `Revoked ${result.count} active session(s)`,
    });
  } catch (error) {
    console.error("Admin revoke all sessions error:", error);
    return res.status(500).json({ status: "error", message: "Failed to revoke sessions" });
  }
});


// ─── AUDIT LOGS ─────────────────────────────────────────────────────

/**
 * @route   GET /api/v1/admin/audit-logs
 * @desc    Fetch audit log entries with pagination
 */
const auditQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  action: z.string().optional(),
  user_id: z.string().optional(),
});

router.get("/audit-logs", async (req: AuthenticatedRequest, res: Response) => {
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ status: "error", message: "Invalid query parameters" });
  }

  const { page, limit, action, user_id } = parsed.data;

  try {
    const where: any = {};
    if (action) where.action = action;
    if (user_id) where.userId = user_id;

    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const total_pages = Math.ceil(total / limit);

    const data = logs.map((l) => ({
      id: l.id,
      user: l.user.name || "Unknown",
      user_id: l.user.id,
      user_role: l.user.role,
      action: l.action,
      resource: l.resource,
      method: l.method,
      status_code: l.statusCode,
      ip_address: l.ipAddress,
      user_agent: l.userAgent,
      details: l.details,
      timestamp: l.createdAt.toISOString(),
    }));

    return res.status(200).json({
      status: "success",
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages,
        has_next: page < total_pages,
        has_prev: page > 1,
      },
    });
  } catch (error) {
    console.error("Admin audit logs error:", error);
    return res.status(500).json({ status: "error", message: "Failed to fetch audit logs" });
  }
});

export default router;
