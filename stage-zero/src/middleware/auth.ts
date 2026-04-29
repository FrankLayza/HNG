import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { Role } from "../generated/prisma/client.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: Role;
  };
}

/**
 * Middleware to authenticate requests using JWT Access Token
 */
export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      status: "error", 
      message: "Unauthorized: Access token is missing or malformed" 
    });
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    return res.status(401).json({ 
      status: "error", 
      message: "Unauthorized: Access token is invalid or has expired" 
    });
  }

  req.user = {
    userId: payload.userId,
    role: payload.role as Role
  };

  next();
};
