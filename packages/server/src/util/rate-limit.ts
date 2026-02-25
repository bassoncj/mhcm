import type { ClientMessage } from "@mhcm/shared";

export interface BucketConfig {
  maxTokens: number;
  refillRate: number; // tokens per second
}

export interface RateLimitConfig {
  wsGeneral: BucketConfig;
  wsMutation: BucketConfig;
  wsMatcher: BucketConfig;
  httpAuth: BucketConfig;
  httpApi: BucketConfig;
}

/** Shared config object – mutated in place so existing buckets pick up changes. */
const config: RateLimitConfig = {
  wsGeneral: { maxTokens: 60, refillRate: 10 },
  wsMutation: { maxTokens: 20, refillRate: 2 },
  wsMatcher: { maxTokens: 10, refillRate: 1 },
  httpAuth: { maxTokens: 5, refillRate: 0.1 },
  httpApi: { maxTokens: 30, refillRate: 5 },
};

export function getRateLimitConfig(): Readonly<RateLimitConfig> {
  return config;
}

/** Update config in place. Existing buckets pick up changes on next consume(). */
export function updateRateLimitConfig(partial: Partial<RateLimitConfig>): void {
  for (const [key, value] of Object.entries(partial)) {
    const k = key as keyof RateLimitConfig;
    if (config[k] && value) {
      config[k].maxTokens = value.maxTokens;
      config[k].refillRate = value.refillRate;
    }
  }
}

class TokenBucket {
  tokens: number;
  lastRefill: number;
  config: BucketConfig;

  constructor(cfg: BucketConfig) {
    this.config = cfg;
    this.tokens = cfg.maxTokens;
    this.lastRefill = Date.now();
  }

  consume(cost = 1): boolean {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.lastRefill = now;
    this.tokens = Math.min(
      this.config.maxTokens,
      this.tokens + elapsed * this.config.refillRate,
    );
  }
}

interface UserLimiter {
  general: TokenBucket;
  mutation: TokenBucket;
  matcher: TokenBucket;
}

const wsLimiters = new Map<number, UserLimiter>();

export function initWsLimiter(userId: number): void {
  wsLimiters.set(userId, {
    general: new TokenBucket(config.wsGeneral),
    mutation: new TokenBucket(config.wsMutation),
    matcher: new TokenBucket(config.wsMatcher),
  });
}

export function removeWsLimiter(userId: number): void {
  wsLimiters.delete(userId);
}

export type WsCategory = "general" | "mutation" | "matcher";

/** Returns true if the message is allowed. */
export function checkWsRateLimit(userId: number, category: WsCategory): boolean {
  const limiter = wsLimiters.get(userId);
  if (!limiter) return true; // no limiter = allow (shouldn't happen)
  return limiter[category].consume();
}

const httpAuthLimiters = new Map<string, TokenBucket>();
const httpApiLimiters = new Map<string, TokenBucket>();

let httpCleanupTimer: ReturnType<typeof setInterval> | null = null;

export function checkHttpRateLimit(key: string, category: "auth" | "api"): boolean {
  const map = category === "auth" ? httpAuthLimiters : httpApiLimiters;
  const cfg = category === "auth" ? config.httpAuth : config.httpApi;

  let bucket = map.get(key);
  if (!bucket) {
    bucket = new TokenBucket(cfg);
    map.set(key, bucket);
    ensureHttpCleanup();
  }
  return bucket.consume();
}

function ensureHttpCleanup(): void {
  if (httpCleanupTimer) return;
  httpCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, bucket] of httpAuthLimiters) {
      if (bucket.lastRefill < cutoff) httpAuthLimiters.delete(key);
    }
    for (const [key, bucket] of httpApiLimiters) {
      if (bucket.lastRefill < cutoff) httpApiLimiters.delete(key);
    }
    if (httpAuthLimiters.size === 0 && httpApiLimiters.size === 0) {
      clearInterval(httpCleanupTimer!);
      httpCleanupTimer = null;
    }
  }, 5 * 60 * 1000);
}

const EXEMPT_TYPES = new Set(["xhr_log", "ping"]);

const MATCHER_TYPES = new Set([
  "report_version",
  "user_active",
  "user_afk",
  "report_game_settings",
  "update_active_maps",
  "maps_removed",
]);

const MUTATION_PREFIXES = [
  "create_",
  "cancel_",
  "adjust_",
  "update_",
  "toggle_",
];

const MUTATION_CONTAINS = [
  "_step_result",
  "acknowledge_",
  "apply_for_beta",
  "dismiss_version_alert",
  "complete_onboarding_step",
];

/**
 * Classify a WS message into a rate limit category.
 * Returns null for exempt messages (no rate limiting applied).
 */
export function classifyWsMessage(message: ClientMessage): WsCategory | null {
  const type = message.type;
  if (EXEMPT_TYPES.has(type)) return null;
  if (MATCHER_TYPES.has(type)) return "matcher";
  for (const prefix of MUTATION_PREFIXES) {
    if (type.startsWith(prefix)) return "mutation";
  }
  for (const substr of MUTATION_CONTAINS) {
    if (type.includes(substr)) return "mutation";
  }
  // Admin mutations
  if (type.startsWith("admin_") && type !== "admin_get_settings" && type !== "admin_get_alerts" && type !== "admin_get_beta_requests") {
    return "mutation";
  }
  if (type.startsWith("mod_") && !type.startsWith("mod_get_") && !type.startsWith("mod_list_")) {
    return "mutation";
  }
  return "general";
}
