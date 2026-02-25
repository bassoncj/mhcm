import type { IncomingMessage, ServerResponse } from "http";
import type { UserRole } from "@mhcm/shared";
import { verifyToken, type JWTPayload } from "./sessions.js";

/** Extended request type with authenticated user info. */
export interface AuthenticatedRequest extends IncomingMessage {
  user?: JWTPayload;
}

/**
 * Extract and verify JWT from an HTTP request.
 * Looks for Authorization: Bearer <token> header.
 */
export function authenticateHttp(
  req: AuthenticatedRequest,
  res: ServerResponse
): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing or invalid Authorization header" }));
    return false;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid or expired token" }));
    return false;
  }

  req.user = payload;
  return true;
}

/**
 * Authenticate and require specific role(s).
 * Returns true if authenticated and authorized; sends error response and returns false otherwise.
 */
export function requireRole(
  roles: UserRole[],
  req: AuthenticatedRequest,
  res: ServerResponse
): boolean {
  if (!authenticateHttp(req, res)) return false;

  if (!roles.includes(req.user!.role)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Insufficient permissions" }));
    return false;
  }

  return true;
}

/** Authenticate and require admin role. */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: ServerResponse
): boolean {
  return requireRole(["admin"], req, res);
}

/** Authenticate and require moderator or admin role. */
export function requireModerator(
  req: AuthenticatedRequest,
  res: ServerResponse
): boolean {
  return requireRole(["admin", "moderator"], req, res);
}

/**
 * Extract and verify JWT from a WebSocket upgrade request.
 * Looks for token in query string: ?token=<jwt>
 */
export function authenticateWs(
  req: IncomingMessage
): JWTPayload | null {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  if (!token) return null;
  return verifyToken(token);
}
