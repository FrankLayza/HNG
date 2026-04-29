import jwt from "jsonwebtoken";
import { User, Role } from "../generated/prisma/client.js";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-123";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "super-secret-refresh-key-123";

// Access token expires in 15 minutes
const ACCESS_TOKEN_EXPIRES_IN = "15m";
// Refresh token expires in 7 days
const REFRESH_TOKEN_EXPIRES_IN = "7d";

export interface JwtPayload {
  userId: string;
  role: Role;
}

export function generateAccessToken(user: { id: string; role: Role }) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

export function generateRefreshToken(user: { id: string; role: Role }) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    return null;
  }
}

export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
  } catch (error) {
    return null;
  }
}
