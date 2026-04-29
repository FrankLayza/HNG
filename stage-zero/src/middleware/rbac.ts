import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { Role } from "../generated/prisma/client.js";

/**
 * Middleware to authorize requests based on user roles
 */
export const authorize = (roles: Role[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        status: "error", 
        message: "Unauthorized: User context missing" 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        status: "error", 
        message: `Forbidden: This action requires one of the following roles: ${roles.join(", ")}` 
      });
    }

    next();
  };
};

// Helper aliases for common role checks
export const requireAdmin = authorize(["ADMIN"]);
export const requireAnalyst = authorize(["ADMIN", "ANALYST"]);
