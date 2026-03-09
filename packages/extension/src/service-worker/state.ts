import type { MHPlayerIdentity, MHActiveMap, MapType, MapTypeStats, NotificationPrefs, OnboardingTask } from "@mhcm/shared";
import { DEFAULT_NOTIFICATION_PREFS } from "@mhcm/shared";

/** Tracked sniping transaction for auto-catch detection (mice) or auto-find detection (items). */
export interface TrackedSnipingTransaction {
  id: number;
  mhMapId: number;
  /** The sniper's MH sn_user_id – only their catches/finds count. */
  sniperSnUserId: string;
  /** 'mouse' for mouse sniping, 'item' for item sniping. */
  goalType: "mouse" | "item";
  /** Target goal IDs (mouseTypeIds for mice, itemTypeIds for items). */
  targetGoalIds: number[];
  /** Goal IDs already reported as completed (to avoid duplicates). */
  reportedCompletedIds: Set<number>;
}

/** Tracked maptain-side sniping transaction for detecting sniper goals/departures. */
export interface TrackedMaptainTransaction {
  id: number;
  mhMapId: number;
  sniperSnUserId: string;
  goalType: "mouse" | "item";
  targetGoalIds: number[];
  reportedCompletedIds: Set<number>;
  reportedDeparture: boolean;
}

export interface ServiceWorkerState {
  /** JWT token for the marketplace server. */
  authToken: string | null;
  /** Whether the WebSocket is connected. */
  wsConnected: boolean;
  /** Cached player identity from the content script. */
  playerIdentity: MHPlayerIdentity | null;
  /** Tab ID of the active mousehuntgame.com tab. */
  gameTabId: number | null;
  /** Cached SB balance from the content script. */
  sbBalance: number | null;
  /** Cached map types from the server (sent to panel on open). */
  cachedMapTypes: MapType[] | null;
  /** Cached map type stats from the server (sent to panel on open). */
  cachedMapTypeStats: Record<string, MapTypeStats> | null;
  /** Cached active maps from the content script (detected + enriched). */
  cachedActiveMaps: MHActiveMap[];
  /** Timestamp of last user interaction with MH tab. */
  lastUserActivity: number;
  /** Whether the user is currently AFK (no interaction for 60 min). */
  isAfk: boolean;
  /** User notification preferences (synced from server). */
  notificationPrefs: NotificationPrefs;
  /** Map IDs for which we've already sent a "map full" notification. */
  notifiedMapIds: Set<number>;
  /** Active sniping transactions being tracked for catch detection (sniper-side, keyed by txn ID). */
  trackedSnipingTxns: Map<number, TrackedSnipingTransaction>;
  /** Active sniping transactions being tracked for maptain-side goal/departure detection (keyed by txn ID). */
  trackedMaptainTxns: Map<number, TrackedMaptainTransaction>;
  /** Per-map timestamp of last catch data received (from XHR interception or proactive refresh). */
  lastCatchDataByMap: Map<number, number>;
  /** Interval timer for catch staleness polling (runs while transactions are being tracked). */
  catchStalenessTimer: ReturnType<typeof setInterval> | null;

  // Reconnection validation state
  /** Whether sell order validation is in progress (buffering maps_removed). */
  sellOrderValidationPending: boolean;
  /** Timeout for manual validation trigger. */
  sellOrderValidationTimeout: ReturnType<typeof setTimeout> | null;
  /** Buffered map IDs to remove after validation. */
  pendingMapsRemoved: number[];
  /** Cached orders from server (needed for validation). */
  myOrders: any[];
  /** Whether the server has XHR diagnostic logging enabled. */
  xhrLoggingEnabled: boolean;
  /** Cached MH game settings (null = not yet checked). */
  gameSettings: { allowMapInvites: boolean; allowAnonymousSupplyTransfers: boolean; utcOffset: number } | null;
  /** Cached market beta config from server (replayed to panel on open). */
  cachedMarketBetaConfig: { slots: boolean; sniping: boolean; items: boolean; maps: boolean } | null;
  /** Cached market enabled config from server (replayed to panel on open). */
  cachedMarketEnabledConfig: { slots: boolean; sniping: boolean; items: boolean; maps: boolean } | null;
  /** Cached beta tester status for current user (replayed to panel on open). */
  cachedBetaTesterStatus: { isBetaTester: boolean; hasPendingRequest: boolean } | null;
  /** Sniping transaction cache for notification derivation (previous state + role IDs). */
  snipingTxnCache: Map<number, { prevState: string; sniperSnUserId: string; maptainSnUserId: string }>;
  /** Map IDs for which we've already sent a "map completed" notification. */
  notifiedCompletedMapIds: Set<number>;
  /** Cached sniping payment grace messages (replayed to panel on open). */
  cachedSnipingPaymentGrace: Array<{ transactionId: number; requiredAmount: number; reportedBalance: number; graceExpiresAt: string }>;
  /** Player's MH title/rank ID (from game API). */
  playerTitleId: number | null;
  /** Player's MH title/rank name (from game API). */
  playerTitleName: string | null;
  /** Cached onboarding status from server (replayed to panel on open). */
  cachedOnboardingStatus: { complete: boolean; tasks: OnboardingTask[] } | null;
  /** Cached RT manual confirm prompt from server (replayed to panel on open). */
  cachedRtConfirmPrompt: { transactionId: number; sellerSnUserId: string; sellerUsername: string } | null;
  /** Cached drain progress from server (replayed to admin panel on open). */
  cachedDrainProgress: { draining: boolean; remaining: number; elapsed: number } | null;
}

const state: ServiceWorkerState = {
  authToken: null,
  wsConnected: false,
  playerIdentity: null,
  gameTabId: null,
  sbBalance: null,
  cachedMapTypes: null,
  cachedMapTypeStats: null,
  cachedActiveMaps: [],
  lastUserActivity: Date.now(),
  isAfk: false,
  notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
  notifiedMapIds: new Set(),
  trackedSnipingTxns: new Map(),
  trackedMaptainTxns: new Map(),
  lastCatchDataByMap: new Map(),
  catchStalenessTimer: null,
  // Reconnection validation state
  sellOrderValidationPending: false,
  sellOrderValidationTimeout: null,
  pendingMapsRemoved: [],
  myOrders: [],
  xhrLoggingEnabled: false,
  gameSettings: null,
  cachedMarketBetaConfig: null,
  cachedMarketEnabledConfig: null,
  cachedBetaTesterStatus: null,
  snipingTxnCache: new Map(),
  notifiedCompletedMapIds: new Set(),
  cachedSnipingPaymentGrace: [],
  playerTitleId: null,
  playerTitleName: null,
  cachedOnboardingStatus: null,
  cachedRtConfirmPrompt: null,
  cachedDrainProgress: null,
};

export function getState(): Readonly<ServiceWorkerState> {
  return state;
}

export function setAuthToken(token: string | null): void {
  state.authToken = token;
  if (token) {
    chrome.storage.local.set({ mhcm_auth_token: token });
  } else {
    chrome.storage.local.remove("mhcm_auth_token");
  }
}

export function setWsConnected(connected: boolean): void {
  state.wsConnected = connected;
  if (!connected) {
    // Server restarted or disconnected – drain is no longer relevant
    state.cachedDrainProgress = null;
  }
}

export function setPlayerIdentity(identity: MHPlayerIdentity | null): void {
  state.playerIdentity = identity;
  if (identity) {
    chrome.storage.local.set({ mhcm_player_identity: identity });
  }
}

export function setGameTabId(tabId: number | null): void {
  state.gameTabId = tabId;
  if (tabId != null) {
    chrome.storage.local.set({ mhcm_game_tab_id: tabId });
  }
}

export function setSBBalance(balance: number | null): void {
  state.sbBalance = balance;
}

export function setCachedMapTypes(mapTypes: MapType[], stats?: Record<string, MapTypeStats>): void {
  state.cachedMapTypes = mapTypes;
  if (stats) {
    state.cachedMapTypeStats = stats;
  }
}

export function setCachedActiveMaps(maps: MHActiveMap[]): void {
  state.cachedActiveMaps = maps;
}

export function setLastUserActivity(timestamp: number): void {
  state.lastUserActivity = timestamp;
}

export function setIsAfk(isAfk: boolean): void {
  state.isAfk = isAfk;
}

export function setNotificationPrefs(prefs: NotificationPrefs): void {
  state.notificationPrefs = prefs;
}

export function addNotifiedMapId(mapId: number): void {
  state.notifiedMapIds.add(mapId);
  // Persist to storage to survive service worker restarts
  chrome.storage.local.set({ mhcm_notified_map_ids: [...state.notifiedMapIds] });
}

export function addTrackedSnipingTxn(txn: TrackedSnipingTransaction): void {
  state.trackedSnipingTxns.set(txn.id, txn);
}

export function removeTrackedSnipingTxn(txnId: number): void {
  state.trackedSnipingTxns.delete(txnId);
}

export function addTrackedMaptainTxn(txn: TrackedMaptainTransaction): void {
  state.trackedMaptainTxns.set(txn.id, txn);
}

export function removeTrackedMaptainTxn(txnId: number): void {
  state.trackedMaptainTxns.delete(txnId);
}

export function touchCatchDataTimestamp(mapId: number): void {
  state.lastCatchDataByMap.set(mapId, Date.now());
}

export function setCatchStalenessTimer(timer: ReturnType<typeof setInterval> | null): void {
  if (state.catchStalenessTimer) {
    clearInterval(state.catchStalenessTimer);
  }
  state.catchStalenessTimer = timer;
}

// Reconnection validation state setters

export function setMyOrders(orders: any[]): void {
  state.myOrders = orders;
}

export function setSellOrderValidationPending(pending: boolean): void {
  state.sellOrderValidationPending = pending;
}

export function clearSellOrderValidationTimeout(): void {
  if (state.sellOrderValidationTimeout) {
    clearTimeout(state.sellOrderValidationTimeout);
    state.sellOrderValidationTimeout = null;
  }
}

export function setSellOrderValidationTimeout(timeout: ReturnType<typeof setTimeout>): void {
  if (state.sellOrderValidationTimeout) clearTimeout(state.sellOrderValidationTimeout);
  state.sellOrderValidationTimeout = timeout;
}

export function addPendingMapsRemoved(mapIds: number[]): void {
  state.pendingMapsRemoved.push(...mapIds);
}

export function clearPendingMapsRemoved(): number[] {
  const pending = [...state.pendingMapsRemoved];
  state.pendingMapsRemoved = [];
  return pending;
}

export function setXhrLoggingEnabled(enabled: boolean): void {
  state.xhrLoggingEnabled = enabled;
}

export function setGameSettings(settings: { allowMapInvites: boolean; allowAnonymousSupplyTransfers: boolean; utcOffset: number } | null): void {
  state.gameSettings = settings;
}

export function setCachedMarketBetaConfig(config: { slots: boolean; sniping: boolean; items: boolean; maps: boolean }): void {
  state.cachedMarketBetaConfig = config;
}

export function setCachedMarketEnabledConfig(config: { slots: boolean; sniping: boolean; items: boolean; maps: boolean }): void {
  state.cachedMarketEnabledConfig = config;
}

export function setCachedBetaTesterStatus(status: { isBetaTester: boolean; hasPendingRequest: boolean }): void {
  state.cachedBetaTesterStatus = status;
}

export function updateSnipingTxnCache(
  txnId: number,
  entry: { prevState: string; sniperSnUserId: string; maptainSnUserId: string },
): void {
  state.snipingTxnCache.set(txnId, entry);
}

export function removeSnipingTxnCache(txnId: number): void {
  state.snipingTxnCache.delete(txnId);
}

export function addNotifiedCompletedMapId(mapId: number): void {
  state.notifiedCompletedMapIds.add(mapId);
}

export function setCachedOnboardingStatus(status: { complete: boolean; tasks: OnboardingTask[] }): void {
  state.cachedOnboardingStatus = status;
}

export function setCachedRtConfirmPrompt(prompt: { transactionId: number; sellerSnUserId: string; sellerUsername: string } | null): void {
  state.cachedRtConfirmPrompt = prompt;
}

export function setCachedDrainProgress(progress: { draining: boolean; remaining: number; elapsed: number } | null): void {
  state.cachedDrainProgress = progress;
}

export function setPlayerTitleId(titleId: number, titleName?: string): void {
  state.playerTitleId = titleId;
  if (titleName !== undefined) {
    state.playerTitleName = titleName;
  }
}

export function verboseLog(tag: string, ...args: any[]): void {
  if (state.xhrLoggingEnabled) {
    console.log(`[${tag}]`, ...args);
  }
}

export async function restoreState(): Promise<void> {
  const data = await chrome.storage.local.get([
    "mhcm_auth_token",
    "mhcm_player_identity",
    "mhcm_game_tab_id",
    "mhcm_notified_map_ids",
  ]);
  if (data.mhcm_auth_token) {
    state.authToken = data.mhcm_auth_token;
  }
  if (data.mhcm_player_identity) {
    state.playerIdentity = data.mhcm_player_identity;
  }
  if (data.mhcm_game_tab_id != null) {
    state.gameTabId = data.mhcm_game_tab_id;
  }
  if (Array.isArray(data.mhcm_notified_map_ids)) {
    state.notifiedMapIds = new Set(data.mhcm_notified_map_ids);
  }
}
