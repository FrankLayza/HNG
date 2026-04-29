import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { prisma } from "../lib/prisma.js";

/**
 * Maps route paths to human-readable action names.
 */
function resolveAction(method: string, path: string): string {
  const m = method.toUpperCase();

  // Auth routes
  if (path.includes("/auth/github/callback")) return "LOGIN";
  if (path.includes("/auth/refresh")) return "TOKEN_REFRESH";

  // Profile routes
  if (path.includes("/profiles/export")) return "EXPORT_CSV";
  if (path.includes("/profiles/search")) return "SEARCH_PROFILES";
  if (path.includes("/profiles") && m === "POST") return "CREATE_PROFILE";
  if (path.includes("/profiles") && m === "DELETE") return "DELETE_PROFILE";
  if (path.includes("/profiles") && m === "GET") return "VIEW_PROFILES";

  // Admin routes
  if (path.includes("/admin/users") && m === "PATCH") return "UPDATE_USER_ROLE";
  if (path.includes("/admin/users")) return "VIEW_USERS";
  if (path.includes("/admin/sessions") && m === "DELETE") return "REVOKE_SESSION";
  if (path.includes("/admin/sessions")) return "VIEW_SESSIONS";
  if (path.includes("/admin/audit-logs")) return "VIEW_AUDIT_LOGS";

  return `${m}_${path.split("/").pop()?.toUpperCase() || "UNKNOWN"}`;
}

/**
 * Middleware that logs authenticated API requests to the AuditLog table.
 * Must be placed AFTER the authenticate middleware.
 */
export const auditLogger = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Only log if we have an authenticated user
  if (!req.user?.userId) {
    return next();
  }

  const userId = req.user.userId;
  const method = req.method;
  const resource = req.originalUrl;
  const action = resolveAction(method, resource);
  const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";

  // Use res.on("finish") to capture the status code after response is sent
  res.on("finish", async () => {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          resource,
          method,
          statusCode: res.statusCode,
          ipAddress,
          userAgent,
        },
      });
    } catch (error) {
      // Don't let audit logging failures break the application
      console.error("Audit log write error:", error);
    }
  });

  next();
};
