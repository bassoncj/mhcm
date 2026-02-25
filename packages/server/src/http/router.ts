import type { IncomingMessage, ServerResponse } from "http";
import type { AuthenticatedRequest } from "../auth/middleware.js";
import { checkHttpRateLimit } from "../util/rate-limit.js";
import {
  handleRegister,
  handleLogin,
  handleDiscordAuth,
  handleDiscordCallback,
} from "./routes/auth.js";
type Handler = (
  req: AuthenticatedRequest,
  res: ServerResponse
) => void | Promise<void>;

interface Route {
  method: string;
  path: string;
  handler: Handler;
}

const routes: Route[] = [
  { method: "POST", path: "/api/auth/register", handler: handleRegister },
  { method: "POST", path: "/api/auth/login", handler: handleLogin },
  { method: "GET", path: "/api/auth/discord", handler: handleDiscordAuth },
  { method: "GET", path: "/api/auth/discord/callback", handler: handleDiscordCallback },
];

export function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // Rate limit: auth routes by IP, all other routes by IP as fallback
  const isAuthRoute = url.pathname.startsWith("/api/auth/");
  const ip = req.socket.remoteAddress || "unknown";
  if (isAuthRoute && !checkHttpRateLimit(ip, "auth")) {
    jsonResponse(res, 429, { error: "Too many requests. Please try again later." });
    return;
  }
  if (!isAuthRoute && !checkHttpRateLimit(ip, "api")) {
    jsonResponse(res, 429, { error: "Too many requests. Please try again later." });
    return;
  }

  const route = routes.find(
    (r) => r.method === req.method && r.path === url.pathname
  );

  if (route) {
    Promise.resolve(route.handler(req, res)).catch((err) => {
      console.error("[http] handler error:", err);
      if (!res.headersSent) {
        jsonResponse(res, 500, { error: "Internal server error" });
      }
    });
    return;
  }

  jsonResponse(res, 404, { error: "Not found" });
}

const MAX_BODY_SIZE = 64 * 1024;

/** Rejects bodies over 64KB. */
export function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

export function jsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
