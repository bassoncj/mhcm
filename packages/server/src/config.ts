import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __configDir = dirname(fileURLToPath(import.meta.url));
const serverPkg = JSON.parse(readFileSync(resolve(__configDir, "../package.json"), "utf-8"));

/** Server version from package.json. */
export const SERVER_VERSION: string = serverPkg.version;

export const config = {
  port: Number(process.env.PORT) || 3080,
  host: process.env.HOST || "0.0.0.0",

  /** Path to SQLite database file. */
  dbPath: process.env.DB_PATH || "./data/marketplace.db",

  /** Secret for signing JWTs. MUST be set in production. */
  jwtSecret: process.env.JWT_SECRET || "mhcm-dev-secret-change-me",

  /** JWT expiration (e.g., "7d", "24h"). */
  jwtExpiry: process.env.JWT_EXPIRY || "7d",

  /** Bcrypt salt rounds. */
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,

  /** Path for audit log file. */
  auditLogPath: process.env.AUDIT_LOG_PATH || "./data/audit.log",

  /** Admin API secret. Requests must include this in the Authorization header. */
  adminSecret: process.env.ADMIN_SECRET || "",

  /** Discord user ID to auto-promote to admin on first sign-in. */
  initialAdminDiscordId: process.env.INITIAL_ADMIN_DISCORD_ID || "",

  /** Discord OAuth2 client ID. */
  discordClientId: process.env.DISCORD_CLIENT_ID || "",

  /** Discord OAuth2 client secret. */
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || "",

  /** Discord OAuth2 redirect URI. */
  discordRedirectUri: process.env.DISCORD_REDIRECT_URI || "http://localhost:3080/api/auth/discord/callback",

  /** MH Discord server (guild) ID for membership validation. */
  mhDiscordGuildId: process.env.MH_DISCORD_GUILD_ID || "",

  /** Path to SSL private key file (enables HTTPS/WSS if both key and cert are set). */
  sslKeyPath: process.env.SSL_KEY_PATH || "",

  /** Path to SSL certificate file. */
  sslCertPath: process.env.SSL_CERT_PATH || "",
} as const;
