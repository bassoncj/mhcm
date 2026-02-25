import type { MarketType, VerificationMethod } from "@mhcm/shared";
import { RISK_CHECK_TIMEOUT_SECONDS, ONBOARDING_STEPS } from "@mhcm/shared";
import { getBoolSetting, setBoolSetting, getIntSetting, setIntSetting, getSetting, setSetting } from "./db/queries/settings.js";
import { updateRateLimitConfig, getRateLimitConfig, type RateLimitConfig } from "./util/rate-limit.js";

interface ServerSettings {
  /** Bypass LM/L2M validation for sell orders (testing only). In-memory only. */
  allowAnyGoalCount: boolean;
  /** Closed beta mode: only allowed testers can create new accounts. Persisted. */
  closedBetaEnabled: boolean;
  /** XHR diagnostic logging: all users send API requests/responses to data/xhr/. In-memory only. */
  xhrLoggingEnabled: boolean;
  /** Per-market beta flags. When true, only beta testers can create orders. Persisted. */
  slotMarketBeta: boolean;
  snipingMarketBeta: boolean;
  itemMarketBeta: boolean;
  mapMarketBeta: boolean;
  /** Show version-mismatch alert to users running an older extension. Persisted. */
  versionAlertEnabled: boolean;
  /** Per-market enabled flags. When false, matching is paused and order creation is blocked. Persisted. */
  slotMarketEnabled: boolean;
  snipingMarketEnabled: boolean;
  itemMarketEnabled: boolean;
  mapMarketEnabled: boolean;
  /** Risk check timeout in seconds. Persisted. */
  riskCheckTimeoutSeconds: number;
  /** Corkboard verification method: service_account (puppeteer) or proxy_user (random user's extension). Persisted. */
  verificationMethod: VerificationMethod;
}

const settings: ServerSettings = {
  allowAnyGoalCount: false,
  closedBetaEnabled: false,
  xhrLoggingEnabled: false,
  slotMarketBeta: false,
  snipingMarketBeta: false,
  itemMarketBeta: false,
  mapMarketBeta: false,
  versionAlertEnabled: false,
  slotMarketEnabled: true,
  snipingMarketEnabled: true,
  itemMarketEnabled: true,
  mapMarketEnabled: true,
  riskCheckTimeoutSeconds: RISK_CHECK_TIMEOUT_SECONDS,
  verificationMethod: "proxy_user" as VerificationMethod,
};

// Load persisted settings from the database. Call after initDb().
export function loadSettings(): void {
  settings.closedBetaEnabled = getBoolSetting("closed_beta_enabled", false);
  settings.xhrLoggingEnabled = getBoolSetting("xhr_logging_enabled", false);
  settings.slotMarketBeta = getBoolSetting("slot_market_beta", false);
  settings.snipingMarketBeta = getBoolSetting("sniping_market_beta", false);
  settings.itemMarketBeta = getBoolSetting("item_market_beta", false);
  settings.mapMarketBeta = getBoolSetting("map_market_beta", false);
  settings.versionAlertEnabled = getBoolSetting("version_alert_enabled", false);
  settings.slotMarketEnabled = getBoolSetting("slot_market_enabled", true);
  settings.snipingMarketEnabled = getBoolSetting("sniping_market_enabled", true);
  settings.itemMarketEnabled = getBoolSetting("item_market_enabled", true);
  settings.mapMarketEnabled = getBoolSetting("map_market_enabled", true);
  settings.riskCheckTimeoutSeconds = getIntSetting("risk_check_timeout_seconds", RISK_CHECK_TIMEOUT_SECONDS);
  const vm = getSetting("verification_method");
  if (vm === "service_account" || vm === "proxy_user") settings.verificationMethod = vm;
  // Rate limits (stored as integers: burst = tokens, rate = tokens per 10 seconds)
  loadRateLimitSettings();

  // Onboarding step enabled/disabled (per-step)
  loadOnboardingStepSettings();

  console.log(`[settings] loaded: closedBetaEnabled=${settings.closedBetaEnabled}, xhrLoggingEnabled=${settings.xhrLoggingEnabled}`);
}

export function getSettings(): Readonly<ServerSettings> {
  return settings;
}

export function setAllowAnyGoalCount(value: boolean): void {
  settings.allowAnyGoalCount = value;
}

export function isClosedBetaEnabled(): boolean {
  return settings.closedBetaEnabled;
}

export function setClosedBetaEnabled(value: boolean): void {
  settings.closedBetaEnabled = value;
  setBoolSetting("closed_beta_enabled", value);
}

export function setXhrLoggingEnabled(value: boolean): void {
  settings.xhrLoggingEnabled = value;
  setBoolSetting("xhr_logging_enabled", value);
}

export function isXhrLoggingEnabled(): boolean {
  return settings.xhrLoggingEnabled;
}

export function isVersionAlertEnabled(): boolean {
  return settings.versionAlertEnabled;
}

export function setVersionAlertEnabled(value: boolean): void {
  settings.versionAlertEnabled = value;
  setBoolSetting("version_alert_enabled", value);
}

const marketBetaKeys: Record<MarketType, keyof ServerSettings> = {
  slots: "slotMarketBeta",
  sniping: "snipingMarketBeta",
  items: "itemMarketBeta",
  maps: "mapMarketBeta",
};

const marketBetaDbKeys: Record<MarketType, string> = {
  slots: "slot_market_beta",
  sniping: "sniping_market_beta",
  items: "item_market_beta",
  maps: "map_market_beta",
};

export function getMarketBetaConfig(): { slots: boolean; sniping: boolean; items: boolean; maps: boolean } {
  return {
    slots: settings.slotMarketBeta,
    sniping: settings.snipingMarketBeta,
    items: settings.itemMarketBeta,
    maps: settings.mapMarketBeta,
  };
}

export function isMarketBeta(market: MarketType): boolean {
  return settings[marketBetaKeys[market]] as boolean;
}

export function setMarketBeta(market: MarketType, value: boolean): void {
  const key = marketBetaKeys[market];
  (settings as any)[key] = value;
  setBoolSetting(marketBetaDbKeys[market], value);
}

const marketEnabledKeys: Record<MarketType, keyof ServerSettings> = {
  slots: "slotMarketEnabled",
  sniping: "snipingMarketEnabled",
  items: "itemMarketEnabled",
  maps: "mapMarketEnabled",
};

const marketEnabledDbKeys: Record<MarketType, string> = {
  slots: "slot_market_enabled",
  sniping: "sniping_market_enabled",
  items: "item_market_enabled",
  maps: "map_market_enabled",
};

export function getMarketEnabledConfig(): { slots: boolean; sniping: boolean; items: boolean; maps: boolean } {
  return {
    slots: settings.slotMarketEnabled,
    sniping: settings.snipingMarketEnabled,
    items: settings.itemMarketEnabled,
    maps: settings.mapMarketEnabled,
  };
}

export function isMarketEnabled(market: MarketType): boolean {
  return settings[marketEnabledKeys[market]] as boolean;
}

export function setMarketEnabled(market: MarketType, value: boolean): void {
  const key = marketEnabledKeys[market];
  (settings as any)[key] = value;
  setBoolSetting(marketEnabledDbKeys[market], value);
}

export function getRiskCheckTimeoutSeconds(): number {
  return settings.riskCheckTimeoutSeconds;
}

export function setRiskCheckTimeoutSeconds(seconds: number): void {
  const clamped = Math.max(10, Math.min(300, Math.round(seconds)));
  settings.riskCheckTimeoutSeconds = clamped;
  setIntSetting("risk_check_timeout_seconds", clamped);
}

export function getVerificationMethod(): VerificationMethod {
  return settings.verificationMethod;
}

export function setVerificationMethod(method: VerificationMethod): void {
  settings.verificationMethod = method;
  setSetting("verification_method", method);
}

const RL_KEYS = {
  wsGeneral: { burst: "rl_ws_general_burst", rate: "rl_ws_general_rate" },
  wsMutation: { burst: "rl_ws_mutation_burst", rate: "rl_ws_mutation_rate" },
  wsMatcher: { burst: "rl_ws_matcher_burst", rate: "rl_ws_matcher_rate" },
  httpAuth: { burst: "rl_http_auth_burst", rate: "rl_http_auth_rate" },
  httpApi: { burst: "rl_http_api_burst", rate: "rl_http_api_rate" },
} as const;

const RL_DEFAULTS = {
  wsGeneral: { burst: 60, rate: 100 },   // 100/10s = 10/sec
  wsMutation: { burst: 20, rate: 20 },   // 20/10s = 2/sec
  wsMatcher: { burst: 10, rate: 10 },    // 10/10s = 1/sec
  httpAuth: { burst: 5, rate: 1 },       // 1/10s = 0.1/sec
  httpApi: { burst: 30, rate: 50 },      // 50/10s = 5/sec
} as const;

function loadRateLimitSettings(): void {
  const partial: Partial<RateLimitConfig> = {};
  for (const [key, dbKeys] of Object.entries(RL_KEYS)) {
    const k = key as keyof typeof RL_DEFAULTS;
    const burst = getIntSetting(dbKeys.burst, RL_DEFAULTS[k].burst);
    const ratePer10s = getIntSetting(dbKeys.rate, RL_DEFAULTS[k].rate);
    partial[k] = { maxTokens: burst, refillRate: ratePer10s / 10 };
  }
  updateRateLimitConfig(partial);
}

export function getRateLimitSettings(): Record<string, { burst: number; rate: number }> {
  const cfg = getRateLimitConfig();
  return {
    wsGeneral: { burst: cfg.wsGeneral.maxTokens, rate: Math.round(cfg.wsGeneral.refillRate * 10) },
    wsMutation: { burst: cfg.wsMutation.maxTokens, rate: Math.round(cfg.wsMutation.refillRate * 10) },
    wsMatcher: { burst: cfg.wsMatcher.maxTokens, rate: Math.round(cfg.wsMatcher.refillRate * 10) },
    httpAuth: { burst: cfg.httpAuth.maxTokens, rate: Math.round(cfg.httpAuth.refillRate * 10) },
    httpApi: { burst: cfg.httpApi.maxTokens, rate: Math.round(cfg.httpApi.refillRate * 10) },
  };
}

export function setRateLimitSettings(updates: Record<string, { burst: number; rate: number }>): void {
  const partial: Partial<RateLimitConfig> = {};
  for (const [key, value] of Object.entries(updates)) {
    const k = key as keyof typeof RL_KEYS;
    if (!RL_KEYS[k]) continue;
    const burst = Math.max(1, Math.round(value.burst));
    const ratePer10s = Math.max(1, Math.round(value.rate));
    setIntSetting(RL_KEYS[k].burst, burst);
    setIntSetting(RL_KEYS[k].rate, ratePer10s);
    partial[k] = { maxTokens: burst, refillRate: ratePer10s / 10 };
  }
  updateRateLimitConfig(partial);
}

export function verboseLog(tag: string, ...args: any[]): void {
  if (settings.xhrLoggingEnabled) {
    console.log(`[${tag}]`, ...args);
  }
}

const onboardingStepEnabled = new Map<string, boolean>();

function loadOnboardingStepSettings(): void {
  for (const step of ONBOARDING_STEPS) {
    const enabled = getBoolSetting(`onboarding_step_${step.id}`, true);
    onboardingStepEnabled.set(step.id, enabled);
  }
}

export function getOnboardingStepEnabled(stepId: string): boolean {
  return onboardingStepEnabled.get(stepId) ?? true;
}

export function setOnboardingStepEnabled(stepId: string, enabled: boolean): void {
  onboardingStepEnabled.set(stepId, enabled);
  setBoolSetting(`onboarding_step_${stepId}`, enabled);
}

export function getEnabledOnboardingSteps(): string[] {
  return ONBOARDING_STEPS
    .filter((step) => getOnboardingStepEnabled(step.id))
    .map((step) => step.id);
}

export function getOnboardingStepConfigs(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const step of ONBOARDING_STEPS) {
    result[step.id] = getOnboardingStepEnabled(step.id);
  }
  return result;
}

import { getUserRankId } from "./db/queries/users.js";

const adminRankOverrides = new Map<number, number>();

export function getAdminRankOverride(userId: number): number | null {
  return adminRankOverrides.get(userId) ?? null;
}

export function setAdminRankOverride(userId: number, rankId: number | null): void {
  if (rankId == null) {
    adminRankOverrides.delete(userId);
  } else {
    adminRankOverrides.set(userId, rankId);
  }
}

/**
 * Get the effective rank ID for a user: admin override first, then DB.
 * Used everywhere rank checks are needed (order validation, sniping matcher).
 */
export function getEffectiveRankId(userId: number): number | null {
  return adminRankOverrides.get(userId) ?? getUserRankId(userId);
}
