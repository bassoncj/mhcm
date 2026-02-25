import jwt from "jsonwebtoken";
import { config } from "../config.js";

import type { UserRole } from "@mhcm/shared";

export interface JWTPayload {
  userId: number;
  username: string;
  role: UserRole;
}

/** 7 days in seconds. */
const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

export function createToken(payload: JWTPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: JWT_EXPIRY_SECONDS,
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload & {
      iat: number;
      exp: number;
    };
    return { userId: decoded.userId, username: decoded.username, role: decoded.role || "user" };
  } catch {
    return null;
  }
}
