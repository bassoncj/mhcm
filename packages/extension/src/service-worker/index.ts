import type { ServerMessage, SlotTransactionStepType, SnipingStepType, ItemStepType, MHActiveMap, NotificationPrefs, VerificationType } from "@mhcm/shared";
import { MH_SB_ITEM_TYPE, formatItemPrice } from "@mhcm/shared";
import { MHCM_VERSION } from "../shared/constants.js";
import type {
  ContentToWorkerMessage,
  ExecuteApiCallMessage,
  GameApiMethod,
  PanelToWorkerMessage,
} from "../shared/messaging.js";
import {
  getState,
  restoreState,
  setAuthToken,
  setGameTabId,
  setPlayerIdentity,
  setSBBalance,
  setCachedMapTypes,
  setCachedActiveMaps,
  setLastUserActivity,
  setIsAfk,
  setNotificationPrefs,
  addNotifiedMapId,
  addTrackedSnipingTxn,
  removeTrackedSnipingTxn,
  setMyOrders,
  setSellOrderValidationPending,
  clearSellOrderValidationTimeout,
  setSellOrderValidationTimeout,
  addPendingMapsRemoved,
  clearPendingMapsRemoved,
  touchCatchDataTimestamp,
  setCatchStalenessTimer,
  setXhrLoggingEnabled,
  setGameSettings,
  setCachedMarketBetaConfig,
  setCachedMarketEnabledConfig,
  setCachedBetaTesterStatus,
  setCachedOnboardingStatus,
  setCachedRtConfirmPrompt,
  setCachedDrainProgress,
  updateSnipingTxnCache,
  removeSnipingTxnCache,
  addNotifiedCompletedMapId,
  setPlayerTitleId,
  verboseLog,
} from "./state.js";
import { connect, disconnect, send, setMessageHandler, setConnectionChangeHandler, setAuthFailureHandler } from "./ws-client.js";

async function migrateStorageKeys(): Promise<void> {
  const OLD_TO_NEW: Record<string, string> = {
    mhm_server_url: "mhcm_server_url",
    mhm_auth_token: "mhcm_auth_token",
    mhm_auth_user: "mhcm_auth_user",
    mhm_auth_mh_account: "mhcm_auth_mh_account",
    mhm_player_identity: "mhcm_player_identity",
    mhm_game_tab_id: "mhcm_game_tab_id",
    mhm_notified_map_ids: "mhcm_notified_map_ids",
    mhm_theme: "mhcm_theme",
    mhm_panel_visible: "mhcm_panel_visible",
    mhm_panel_pinned: "mhcm_panel_pinned",
  };
  const oldKeys = Object.keys(OLD_TO_NEW);
  const data = await chrome.storage.local.get(oldKeys);
  if (Object.keys(data).length === 0) return; // already migrated or fresh install
  const newData: Record<string, unknown> = {};
  for (const [oldKey, newKey] of Object.entries(OLD_TO_NEW)) {
    if (data[oldKey] !== undefined) newData[newKey] = data[oldKey];
  }
  await chrome.storage.local.set(newData);
  await chrome.storage.local.remove(oldKeys);
  console.log("[mhcm] migrated storage keys from mhm_ to mhcm_");
}

const stateReady = migrateStorageKeys().then(restoreState).then(() => {
  const { authToken } = getState();
  if (authToken) {
    connect();
  }
  console.log("[mhcm] service worker started");
});

setConnectionChangeHandler((connected) => {
  broadcastRawToPanel({
    type: "connection_status",
    payload: { connected },
  });

  if (connected) {
    send({
      type: "report_version",
      payload: {
        version: MHCM_VERSION,
        titleId: getState().playerTitleId ?? undefined,
      },
    });

    // Always re-send cached active maps so the server clears mapsUnreported.
    // Must send even when empty – otherwise users with no maps stay in mapsUnreported
    // forever and get blocked from matching as buyers.
    const cachedMaps = getState().cachedActiveMaps;
    send({
      type: "update_active_maps",
      payload: { maps: cachedMaps.map((m) => ({ mapId: m.map_id, mapClass: m.map_class })) },
    });

    // Start validation immediately on connect - buffer maps_removed until we know
    // whether user has sell orders (we'll find out when my_orders arrives)
    setSellOrderValidationPending(true);
    console.log("[mhcm] connection up - starting validation grace period");

    // Fetch game settings if identity is already known (handles WS-reconnect case)
    if (getState().playerIdentity?.uniqueHash) {
      setGameSettings(null); // Reset so we re-check
      fetchGameSettings();
    }
  } else {
    // Clear validation state on disconnect so it starts fresh on reconnect
    clearSellOrderValidationTimeout();
    setSellOrderValidationPending(false);
    clearPendingMapsRemoved();
    setMyOrders([]);
    setGameSettings(null);
    reportedMapTypeKeys.clear();

    // Clear drain progress – server restarted, drain is over
    if (getState().cachedDrainProgress) {
      setCachedDrainProgress(null);
      broadcastToPanel({ type: "admin_drain_progress", payload: { draining: false, remaining: 0, elapsed: 0 } });
    }
  }
});

setAuthFailureHandler((reason) => {
  console.log("[mhcm] auth failure:", reason);
  setAuthToken(null);
  broadcastRawToPanel({ type: "auth_expired", payload: { reason } });
});

const mhTabIds = new Set<number>();

chrome.runtime.onInstalled.addListener((details) => {
  // On "install": tabs have no scripts yet, reload injects them via manifest.
  // On "update" (includes dev reload): old scripts' chrome.runtime is invalidated,
  //   reload replaces them with working copies.
  // On "chrome_update": our extension code hasn't changed, scripts are fine, skip.
  if (details.reason === "install" || details.reason === "update") {
    chrome.tabs.query({ url: "https://www.mousehuntgame.com/*" }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id != null) chrome.tabs.reload(tab.id);
      }
    });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, {
    source: "mhcm-service-worker",
    type: "toggle_panel",
  }).catch(() => {}); // non-MH tab – no content script
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (mhTabIds.has(tabId)) {
    setGameTabId(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  mhTabIds.delete(tabId);
  if (getState().gameTabId === tabId) {
    // Fall back to another known MH tab, or null if none remain
    const fallback = mhTabIds.size > 0 ? mhTabIds.values().next().value! : null;
    setGameTabId(fallback);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.mhcm_auth_token) return;

  const newToken = changes.mhcm_auth_token.newValue ?? null;
  const oldToken = getState().authToken;

  if (newToken === oldToken) return;

  setAuthToken(newToken);

  if (newToken) {
    console.log("[mhcm] auth token updated, connecting WebSocket");
    disconnect(); // Close stale connection if any
    connect();
  } else {
    console.log("[mhcm] auth token removed, disconnecting WebSocket");
    disconnect();
  }
});

chrome.alarms.create("mhcm-keepalive", { periodInMinutes: 0.5 });

chrome.alarms.create("mhcm-afk-check", { periodInMinutes: 1 });

const AFK_THRESHOLD_MS = 60 * 60 * 1000;  // 60 minutes
const AFK_WARNING_MS = 55 * 60 * 1000;    // 55 minutes (5 min before AFK)

let afkWarningShown = false;

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "mhcm-keepalive") {
    // Just waking up is enough to keep the worker alive
  }
  if (alarm.name === "mhcm-afk-check") {
    checkAfkStatus();
  }
});

function handleUserInteraction(timestamp: number): void {
  setLastUserActivity(timestamp);

  const state = getState();
  if (state.isAfk) {
    // User returned from AFK
    setIsAfk(false);
    afkWarningShown = false;
    console.log("[mhcm] user returned from AFK");

    // Notify server
    if (state.wsConnected) {
      send({ type: "user_active" });
    }

    // Notify panel
    broadcastRawToPanel({
      type: "afk_status",
      payload: { isAfk: false, warning: false },
    });

    // Clear any lingering notifications
    chrome.notifications.clear("mhcm-afk-warning");
    chrome.notifications.clear("mhcm-afk");
  } else if (afkWarningShown) {
    // User became active before going AFK - clear warning state
    afkWarningShown = false;
    chrome.notifications.clear("mhcm-afk-warning");
    broadcastRawToPanel({
      type: "afk_status",
      payload: { isAfk: false, warning: false },
    });
  }
}

function checkAfkStatus(): void {
  const state = getState();
  const elapsed = Date.now() - state.lastUserActivity;

  if (!state.isAfk && elapsed > AFK_THRESHOLD_MS) {
    // User went AFK
    setIsAfk(true);
    afkWarningShown = false;
    console.log("[mhcm] user went AFK (no interaction for 60 minutes)");

    // Notify server
    if (state.wsConnected) {
      send({ type: "user_afk" });
    }

    // Notify panel
    broadcastRawToPanel({
      type: "afk_status",
      payload: { isAfk: true, warning: false },
    });

    // Show browser notification (if enabled)
    chrome.notifications.clear("mhcm-afk-warning");
    if (shouldNotify("afk")) {
      showNotification("mhcm-afk", "Community Marketplace - AFK", "Your orders are paused. Click in the MouseHunt tab to resume.");
    }
  } else if (!state.isAfk && elapsed > AFK_WARNING_MS && !afkWarningShown) {
    // 5-minute warning before AFK (only show once)
    afkWarningShown = true;

    broadcastRawToPanel({
      type: "afk_status",
      payload: { isAfk: false, warning: true },
    });

    // Show browser notification (if enabled)
    if (shouldNotify("afk_warning")) {
      showNotification("mhcm-afk-warning", "Community Marketplace", "You'll go AFK in 5 minutes. Interact with MouseHunt to stay active.");
    }
  }
}

async function fetchGameSettings(): Promise<void> {
  const uh = getState().playerIdentity?.uniqueHash;
  if (!uh) return;

  try {
    const result = await executeApiViaContentScript("fetchPreferencesPage", [uh]);
    if (!result.success || !result.data) {
      console.warn("[mhcm] failed to fetch game settings:", result.error);
      return;
    }

    const settings = {
      allowMapInvites: !!result.data.allow_map_invites,
      allowAnonymousSupplyTransfers: !!result.data.allow_anonymous_supply_transfers,
      utcOffset: (result.data.utc_offset as number) ?? 0,
    };
    setGameSettings(settings);

    // Report to server
    if (getState().wsConnected) {
      send({ type: "report_game_settings", payload: settings });
    }

    // Broadcast to panel
    const valid = settings.allowMapInvites && settings.allowAnonymousSupplyTransfers;
    broadcastRawToPanel({
      type: "game_settings",
      payload: { valid, ...settings },
    });

    console.log(`[mhcm] game settings: mapInvites=${settings.allowMapInvites}, supplyTransfers=${settings.allowAnonymousSupplyTransfers} (valid=${valid})`);
  } catch (err) {
    console.warn("[mhcm] failed to fetch game settings:", err);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Content script messages
  if (message?.type === "game_state_update") {
    handleGameStateUpdate(message as ContentToWorkerMessage, sender);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "user_interaction") {
    handleUserInteraction(message.payload.timestamp);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "xhr_log") {
    if (getState().xhrLoggingEnabled) {
      // Skip oversized payloads to avoid WS max-payload disconnect loops
      const raw = JSON.stringify(message.payload);
      if (raw.length <= 900_000) {
        send({ type: "xhr_log", payload: message.payload });
      } else {
        console.warn(`[mhcm] xhr_log skipped: payload too large (${(raw.length / 1024).toFixed(0)} KB)`);
      }
    }
    sendResponse({ ok: true });
    return false;
  }

  // Panel messages
  if (message?.type === "panel_ready" || message?.type === "get_connection_status" || message?.type === "get_game_state" || message?.type === "refresh_game_state" || message?.type === "ws_send" || message?.type === "execute_api_via_content" || message?.type === "navigate_url" || message?.type === "recheck_game_settings") {
    // Wait for state restoration before responding (handles race on startup)
    stateReady.then(() => handlePanelMessage(message as PanelToWorkerMessage, sendResponse));
    return true; // async response
  }

  return false;
});

function handleGameStateUpdate(
  message: ContentToWorkerMessage,
  sender: chrome.runtime.MessageSender
): void {
  if (message.type !== "game_state_update") return;

  const { payload } = message;
  if (payload.type === "identity") {
    const identity = {
      userId: payload.userId,
      snUserId: payload.snUserId,
      uniqueHash: payload.uniqueHash,
      email: payload.email ?? undefined,
    };
    setPlayerIdentity(identity);
    setGameTabId(sender.tab?.id ?? null);
    if (typeof payload.titleId === "number" && payload.titleId > 0) {
      setPlayerTitleId(payload.titleId, payload.titleName ?? undefined);
    }
    console.log("[mhcm] player identity updated:", payload.userId);

    // Track this tab as having a MH content script
    if (sender.tab?.id != null) {
      mhTabIds.add(sender.tab.id);

      // Forward XHR logging state now that we have a valid game tab.
      // The xhr_logging_state from WS connect may have been lost if gameTabId
      // was null/stale at that time – resend it now.
      if (getState().xhrLoggingEnabled) {
        verboseLog("snipe-sw", `IDENTITY: forwarding xhrLoggingEnabled=true to tab ${sender.tab.id}`);
        chrome.tabs.sendMessage(sender.tab.id, {
          source: "mhcm-service-worker",
          type: "xhr_logging_state",
          payload: { enabled: true },
        }).catch(() => {});
      }
    }

    // Broadcast to panel so it can update UI immediately
    broadcastRawToPanel({
      type: "game_state",
      payload: { playerIdentity: identity },
    });

    // Fetch game settings if WS is connected and settings haven't been checked yet
    if (getState().wsConnected && getState().gameSettings === null) {
      fetchGameSettings();
    }

  } else if (payload.type === "sb_balance") {
    setSBBalance(payload.balance);
    // Forward to panel
    broadcastRawToPanel({
      type: "game_state",
      payload: { sbBalance: payload.balance },
    });
    // Trigger buy order balance validation if we have orders
    if (getState().myOrders.length > 0) {
      validateBuyOrdersBalance();
    }
  } else if (payload.type === "map_discovered") {
    // If we're waiting for validation, a natural treasuremap_v2.php interception means
    // we now have authoritative ownership data - complete validation early
    if (getState().sellOrderValidationPending) {
      console.log("[mhcm] natural treasuremap_v2.php received - completing validation early");
      clearSellOrderValidationTimeout();
      completeSellOrderValidation();
    }

    // Report to server for catalog auto-discovery (deduplicate per session)
    const reportKey = `${payload.quality}:${payload.rewardType}:${payload.isScavengerHunt ? "item" : "mouse"}`;
    if (!reportedMapTypeKeys.has(reportKey) && getState().wsConnected) {
      reportedMapTypeKeys.add(reportKey);
      console.log("[mhcm] map discovered:", payload.mapType, payload.quality, payload.rewardType);
      send({
        type: "report_map_types",
        payload: {
          mapTypes: [
            {
              quality: payload.quality,
              name: payload.name,
              maxHunters: payload.maxHunters,
              rewardType: payload.rewardType || undefined,
              thumbnail: payload.thumbnail || undefined,
              mapClass: payload.mapClass || undefined,
              isScavengerHunt: payload.isScavengerHunt || undefined,
              minTitleName: payload.minTitleName || undefined,
            },
          ],
        },
      });
    }
    // Also merge enriched data into cached active maps if we have a matching map_id
    const cached = getState().cachedActiveMaps;
    const idx = cached.findIndex((m) => m.map_id === payload.mapId);
    if (idx >= 0) {
      // Detect ownership loss (e.g. maptain transferred ownership).
      // Cancel sell orders referencing this map since they're no longer valid.
      const existing = cached[idx];
      if (existing.is_owner === true && !payload.isOwner && getState().wsConnected) {
        console.log("[mhcm] ownership lost for map", payload.mapId, "- sending maps_removed");
        send({ type: "maps_removed", payload: { mapIds: [payload.mapId] } });
      }

      const updated = [...cached];
      updated[idx] = {
        ...updated[idx],
        map_type: payload.mapType,
        quality: payload.quality,
        is_owner: payload.isOwner,
        max_hunters: payload.maxHunters,
        goalType: payload.isScavengerHunt ? "item" : "mouse",
        reward_type: payload.rewardType || undefined,
      };
      setCachedActiveMaps(updated);
      broadcastRawToPanel({
        type: "game_state",
        payload: { activeMaps: updated },
      });
    }
  } else if (payload.type === "active_maps_detected") {
    handleActiveMapsDetected(payload.maps);
  } else if (payload.type === "catches_detected") {
    handleCatchesDetected(payload.mapId, payload.goalType, payload.hunterCatches);
    // Update remaining_goals: remove goals completed by any hunter
    const cached = [...getState().cachedActiveMaps];
    const mapIdx = cached.findIndex((m) => m.map_id === payload.mapId);
    if (mapIdx !== -1 && cached[mapIdx].remaining_goals) {
      const allCompleted = new Set<number>();
      for (const entry of payload.hunterCatches) {
        for (const id of entry.completedGoalIds) allCompleted.add(id);
      }
      const filtered = cached[mapIdx].remaining_goals!.filter((g) => !allCompleted.has(g.uniqueId));
      if (filtered.length !== cached[mapIdx].remaining_goals!.length) {
        cached[mapIdx] = { ...cached[mapIdx], remaining_goals: filtered };
        setCachedActiveMaps(cached);
        broadcastRawToPanel({ type: "game_state", payload: { activeMaps: cached } });
      }
    }
  } else if (payload.type === "map_complete_detected") {
    handleMapCompleteDetected(payload.mapId, payload.mapName);
  } else if (payload.type === "map_hunters_updated") {
    const cached = [...getState().cachedActiveMaps];
    const idx = cached.findIndex((m) => m.map_id === payload.mapId);
    if (idx !== -1) {
      cached[idx] = {
        ...cached[idx],
        num_active_hunters: payload.numActiveHunters,
        max_hunters: payload.maxHunters,
        invited_hunters: payload.invitedHunters,
        is_owner: payload.isOwner,
      };
      setCachedActiveMaps(cached);
      broadcastRawToPanel({ type: "game_state", payload: { activeMaps: cached } });
    }
  } else if (payload.type === "player_rank") {
    setPlayerTitleId(payload.titleId, payload.titleName ?? undefined);
    broadcastRawToPanel({
      type: "game_state",
      payload: {
        playerTitleId: payload.titleId,
        ...(payload.titleName ? { playerTitleName: payload.titleName } : {}),
      },
    });
  }
}

const enrichingMapIds = new Set<number>();

const reportedMapTypeKeys = new Set<string>();

function handleActiveMapsDetected(
  maps: Array<{ map_id: number; name: string; num_found: number; num_total: number; is_rare: boolean | null; map_class: string }>
): void {
  const cached = getState().cachedActiveMaps;
  const incomingIds = new Set(maps.map((m) => m.map_id));
  const cachedIds = new Set(cached.map((m) => m.map_id));

  // Check if the set of active maps has changed
  if (
    incomingIds.size === cachedIds.size &&
    [...incomingIds].every((id) => cachedIds.has(id))
  ) {
    return; // No change
  }

  console.log("[mhcm] active maps updated:", maps.map((m) => `${m.name} (${m.map_id})`).join(", "));

  // If any maps were added, the user just joined a map – tell the server
  // so it pauses their buy orders until they're free again.
  const addedIds = [...incomingIds].filter((id) => !cachedIds.has(id));
  if (addedIds.length > 0 && getState().wsConnected) {
    console.log("[mhcm] maps added:", addedIds);
  }

  // If any maps were removed, notify the server so it can re-run matching
  // for this user's pending buy orders (they may now be free to accept invites).
  const removedIds = [...cachedIds].filter((id) => !incomingIds.has(id));
  if (removedIds.length > 0 && getState().wsConnected) {
    console.log("[mhcm] maps removed:", removedIds);

    // If any removed maps were owned by the user, tell the server to cancel
    // sell orders referencing those maps (they're no longer valid).
    const ownedRemovedIds = removedIds.filter((id) => {
      const m = cached.find((c) => c.map_id === id);
      return m?.is_owner === true;
    });
    if (ownedRemovedIds.length > 0) {
      if (getState().sellOrderValidationPending) {
        // Buffer until validation completes - prevents false positives on reconnect
        console.log("[mhcm] buffering maps_removed during validation:", ownedRemovedIds);
        addPendingMapsRemoved(ownedRemovedIds);
      } else {
        // Normal operation - send immediately
        console.log("[mhcm] owned maps removed, sending maps_removed:", ownedRemovedIds);
        send({ type: "maps_removed", payload: { mapIds: ownedRemovedIds } });
      }
    }
  }

  // Always send current map set to server for general-purpose presence tracking
  // (used to detect sniper abandonment in sniping transactions, etc.)
  if (getState().wsConnected) {
    send({ type: "update_active_maps", payload: { maps: maps.map((m) => ({ mapId: m.map_id, mapClass: m.map_class })) } });
  }

  // Merge: preserve enriched data for maps that are still active.
  // Only freeze catalog-only fields (map_type, quality, reward_type) – hunter
  // data (num_active_hunters, invited_hunters, max_hunters, is_owner) is kept
  // fresh by map_hunters_updated from every treasure_map API response.
  const merged: MHActiveMap[] = maps.map((m) => {
    const existing = cached.find((c) => c.map_id === m.map_id);
    if (existing?.map_type) {
      return { ...existing, ...m, map_type: existing.map_type, quality: existing.quality, reward_type: existing.reward_type };
    }
    return m as MHActiveMap;
  });

  setCachedActiveMaps(merged);
  broadcastRawToPanel({
    type: "game_state",
    payload: { activeMaps: merged },
  });

  // Enrich maps that don't yet have map_type
  for (const m of merged) {
    if (!m.map_type && !enrichingMapIds.has(m.map_id)) {
      enrichMapInfo(m.map_id);
    }
  }
}

async function triggerManualMapValidation(): Promise<void> {
  console.log("[mhcm] sell order validation timeout - triggering manual map check");

  // Get unique map IDs from open sell orders
  const mapIds = new Set(
    getState()
      .myOrders.filter(
        (o: any) => o.side === "sell" && (o.status === "open" || o.status === "partially_filled")
      )
      .map((o: any) => o.mhMapId)
  );

  const uh = getState().playerIdentity?.uniqueHash;
  if (!uh || mapIds.size === 0) {
    completeSellOrderValidation();
    return;
  }

  // Request map data for each via content script - this will trigger map_discovered
  for (const mapId of mapIds) {
    try {
      await executeApiViaContentScript("getMapInfo", [uh, mapId]);
    } catch (err) {
      console.warn("[mhcm] failed to fetch map details for", mapId, err);
    }
  }

  completeSellOrderValidation();
}

function completeSellOrderValidation(): void {
  console.log("[mhcm] sell order validation complete");
  clearSellOrderValidationTimeout();
  setSellOrderValidationPending(false);

  // Process any buffered maps_removed
  const pending = clearPendingMapsRemoved();
  if (pending.length === 0) return;

  const ownedMapIds = getState()
    .cachedActiveMaps.filter((m) => m.is_owner)
    .map((m) => m.map_id);

  // Only report maps that are actually gone after validation
  const trulyRemovedMaps = pending.filter((mapId) => !ownedMapIds.includes(mapId));

  if (trulyRemovedMaps.length > 0) {
    console.log("[mhcm] after validation, truly removed maps:", trulyRemovedMaps);
    send({ type: "maps_removed", payload: { mapIds: trulyRemovedMaps } });
  } else {
    console.log("[mhcm] after validation, no maps actually removed (false positive prevented)");
  }
}

function validateBuyOrdersBalance(): void {
  const balance = getState().sbBalance;
  const orders = getState().myOrders;
  if (balance === null || orders.length === 0) return;

  // Get open buy orders sorted by creation time (oldest first)
  const openBuyOrders = orders
    .filter((o: any) => o.side === "buy" && (o.status === "open" || o.status === "partially_filled"))
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Calculate total committed
  let totalCommitted = 0;
  for (const order of openBuyOrders) {
    const remaining = order.quantity - order.filledQuantity;
    totalCommitted += order.price * remaining;
  }

  if (totalCommitted <= balance) return;

  console.log(
    `[mhcm] buy orders exceed balance: ${totalCommitted.toLocaleString()} > ${balance.toLocaleString()}`
  );

  // Cancel oldest orders until under balance
  const ordersToCancel: number[] = [];
  for (const order of openBuyOrders) {
    const remaining = order.quantity - order.filledQuantity;
    const orderCost = order.price * remaining;

    ordersToCancel.push(order.id);
    totalCommitted -= orderCost;

    if (totalCommitted <= balance) break;
  }

  console.log(`[mhcm] cancelling ${ordersToCancel.length} buy orders due to insufficient balance`);

  // Send cancel requests
  for (const orderId of ordersToCancel) {
    send({
      type: "cancel_order",
      payload: { orderId, reason: "insufficient_balance" },
    });
  }
}

async function refreshGameState(): Promise<void> {
  const uh = getState().playerIdentity?.uniqueHash;
  if (!uh) {
    console.warn("[mhcm] cannot refresh game state: no unique_hash");
    return;
  }

  try {
    const result = await executeApiViaContentScript("fetchCampPage", [uh]);
    if (!result.success || !result.data) {
      console.warn("[mhcm] refresh game state failed:", result.error);
      return;
    }

    const maps = result.data?.user?.quests?.QuestRelicHunter?.maps;
    if (Array.isArray(maps)) {
      handleActiveMapsDetected(
        maps.map((m: any) => ({
          map_id: Number(m.map_id),
          name: m.name ?? "",
          num_found: m.num_found ?? 0,
          num_total: m.num_total ?? 0,
          is_rare: m.is_rare ?? null,
          map_class: m.map_class ?? "treasure",
        }))
      );
    }
  } catch (err) {
    console.warn("[mhcm] refresh game state failed:", err);
  }
}

async function enrichMapInfo(mapId: number): Promise<void> {
  enrichingMapIds.add(mapId);
  try {
    const result = await executeApiViaContentScript("getMapInfo", [
      getState().playerIdentity?.uniqueHash,
      mapId,
    ]);
    if (!result.success || !result.data) return;

    const mapData = result.data;
    const cached = getState().cachedActiveMaps;
    const idx = cached.findIndex((m) => m.map_id === mapId);
    if (idx < 0) return; // Map no longer active

    // Determine goal type from is_scavenger_hunt flag
    const isItemGoalMap = !!mapData.is_scavenger_hunt;
    const goalType = isItemGoalMap ? "item" as const : "mouse" as const;

    // Build per-hunter catches and aggregate set for remaining goals
    const hunterCatches: Array<{ snUserId: string; completedGoalIds: number[] }> = [];
    const allCompletedGoalIds = new Set<number>();
    if (mapData.hunters && Array.isArray(mapData.hunters)) {
      for (const hunter of mapData.hunters) {
        const completedGoals = isItemGoalMap
          ? hunter.completed_goal_ids?.item
          : hunter.completed_goal_ids?.mouse;
        if (Array.isArray(completedGoals)) {
          for (const id of completedGoals) allCompletedGoalIds.add(id);
          if (completedGoals.length > 0 && hunter.sn_user_id) {
            hunterCatches.push({
              snUserId: String(hunter.sn_user_id),
              completedGoalIds: completedGoals,
            });
          }
        }
      }
    }

    // Extract remaining goals (not completed by any hunter)
    const goalsSource = isItemGoalMap ? mapData.goals?.item : mapData.goals?.mouse;
    const remainingGoals: Array<{ uniqueId: number; type: string }> = [];
    if (goalsSource && Array.isArray(goalsSource)) {
      for (const goal of goalsSource) {
        if (!allCompletedGoalIds.has(goal.unique_id)) {
          remainingGoals.push({
            uniqueId: goal.unique_id,
            type: goal.type,
          });
        }
      }
    }

    const numActiveHunters = mapData.num_active_hunters ?? mapData.hunters?.length ?? 0;
    const updated = [...cached];
    updated[idx] = {
      ...updated[idx],
      map_type: mapData.map_type,
      quality: mapData.quality,
      reward_type: mapData.reward?.type || undefined,
      is_owner: mapData.is_owner,
      max_hunters: mapData.max_hunters,
      num_active_hunters: numActiveHunters,
      invited_hunters: mapData.invited_hunters ?? [],
      goalType,
      remaining_goals: remainingGoals,
    };
    setCachedActiveMaps(updated);

    // Map full notification: check if map is full and we're the owner
    const isFull = numActiveHunters >= mapData.max_hunters;
    const isOwner = mapData.is_owner === true;
    const alreadyNotified = getState().notifiedMapIds.has(mapId);

    if (isFull && isOwner && !alreadyNotified && shouldNotify("map_full")) {
      showNotification(
        `mhcm-map-full-${mapId}`,
        "Community Marketplace",
        `Your ${mapData.name || "map"} is full and ready to close!`
      );
      addNotifiedMapId(mapId);
    }

    console.log(`[mhcm] enriched map ${mapId}: ${mapData.map_type} ${mapData.quality} (${goalType}), ${remainingGoals.length} remaining goals`);

    // Mark catch data as fresh (even if no catches yet – we checked)
    touchCatchDataTimestamp(mapId);

    // Also check for sniping catches from enriched map data
    if (hunterCatches.length > 0) {
      handleCatchesDetected(mapId, goalType, hunterCatches);
    }

    broadcastRawToPanel({
      type: "game_state",
      payload: { activeMaps: updated },
    });

    // Also report to server for catalog auto-discovery (deduplicate per session)
    const enrichReportKey = `${mapData.quality}:${mapData.reward?.type}:${mapData.is_scavenger_hunt ? "item" : "mouse"}`;
    if (!reportedMapTypeKeys.has(enrichReportKey) && getState().wsConnected) {
      reportedMapTypeKeys.add(enrichReportKey);
      send({
        type: "report_map_types",
        payload: {
          mapTypes: [
            {
              quality: mapData.quality,
              name: mapData.name,
              maxHunters: mapData.max_hunters,
              rewardType: mapData.reward?.type || undefined,
              thumbnail: mapData.reward?.thumb_transparent || undefined,
              mapClass: mapData.map_class || undefined,
              isScavengerHunt: !!mapData.is_scavenger_hunt,
              minTitleName: mapData.min_title_name || undefined,
            },
          ],
        },
      });
    }
  } catch (err) {
    console.error(`[mhcm] failed to enrich map ${mapId}:`, err);
  } finally {
    enrichingMapIds.delete(mapId);
  }
}

// Any player's XHR gives us full catch data for all hunters, so Bob's
// client can detect Lara's catches and vice versa.
function handleCatchesDetected(
  mapId: number,
  goalType: "mouse" | "item",
  hunterCatches: Array<{ snUserId: string; completedGoalIds: number[] }>
): void {
  // Record that we received catch data for this map (for staleness detection)
  touchCatchDataTimestamp(mapId);

  if (!getState().wsConnected) return;

  const trackedCount = getState().trackedSnipingTxns.size;
  verboseLog("snipe-sw", `CATCHES: map ${mapId}, goalType=${goalType}, ${hunterCatches.length} hunter(s) with catches, ${trackedCount} tracked txn(s)`);

  // Build a lookup of snUserId → completed goal IDs for quick access
  const catchesBySniper = new Map<string, Set<number>>();
  for (const entry of hunterCatches) {
    catchesBySniper.set(entry.snUserId, new Set(entry.completedGoalIds));
  }

  // Check every tracked transaction on this map with matching goal type
  for (const tracked of getState().trackedSnipingTxns.values()) {
    if (tracked.mhMapId !== mapId) continue;
    if (tracked.goalType !== goalType) continue;

    const sniperCompletedSet = catchesBySniper.get(tracked.sniperSnUserId);
    verboseLog("snipe-sw", `  txn #${tracked.id}: sniper ${tracked.sniperSnUserId} completed=${sniperCompletedSet ? `[${[...sniperCompletedSet].join(",")}]` : "none"}, targets=[${tracked.targetGoalIds.join(",")}], reported=[${[...tracked.reportedCompletedIds].join(",")}]`);
    if (!sniperCompletedSet) continue;

    for (const targetGoalId of tracked.targetGoalIds) {
      if (sniperCompletedSet.has(targetGoalId) && !tracked.reportedCompletedIds.has(targetGoalId)) {
        if (goalType === "item") {
          verboseLog("snipe-sw", `  NEW FIND: item ${targetGoalId} on map ${mapId} (txn #${tracked.id})`);
          send({
            type: "item_found",
            payload: {
              transactionId: tracked.id,
              itemTypeId: targetGoalId,
            },
          });
        } else {
          verboseLog("snipe-sw", `  NEW CATCH: mouse ${targetGoalId} on map ${mapId} (txn #${tracked.id})`);
          send({
            type: "mouse_caught",
            payload: {
              transactionId: tracked.id,
              mouseTypeId: targetGoalId,
            },
          });
        }
        tracked.reportedCompletedIds.add(targetGoalId);
      }
    }
  }
}

function handleMapCompleteDetected(mapId: number, mapName: string): void {
  // Dedup: only notify once per map
  if (getState().notifiedCompletedMapIds.has(mapId)) return;
  addNotifiedCompletedMapId(mapId);

  // Notify locally (this user detected it)
  if (shouldNotify("map_complete")) {
    showNotification(
      `mhcm-map-complete-${mapId}`,
      "Community Marketplace",
      `Your ${mapName || "treasure map"} is complete!`
    );
  }

  // Report to server so other users on the same map get notified
  if (getState().wsConnected) {
    send({ type: "map_completed_report", payload: { mhMapId: mapId, mapName: mapName || "" } });
  }
}

// When sniping transactions are actively being tracked, we monitor whether
// catch data is going stale (no XHR interception in 30 min). If so, we
// proactively call getMapInfo to refresh hunter catch data. This handles the
// case where neither the sniper nor the maptain visits their map page for a
// while -- without this, catches would go undetected until someone navigates.
const CATCH_STALENESS_THRESHOLD = 30 * 60 * 1000; // 30 minutes
const CATCH_STALENESS_CHECK_INTERVAL = 5 * 60 * 1000; // check every 5 minutes

async function checkCatchStaleness(): Promise<void> {
  const state = getState();
  if (state.trackedSnipingTxns.size === 0) return;

  const uh = state.playerIdentity?.uniqueHash;
  if (!uh || !state.gameTabId) return;

  // Collect unique map IDs from tracked transactions
  const trackedMapIds = new Set<number>();
  for (const txn of state.trackedSnipingTxns.values()) {
    trackedMapIds.add(txn.mhMapId);
  }

  const now = Date.now();
  for (const mapId of trackedMapIds) {
    const lastSeen = state.lastCatchDataByMap.get(mapId) ?? 0;
    if (now - lastSeen >= CATCH_STALENESS_THRESHOLD) {
      console.log(`[mhcm] catch data stale for map ${mapId} (${Math.round((now - lastSeen) / 60000)}min) – refreshing`);
      // enrichMapInfo already calls getMapInfo, extracts hunter catches,
      // and calls handleCatchesDetected (which updates the timestamp)
      await enrichMapInfo(mapId);
    }
  }
}

function startCatchStalenessPolling(): void {
  if (getState().catchStalenessTimer) return; // already running
  console.log("[mhcm] starting catch staleness polling (every 5 min)");
  const timer = setInterval(checkCatchStaleness, CATCH_STALENESS_CHECK_INTERVAL);
  setCatchStalenessTimer(timer);
}

function stopCatchStalenessPolling(): void {
  if (!getState().catchStalenessTimer) return;
  console.log("[mhcm] stopping catch staleness polling (no tracked transactions)");
  setCatchStalenessTimer(null);
}

function handlePanelMessage(
  message: PanelToWorkerMessage,
  sendResponse: (response: any) => void
): void {
  switch (message.type) {
    case "panel_ready": {
      sendResponse({
        type: "connection_status",
        payload: { connected: getState().wsConnected },
      });
      // Replay cached data so the panel gets it immediately
      setTimeout(() => {
        const state = getState();
        if (state.cachedMapTypes) {
          broadcastToPanel({
            type: "map_types",
            payload: {
              mapTypes: state.cachedMapTypes,
              ...(state.cachedMapTypeStats && { stats: state.cachedMapTypeStats }),
            },
          });
        }
        if (state.cachedActiveMaps.length > 0) {
          broadcastRawToPanel({
            type: "game_state",
            payload: { activeMaps: state.cachedActiveMaps },
          });
        }
        // Send current AFK status
        broadcastRawToPanel({
          type: "afk_status",
          payload: { isAfk: state.isAfk, warning: false },
        });
        // Send current game settings status
        if (state.gameSettings) {
          const valid = state.gameSettings.allowMapInvites && state.gameSettings.allowAnonymousSupplyTransfers;
          broadcastRawToPanel({
            type: "game_settings",
            payload: { valid, ...state.gameSettings },
          });
        }
        // Replay market beta/enabled config and beta tester status
        if (state.cachedMarketBetaConfig) {
          broadcastToPanel({ type: "market_beta_config", payload: state.cachedMarketBetaConfig });
        }
        if (state.cachedMarketEnabledConfig) {
          broadcastToPanel({ type: "market_enabled_config", payload: state.cachedMarketEnabledConfig });
        }
        if (state.cachedBetaTesterStatus) {
          broadcastToPanel({ type: "beta_tester_status", payload: state.cachedBetaTesterStatus });
        }
        // Replay onboarding status
        if (state.cachedOnboardingStatus) {
          broadcastToPanel({ type: "onboarding_status", payload: state.cachedOnboardingStatus });
        }
        // Replay player rank
        if (state.playerTitleId != null) {
          broadcastRawToPanel({
            type: "game_state",
            payload: {
              playerTitleId: state.playerTitleId,
              ...(state.playerTitleName ? { playerTitleName: state.playerTitleName } : {}),
            },
          });
        }
        // Replay any cached sniping payment grace messages
        for (const grace of state.cachedSnipingPaymentGrace) {
          broadcastToPanel({ type: "sniping_payment_grace", payload: grace });
        }
        // Replay RT manual confirm prompt
        if (state.cachedRtConfirmPrompt) {
          broadcastToPanel({ type: "rt_manual_confirm_prompt", payload: state.cachedRtConfirmPrompt });
        }
        // Replay drain progress for admin
        if (state.cachedDrainProgress) {
          broadcastToPanel({ type: "admin_drain_progress", payload: state.cachedDrainProgress });
        }
      }, 0);
      break;
    }
    case "get_connection_status":
      sendResponse({
        type: "connection_status",
        payload: { connected: getState().wsConnected },
      });
      break;

    case "get_game_state":
      sendResponse({
        type: "game_state",
        payload: {
          playerIdentity: getState().playerIdentity,
          sbBalance: getState().sbBalance,
          activeMaps: getState().cachedActiveMaps,
          playerTitleId: getState().playerTitleId,
          playerTitleName: getState().playerTitleName,
        },
      });
      break;

    case "refresh_game_state":
      refreshGameState()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      break;

    case "ws_send":
      // Clear RT confirm cache when buyer confirms
      if (message.payload?.type === "rt_manual_confirm") {
        setCachedRtConfirmPrompt(null);
      }
      send(message.payload);
      sendResponse({ ok: true });
      break;

    case "execute_api_via_content":
      executeApiViaContentScript(message.payload.method, message.payload.args)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) }));
      break;

    case "navigate_url": {
      const tabId = getState().gameTabId;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "navigate_url",
          payload: { url: message.payload.url },
        }).catch(() => {});
      }
      sendResponse({ ok: true });
      break;
    }

    case "set_notification_prefs":
      setNotificationPrefs(message.payload);
      sendResponse({ ok: true });
      break;

    case "recheck_game_settings":
      fetchGameSettings()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return; // async response handled above
  }
}

async function executeApiViaContentScript(
  method: GameApiMethod,
  args: any[]
): Promise<{ success: boolean; data?: any; error?: string }> {
  const tabId = getState().gameTabId;
  if (!tabId) {
    return { success: false, error: "No game tab available" };
  }

  const requestId = `panel-${Date.now()}`;
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      source: "mhcm-service-worker",
      type: "execute_api_call",
      payload: { requestId, method, args },
    } satisfies ExecuteApiCallMessage);

    return response ?? { success: false, error: "No response from content script" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Race a step execution against a 25-second local timeout.
 * Sends a user-friendly error before the server's 30s timeout fires.
 * Late results after timeout are harmless -- server ignores duplicate step results.
 */
function withStepTimeout(
  execution: Promise<void>,
  resultType: string,
  transactionId: number,
  step: string,
): void {
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) {
      send({
        type: resultType,
        payload: {
          transactionId,
          step,
          success: false,
          error: "Game tab did not respond. Is the MouseHunt tab still open?",
        },
      } as any);
    }
  }, 25_000);

  execution.finally(() => {
    settled = true;
    clearTimeout(timer);
  });
}

setMessageHandler((message: ServerMessage) => {
  if (message.type === "execute_step") {
    const tabId = getState().gameTabId;
    if (!tabId) {
      console.error("[mhcm] no game tab to execute step");
      send({
        type: "step_result",
        payload: {
          transactionId: message.payload.transactionId,
          step: message.payload.step,
          success: false,
          error: "No game tab available",
        },
      });
      return;
    }

    withStepTimeout(
      executeGameApiStep(tabId, message),
      "step_result",
      message.payload.transactionId,
      message.payload.step,
    );
    return;
  }

  if (message.type === "sniping_execute_step") {
    verboseLog("snipe-sw", `RECV sniping_execute_step: txn #${message.payload.transactionId}, step=${message.payload.step}, gameTabId=${getState().gameTabId}`);
    const tabId = getState().gameTabId;
    if (!tabId) {
      console.error("[mhcm] no game tab to execute sniping step");
      verboseLog("snipe-sw", `  FAIL: no game tab available`);
      send({
        type: "sniping_step_result",
        payload: {
          transactionId: message.payload.transactionId,
          step: message.payload.step,
          success: false,
          error: "No game tab available",
        },
      });
      return;
    }

    withStepTimeout(
      executeSnipingStep(tabId, message),
      "sniping_step_result",
      message.payload.transactionId,
      message.payload.step,
    );
    return;
  }

  if (message.type === "item_execute_step") {
    const tabId = getState().gameTabId;
    if (!tabId) {
      send({
        type: "item_step_result",
        payload: {
          transactionId: message.payload.transactionId,
          step: message.payload.step,
          success: false,
          error: "No game tab available",
        },
      });
      return;
    }

    withStepTimeout(
      executeItemStep(tabId, message),
      "item_step_result",
      message.payload.transactionId,
      message.payload.step,
    );
    return;
  }

  if (message.type === "map_execute_step") {
    const tabId = getState().gameTabId;
    if (!tabId) {
      send({
        type: "map_step_result",
        payload: {
          transactionId: message.payload.transactionId,
          step: message.payload.step,
          success: false,
          error: "No game tab available",
        },
      });
      return;
    }

    withStepTimeout(
      executeMapStep(tabId, message),
      "map_step_result",
      message.payload.transactionId,
      message.payload.step,
    );
    return;
  }

  if (message.type === "verify_mh_link_step") {
    const uh = getState().playerIdentity?.uniqueHash;
    if (!uh) {
      send({
        type: "verify_mh_link_result",
        payload: { success: false, error: "No unique_hash available" },
      });
      return;
    }

    executeApiViaContentScript("getHunterProfile", [uh, message.payload.snUserId])
      .then((result) => {
        if (!result.success) {
          send({
            type: "verify_mh_link_result",
            payload: { success: false, error: result.error || "Failed to fetch hunter profile" },
          });
          return;
        }

        const messages: Array<{ body: string; sn_user_id: string }> =
          result.data?.boardPage?.messages ?? [];
        send({
          type: "verify_mh_link_result",
          payload: { success: true, messages },
        });
      })
      .catch((err) => {
        send({
          type: "verify_mh_link_result",
          payload: { success: false, error: err instanceof Error ? err.message : String(err) },
        });
      });
    return;
  }

  if (message.type === "request_active_maps") {
    const tabId = getState().gameTabId;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        source: "mhcm-service-worker",
        type: "request_active_maps",
      }).catch(() => {
        // Content script not ready – nothing we can do
      });
    }
    return;
  }

  if (message.type === "leave_map") {
    const { transactionId, mapId, reason } = message.payload;
    const uh = getState().playerIdentity?.uniqueHash;

    console.log(`[mhcm] received leave_map for txn ${transactionId}: ${reason}`);

    if (!uh) {
      send({
        type: "leave_map_result",
        payload: { transactionId, success: false, error: "No unique_hash available" },
      });
      return;
    }

    executeApiViaContentScript("leaveMap", [uh, mapId])
      .then((result) => {
        send({
          type: "leave_map_result",
          payload: {
            transactionId,
            success: result.success,
            error: result.error,
          },
        });

        // Refresh game tab after leaving map (camp click refreshes the MH UI
        // and the XHR interceptor picks up fresh state from the response)
        if (result.success) {
          refreshGameTab();
        }
      })
      .catch((err) => {
        send({
          type: "leave_map_result",
          payload: {
            transactionId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      });
    return;
  }

  if (message.type === "verify_transfer") {
    handleVerifyTransfer(message.payload);
    return;
  }

  if (message.type === "risk_check_prompt") {
    handleRiskCheckPrompt(message.payload);
    return;
  }

  if (message.type === "risk_check_timed_out") {
    broadcastToPanel(message);
    return;
  }

  if (message.type === "risk_check_retry_no_match") {
    broadcastToPanel(message);
    return;
  }

  if (message.type === "map_types") {
    setCachedMapTypes(message.payload.mapTypes, message.payload.stats);

    // map_types is always the first message after connect.
    // Active map presence is now tracked via update_active_maps (class-aware).
    // No separate user_busy message needed.
  }

  if (message.type === "notification_prefs") {
    setNotificationPrefs(message.payload);
  }

  if (message.type === "map_completed") {
    const { mhMapId, mapName } = message.payload;
    if (!getState().notifiedCompletedMapIds.has(mhMapId)) {
      addNotifiedCompletedMapId(mhMapId);
      if (shouldNotify("map_complete")) {
        showNotification(
          `mhcm-map-complete-${mhMapId}`,
          "Community Marketplace",
          `Your ${mapName || "treasure map"} is complete!`
        );
      }
    }
  }

  if (message.type === "market_beta_config") {
    setCachedMarketBetaConfig(message.payload);
  }
  if (message.type === "market_enabled_config") {
    setCachedMarketEnabledConfig(message.payload);
  }
  if (message.type === "beta_tester_status") {
    setCachedBetaTesterStatus(message.payload);
  }
  if (message.type === "onboarding_status") {
    setCachedOnboardingStatus(message.payload);
  }

  if (message.type === "rt_manual_confirm_prompt") {
    setCachedRtConfirmPrompt(message.payload);
  }

  if (message.type === "admin_drain_progress") {
    setCachedDrainProgress(message.payload.draining ? message.payload : null);
  }

  if (message.type === "xhr_logging_state") {
    console.log(`[mhcm] xhr_logging_state received: enabled=${message.payload.enabled}, gameTabId=${getState().gameTabId}`);
    setXhrLoggingEnabled(message.payload.enabled);
    const tabId = getState().gameTabId;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        source: "mhcm-service-worker",
        type: "xhr_logging_state",
        payload: { enabled: message.payload.enabled },
      }).catch(() => {});
    } else {
      console.log("[mhcm] xhr_logging_state: no game tab – will forward on identity detection");
    }
  }

  if (message.type === "new_sell_order") {
    const { mapName, price, quantity, tier } = message.payload;
    const tierText = tier ? ` [${tier}]` : "";
    showNotification(
      `mhcm-new-sell-${Date.now()}`,
      "Community Marketplace - New Listing",
      `${mapName}${tierText}: ${quantity} slot${quantity !== 1 ? "s" : ""} at ${price} SB`
    );
  }

  if (message.type === "new_item_sell_order") {
    const { itemName, price, quantity } = message.payload;
    showNotification(
      `mhcm-new-item-sell-${Date.now()}`,
      "Community Marketplace - New Item Listing",
      `${itemName}: ${quantity.toLocaleString()} at ${formatItemPrice(price)} SB each`
    );
  }

  if (message.type === "new_map_sell_order") {
    const { mapName, mode, price } = message.payload;
    const modeText = mode === "unopened" ? "Unopened" : "Completed";
    showNotification(
      `mhcm-new-map-sell-${Date.now()}`,
      "Community Marketplace - New Map Listing",
      `${modeText} ${mapName} at ${price.toLocaleString()} SB`
    );
  }

  if (message.type === "transaction_update") {
    const txn = message.payload.transaction;
    if (txn.state === "completed" || txn.state === "failed") {
      refreshGameTab();
      verificationAttemptSeen.delete(txn.id);
    }

    // Show notification for completed transactions
    if (txn.state === "completed") {
      const mySnUserId = getState().playerIdentity?.snUserId;
      if (mySnUserId) {
        // Seller notification: slot was sold
        if (txn.sellerMhSnUserId === mySnUserId && shouldNotify("slot_sold")) {
          showNotification(
            `mhcm-slot-sold-${txn.id}`,
            "Community Marketplace",
            "Your map slot was purchased!"
          );
        }
        // Buyer notification: slot was purchased
        if (txn.buyerMhSnUserId === mySnUserId && shouldNotify("slot_purchased")) {
          showNotification(
            `mhcm-slot-purchased-${txn.id}`,
            "Community Marketplace",
            "Your slot purchase is complete!"
          );
        }
      }
    }
  }

  if (message.type === "sniping_transaction_update") {
    const txn = message.payload.transaction;
    verboseLog("snipe-sw", `TXN UPDATE: txn #${txn.id}, state=${txn.state}, goalType=${txn.goalType}`);
    if (txn.state === "sniping") {
      // Active hunting phase – track for catch/find detection
      const gt = txn.goalType || "mouse";
      let targetGoalIds: number[];
      let alreadyCompleted: Set<number>;
      if (gt === "item" && txn.items && txn.items.length > 0) {
        targetGoalIds = txn.items.map((i: any) => i.itemTypeId);
        alreadyCompleted = new Set(
          txn.items.filter((i: any) => i.found).map((i: any) => i.itemTypeId)
        );
      } else {
        targetGoalIds = txn.mice.map((m: any) => m.mouseTypeId);
        alreadyCompleted = new Set(
          txn.mice.filter((m: any) => m.caught).map((m: any) => m.mouseTypeId)
        );
      }
      addTrackedSnipingTxn({
        id: txn.id,
        mhMapId: txn.mhMapId,
        sniperSnUserId: txn.sniperMhSnUserId,
        goalType: gt,
        targetGoalIds,
        reportedCompletedIds: alreadyCompleted,
      });
      // Seed catch data timestamp (assume data is fresh from the state transition)
      touchCatchDataTimestamp(txn.mhMapId);
      startCatchStalenessPolling();
      verboseLog("snipe-sw", `  tracking txn #${txn.id}: map=${txn.mhMapId}, sniper=${txn.sniperMhSnUserId}, goalType=${gt}, targets=[${targetGoalIds.join(",")}] (${getState().trackedSnipingTxns.size} total tracked)`);
    } else if (txn.state === "completed" || txn.state === "failed") {
      // Terminal state – stop tracking
      verboseLog("snipe-sw", `  untracking txn #${txn.id} (${txn.state})`);
      removeTrackedSnipingTxn(txn.id);
      if (getState().trackedSnipingTxns.size === 0) stopCatchStalenessPolling();
      // Only refresh game tab on success – failed txns that never reached the
      // game API don't change game state, and refreshing on every failure
      // hammers the game with page reloads during rapid fail/rematch cycles.
      if (txn.state === "completed") refreshGameTab();
    } else if (txn.state === "awaiting_payment" || txn.state === "transferring" || txn.state === "awaiting_leave") {
      // Progressed past sniping – stop tracking catches for this txn
      verboseLog("snipe-sw", `  untracking txn #${txn.id} (past sniping: ${txn.state})`);
      removeTrackedSnipingTxn(txn.id);
      if (getState().trackedSnipingTxns.size === 0) stopCatchStalenessPolling();
    }

    const mySnUserId = getState().playerIdentity?.snUserId;
    if (mySnUserId) {
      const cached = getState().snipingTxnCache.get(txn.id);
      const prevState = cached?.prevState;
      const isMaptain = txn.maptainMhSnUserId === mySnUserId;
      const isSniper = txn.sniperMhSnUserId === mySnUserId;

      // State transition notifications
      if (txn.state === "sniping" && prevState !== "sniping") {
        if (isMaptain && shouldNotify("sniper_joined")) {
          showNotification(`mhcm-sniper-joined-${txn.id}`, "Community Marketplace", "A sniper has joined your map!");
        }
        if (isSniper && shouldNotify("sniping_assigned")) {
          showNotification(`mhcm-sniping-assigned-${txn.id}`, "Community Marketplace", "You've been assigned to a map!");
        }
      }
      if (txn.state === "completed") {
        if (isMaptain && shouldNotify("sniping_map_complete")) {
          showNotification(`mhcm-sniping-map-done-${txn.id}`, "Community Marketplace", "All sniping on your map is done!");
        }
        if (isSniper && shouldNotify("sniping_job_complete")) {
          showNotification(`mhcm-sniping-job-done-${txn.id}`, "Community Marketplace", "Your sniping job is complete!");
        }
      }
      if (txn.state === "failed" && txn.failureReason === "sniper_abandoned") {
        if (isMaptain && shouldNotify("sniper_left_early")) {
          showNotification(`mhcm-sniper-left-${txn.id}`, "Community Marketplace", "A sniper left your map before finishing.");
        }
      }

      // Update cache (or clean up on terminal)
      if (txn.state === "completed" || txn.state === "failed") {
        removeSnipingTxnCache(txn.id);
      } else {
        updateSnipingTxnCache(txn.id, {
          prevState: txn.state,
          sniperSnUserId: txn.sniperMhSnUserId,
          maptainSnUserId: txn.maptainMhSnUserId,
        });
      }
    }
  }

  if (message.type === "sniping_mouse_caught") {
    const { transactionId } = message.payload;
    const mySnUserId = getState().playerIdentity?.snUserId;
    const cached = getState().snipingTxnCache.get(transactionId);
    if (mySnUserId && cached) {
      if (cached.maptainSnUserId === mySnUserId && shouldNotify("mouse_caught")) {
        showNotification(`mhcm-mouse-caught-${transactionId}-${message.payload.mouseTypeId}`, "Community Marketplace", "A mouse was caught on your map!");
      }
      if (cached.sniperSnUserId === mySnUserId && shouldNotify("sniper_catch_confirmed")) {
        showNotification(`mhcm-catch-confirmed-${transactionId}-${message.payload.mouseTypeId}`, "Community Marketplace", "Your mouse catch was confirmed!");
      }
    }
  }

  if (message.type === "sniping_item_found") {
    const { transactionId } = message.payload;
    const mySnUserId = getState().playerIdentity?.snUserId;
    const cached = getState().snipingTxnCache.get(transactionId);
    if (mySnUserId && cached) {
      if (cached.maptainSnUserId === mySnUserId && shouldNotify("mouse_caught")) {
        showNotification(`mhcm-item-found-${transactionId}-${message.payload.itemTypeId}`, "Community Marketplace", "An item was found on your map!");
      }
      if (cached.sniperSnUserId === mySnUserId && shouldNotify("sniper_catch_confirmed")) {
        showNotification(`mhcm-item-found-confirmed-${transactionId}-${message.payload.itemTypeId}`, "Community Marketplace", "Your item find was confirmed!");
      }
    }
  }

  if (message.type === "item_transaction_update") {
    const txn = message.payload.transaction;
    if (txn.state === "completed" || txn.state === "failed") {
      verificationAttemptSeen.delete(txn.id);
    }
    if (txn.state === "completed") {
      refreshGameTab();
      // Item sold/purchased notifications
      const mySnUserId = getState().playerIdentity?.snUserId;
      if (mySnUserId) {
        if (txn.sellerMhSnUserId === mySnUserId && shouldNotify("item_sold")) {
          showNotification(`mhcm-item-sold-${txn.id}`, "Community Marketplace", "Your item was purchased!");
        }
        if (txn.buyerMhSnUserId === mySnUserId && shouldNotify("item_purchased")) {
          showNotification(`mhcm-item-purchased-${txn.id}`, "Community Marketplace", "Your item purchase is complete!");
        }
      }
    }
  }

  if (message.type === "map_transaction_update") {
    const txn = message.payload.transaction;
    if (txn.state === "completed") {
      refreshGameTab();
      // Map sold/purchased notifications
      const mySnUserId = getState().playerIdentity?.snUserId;
      if (mySnUserId) {
        if (txn.sellerMhSnUserId === mySnUserId && shouldNotify("map_sold")) {
          showNotification(`mhcm-map-sold-${txn.id}`, "Community Marketplace", "Your treasure map was purchased!");
        }
        if (txn.buyerMhSnUserId === mySnUserId && shouldNotify("map_purchased")) {
          showNotification(`mhcm-map-purchased-${txn.id}`, "Community Marketplace", "Your map purchase is complete!");
        }
      }
    }
  }

  if (message.type === "my_orders") {
    const orders = message.payload.orders;
    setMyOrders(orders);

    // Check if we have open sell orders that need validation
    const openSellOrders = orders.filter(
      (o: any) => o.side === "sell" && (o.status === "open" || o.status === "partially_filled")
    );

    if (getState().sellOrderValidationPending) {
      if (openSellOrders.length === 0) {
        // No sell orders - complete validation immediately (nothing to protect)
        console.log("[mhcm] no open sell orders - completing validation immediately");
        completeSellOrderValidation();
      } else {
        // Have sell orders - start the 10-second timer for manual validation
        console.log("[mhcm] have open sell orders - starting 10s validation timer");
        const timeout = setTimeout(() => {
          triggerManualMapValidation();
        }, 10000);
        setSellOrderValidationTimeout(timeout);
      }
    }

    // Trigger buy order balance validation if we have balance
    if (getState().sbBalance !== null) {
      validateBuyOrdersBalance();
    }
  }

  if (message.type === "sniping_payment_grace") {
    const grace = getState().cachedSnipingPaymentGrace;
    // Replace existing entry for same txn or add new
    const idx = grace.findIndex((g) => g.transactionId === message.payload.transactionId);
    if (idx >= 0) {
      grace[idx] = message.payload;
    } else {
      grace.push(message.payload);
    }
  }
  if (message.type === "sniping_payment_resolved") {
    const grace = getState().cachedSnipingPaymentGrace;
    const idx = grace.findIndex((g) => g.transactionId === message.payload.transactionId);
    if (idx >= 0) grace.splice(idx, 1);
  }

  broadcastToPanel(message);
});

async function executeGameApiStep(
  tabId: number,
  message: ServerMessage & { type: "execute_step" }
): Promise<void> {
  const { transactionId, step, data } = message.payload;
  const state = getState();
  const uh = state.playerIdentity?.uniqueHash;

  if (!uh) {
    send({
      type: "step_result",
      payload: { transactionId, step, success: false, error: "No unique_hash available" },
    });
    return;
  }

  // Multi-call steps handled inline
  if (step === "validate_map") {
    await executeValidateMapStep(tabId, transactionId, step, uh, data);
    return;
  }
  if (step === "accept_invite") {
    await executeAcceptInviteStep(tabId, transactionId, step, uh, data);
    return;
  }
  if (step === "check_balance_and_transfer") {
    await executeBalanceCheckAndTransfer(tabId, transactionId, step, uh, data);
    return;
  }

  // RT steps – claim chest, open chest (reuses openScroll), transfer items (reuses transferSupplies)
  if (step === "rt_claim_chest") {
    await executeContentScriptCall(tabId, transactionId, step, "claimChest", [uh, data.mhMapId]);
    return;
  }
  if (step === "rt_open_chest") {
    await executeRtOpenChestStep(tabId, transactionId, step, uh, data);
    return;
  }
  if (step === "rt_transfer_item") {
    await executeContentScriptCall(tabId, transactionId, step, "transferSupplies", [uh, data.sellerSnUserId, data.itemType, data.quantity]);
    return;
  }

  let method: GameApiMethod;
  let args: any[];

  switch (step) {
    case "send_invite":
      method = "sendInvites";
      args = [uh, data.mhMapId, [(data as any).buyerSnUserId]];
      break;
    case "cancel_invite":
      method = "cancelInvites";
      args = [uh, data.mhMapId, [data.buyerSnUserId]];
      break;
    default:
      send({
        type: "step_result",
        payload: { transactionId, step, success: false, error: `Unknown step: ${step}` },
      });
      return;
  }

  await executeContentScriptCall(tabId, transactionId, step, method, args);
}

async function executeSnipingStep(
  tabId: number,
  message: ServerMessage & { type: "sniping_execute_step" }
): Promise<void> {
  const { transactionId, step, data } = message.payload;
  const uh = getState().playerIdentity?.uniqueHash;

  if (!uh) {
    verboseLog("snipe-sw", `EXEC STEP txn #${transactionId}, step=${step}: FAIL – no unique_hash`);
    sendStepResult("sniping_step_result", transactionId, step, false, "No unique_hash available");
    return;
  }

  verboseLog("snipe-sw", `EXEC STEP txn #${transactionId}, step=${step}, data=${JSON.stringify(data)}`);

  switch (step) {
    case "sniping_send_invite": {
      // Check if sniper is already on the map – skip invite if so
      verboseLog("snipe-sw", `  getMapInfo(${data.mhMapId}) to check if sniper already present`);
      const mapResult = await executeApiViaContentScript("getMapInfo", [uh, data.mhMapId]);
      if (mapResult.success && mapResult.data) {
        const hunters = mapResult.data.hunters;
        const sniperPresent = Array.isArray(hunters) && hunters.some((h: any) => String(h.sn_user_id) === String(data.sniperSnUserId) && h.is_active === true);
        verboseLog("snipe-sw", `  getMapInfo result: success, ${Array.isArray(hunters) ? hunters.length : 0} hunters, sniper ${data.sniperSnUserId} present=${sniperPresent}`);
        if (sniperPresent) {
          sendStepResult("sniping_step_result", transactionId, step, true);
          return;
        }

        // Check capacity – room for sniper?
        const activeHunters = Array.isArray(hunters)
          ? hunters.filter((h: any) => h.is_active !== false).length
          : 0;
        const invitedCount = mapResult.data.invited_hunters?.length ?? 0;
        const maxHunters = mapResult.data.max_hunters ?? 0;
        if (activeHunters + invitedCount >= maxHunters) {
          verboseLog("snipe-sw", `  map full: ${activeHunters} active + ${invitedCount} invited >= ${maxHunters} max`);
          send({
            type: "sniping_step_result",
            payload: { transactionId, step, success: false,
              error: "Map is full – no available slots for sniper", code: "map_full" },
          });
          return;
        }
      } else {
        verboseLog("snipe-sw", `  getMapInfo result: failed – ${mapResult.error ?? "unknown"}`);
      }
      await executeContentScriptCall(tabId, transactionId, step, "sendInvites", [uh, data.mhMapId, [data.sniperSnUserId]], "sniping_step_result");
      break;
    }

    case "sniping_accept_invite": {
      // Check if we're already on this map by querying live map data.
      // DO NOT use cachedActiveMaps – it goes stale after content-script API
      // calls (leaveMap, acceptInvite) because those bypass the main-world
      // XHR interceptor that normally updates the cache.
      const mySnUserId = getState().playerIdentity?.snUserId;
      verboseLog("snipe-sw", `  getMapInfo(${data.mhMapId}) to check if self already present`);
      const acceptMapResult = await executeApiViaContentScript("getMapInfo", [uh, data.mhMapId]);
      if (acceptMapResult.success && acceptMapResult.data) {
        const hunters = acceptMapResult.data.hunters;
        const selfPresent = Array.isArray(hunters) && mySnUserId && hunters.some((h: any) => String(h.sn_user_id) === String(mySnUserId) && h.is_active === true);
        verboseLog("snipe-sw", `  getMapInfo result: success, ${Array.isArray(hunters) ? hunters.length : 0} hunters, self ${mySnUserId} present=${selfPresent}`);
        if (selfPresent) {
          sendStepResult("sniping_step_result", transactionId, step, true);
          return;
        }
      } else {
        verboseLog("snipe-sw", `  getMapInfo result: failed – ${acceptMapResult.error ?? "unknown"}`);
      }
      // Reuse slot trading accept logic: exponential backoff polling, can_join check
      await executeAcceptInviteStep(tabId, transactionId, step, uh, data, "sniping_step_result");
      break;
    }

    case "sniping_transfer_sb": {
      verboseLog("snipe-sw", `  transferSupplies (SB) to ${data.targetSnUserId}, amount=${data.amount}`);
      const requestId = `${transactionId}-${step}`;
      try {
        const transferResponse = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: { requestId, method: "transferSupplies" as GameApiMethod, args: [uh, data.targetSnUserId, MH_SB_ITEM_TYPE, data.amount] },
        } satisfies ExecuteApiCallMessage);

        if (transferResponse?.success) {
          verboseLog("snipe-sw", `  transfer success`);
          send({
            type: "sniping_step_result",
            payload: { transactionId, step, success: true },
          });
        } else {
          // Transfer failed – check balance to determine if insufficient SB
          verboseLog("snipe-sw", `  transfer failed: ${transferResponse?.error ?? "unknown"}, checking balance...`);
          const balanceResult = await executeApiViaContentScript("getItemQuantity", [uh, MH_SB_ITEM_TYPE]);
          if (balanceResult.success && typeof balanceResult.data === "number" && balanceResult.data < (data.amount as number)) {
            verboseLog("snipe-sw", `  insufficient SB: have ${balanceResult.data}, need ${data.amount}`);
            send({
              type: "sniping_step_result",
              payload: { transactionId, step, success: false, error: `Insufficient SB: need ${data.amount}, have ${balanceResult.data}`, code: "insufficient_sb", sbBalance: balanceResult.data },
            });
          } else {
            // Balance check failed or balance is sufficient – generic failure
            send({
              type: "sniping_step_result",
              payload: { transactionId, step, success: false, error: transferResponse?.error || "Transfer failed" },
            });
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        verboseLog("snipe-sw", `  transfer exception: ${errMsg}`);
        send({
          type: "sniping_step_result",
          payload: { transactionId, step, success: false, error: errMsg },
        });
      }
      break;
    }

    case "sniping_leave_map":
      verboseLog("snipe-sw", `  leaveMap(${data.mhMapId})`);
      await executeContentScriptCall(tabId, transactionId, step, "leaveMap", [uh, data.mhMapId], "sniping_step_result");
      break;

    default:
      sendStepResult("sniping_step_result", transactionId, step, false, `Unknown sniping step: ${step}`);
      return;
  }
}

async function executeItemStep(
  tabId: number,
  message: ServerMessage & { type: "item_execute_step" }
): Promise<void> {
  const { transactionId, step, data } = message.payload;
  const uh = getState().playerIdentity?.uniqueHash;

  if (!uh) {
    send({
      type: "item_step_result",
      payload: { transactionId, step, success: false, error: "No unique_hash available" },
    });
    return;
  }

  const requestId = `item-${transactionId}-${step}`;

  try {
    switch (step) {
      case "item_validate_seller": {
        // Check seller has enough of the item
        const result = await executeApiViaContentScript("getItemQuantity", [uh, data.itemType as string]);
        if (result.success) {
          send({
            type: "item_step_result",
            payload: { transactionId, step, success: true, quantity: result.data as number },
          });
        } else {
          send({
            type: "item_step_result",
            payload: { transactionId, step, success: false, error: result.error || "Failed to check inventory" },
          });
        }
        break;
      }

      case "item_validate_buyer": {
        // Check buyer has enough SB
        const result = await executeApiViaContentScript("getItemQuantity", [uh, MH_SB_ITEM_TYPE]);
        if (result.success) {
          send({
            type: "item_step_result",
            payload: { transactionId, step, success: true, quantity: result.data as number },
          });
        } else {
          send({
            type: "item_step_result",
            payload: { transactionId, step, success: false, error: result.error || "Failed to check SB balance" },
          });
        }
        break;
      }

      case "item_transfer_items": {
        // Seller transfers items to buyer
        const transferTimestampUtc = new Date().toISOString();
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "transferSupplies" as GameApiMethod,
            args: [uh, data.receiverSnUserId as string, data.itemType as string, data.quantity as number],
          },
        } satisfies ExecuteApiCallMessage);

        send({
          type: "item_step_result",
          payload: {
            transactionId,
            step,
            success: !!response?.success,
            ...(response?.success
              ? { transferTimestampUtc }
              : { error: response?.error || "Item transfer failed" }),
          },
        });
        break;
      }

      case "item_transfer_sb": {
        // Buyer transfers SB to seller
        const transferTimestampUtc = new Date().toISOString();
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "transferSupplies" as GameApiMethod,
            args: [uh, data.receiverSnUserId as string, MH_SB_ITEM_TYPE, data.amount as number],
          },
        } satisfies ExecuteApiCallMessage);

        send({
          type: "item_step_result",
          payload: {
            transactionId,
            step,
            success: !!response?.success,
            ...(response?.success
              ? { transferTimestampUtc }
              : { error: response?.error || "SB transfer failed" }),
          },
        });
        break;
      }

      default:
        send({
          type: "item_step_result",
          payload: { transactionId, step, success: false, error: `Unknown item step: ${step}` },
        });
        return;
    }
  } catch (err) {
    send({
      type: "item_step_result",
      payload: {
        transactionId,
        step,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

async function executeMapStep(
  tabId: number,
  message: ServerMessage & { type: "map_execute_step" }
): Promise<void> {
  const { transactionId, step, data } = message.payload;
  const uh = getState().playerIdentity?.uniqueHash;

  if (!uh) {
    send({
      type: "map_step_result",
      payload: { transactionId, step, success: false, error: "No unique_hash available" },
    });
    return;
  }

  const requestId = `map-${transactionId}-${step}`;

  try {
    switch (step) {
      case "map_validate_scroll": {
        // Verify seller has scroll in inventory
        // getItemQuantity returns a plain number (e.g. 5), bridge wraps as { data: 5 }
        const result = await executeApiViaContentScript("getItemQuantity", [
          uh,
          data.scrollItemType as string,
        ]);
        if (result.success) {
          send({
            type: "map_step_result",
            payload: { transactionId, step, success: true, quantity: result.data as number },
          });
        } else {
          send({
            type: "map_step_result",
            payload: { transactionId, step, success: false, error: result.error || "Failed to check scroll inventory" },
          });
        }
        break;
      }

      case "map_validate_sb": {
        // Check buyer has enough SB (same as item_validate_buyer)
        const result = await executeApiViaContentScript("getItemQuantity", [uh, MH_SB_ITEM_TYPE]);
        if (result.success) {
          send({
            type: "map_step_result",
            payload: { transactionId, step, success: true, quantity: result.data as number },
          });
        } else {
          send({
            type: "map_step_result",
            payload: { transactionId, step, success: false, error: result.error || "Failed to check SB balance" },
          });
        }
        break;
      }

      case "map_validate_map": {
        // Verify map exists and has available slots
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "getMapInfo" as GameApiMethod,
            args: [uh, data.mhMapId as number],
          },
        } satisfies ExecuteApiCallMessage);

        if (!response?.success) {
          send({
            type: "map_step_result",
            payload: {
              transactionId,
              step,
              success: false,
              error: response?.error || "Failed to fetch map info",
            },
          });
          return;
        }

        const mapData = response.data;
        // Map transactions are always qty 1; need 1 open slot for buyer to join
        const activeHunters = mapData?.hunters?.filter((h: any) => h.is_active !== false)?.length ?? 0;
        const invitedHunters = mapData?.invited_hunters?.length ?? 0;
        const availableSlots = (mapData?.max_hunters ?? 0) - activeHunters - invitedHunters;

        send({
          type: "map_step_result",
          payload: {
            transactionId,
            step,
            success: availableSlots >= 1,
            error: availableSlots < 1 ? "No available slots on map" : undefined,
            code: availableSlots < 1 ? "no_slots_available" : undefined,
            mapInfo: mapData,
          },
        });
        break;
      }

      case "map_transfer_sb": {
        // Transfer SB from buyer to seller
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "transferSupplies" as GameApiMethod,
            args: [uh, data.receiverSnUserId as string, "super_brie_cheese", data.amount as number],
          },
        } satisfies ExecuteApiCallMessage);

        send({
          type: "map_step_result",
          payload: {
            transactionId,
            step,
            success: response?.success ?? false,
            error: response?.error,
          },
        });
        break;
      }

      case "map_open_scroll": {
        // Open scroll to discover map
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "openScroll" as GameApiMethod,
            args: [uh, data.scrollItemType as string],
          },
        } satisfies ExecuteApiCallMessage);

        send({
          type: "map_step_result",
          payload: {
            transactionId,
            step,
            success: response?.success ?? false,
            error: response?.error,
            mapId: response?.data?.mapId,
            mapType: response?.data?.mapType,
          },
        });
        break;
      }

      case "map_reverse_sb": {
        // Return SB from seller back to buyer (rollback on failure)
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "transferSupplies" as GameApiMethod,
            args: [uh, data.receiverSnUserId as string, "super_brie_cheese", data.amount as number],
          },
        } satisfies ExecuteApiCallMessage);

        send({
          type: "map_step_result",
          payload: {
            transactionId,
            step,
            success: response?.success ?? false,
            error: response?.error,
          },
        });
        break;
      }

      case "map_send_invite": {
        // Send map invite to buyer
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "sendInvites" as GameApiMethod,
            args: [uh, data.mhMapId as number, [data.buyerSnUserId as string]],
          },
        } satisfies ExecuteApiCallMessage);

        send({
          type: "map_step_result",
          payload: {
            transactionId,
            step,
            success: response?.success ?? false,
            error: response?.error,
          },
        });
        break;
      }

      case "map_cancel_invite": {
        // Cancel map invite to buyer (rollback on failure)
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "cancelInvites" as GameApiMethod,
            args: [uh, data.mhMapId as number, [data.buyerSnUserId as string]],
          },
        } satisfies ExecuteApiCallMessage);

        send({
          type: "map_step_result",
          payload: {
            transactionId,
            step,
            success: response?.success ?? false,
            error: response?.error,
          },
        });
        break;
      }

      case "map_accept_invite": {
        // Buyer accepts map invite
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "acceptInvite" as GameApiMethod,
            args: [uh, data.mhMapId as number],
          },
        } satisfies ExecuteApiCallMessage);

        send({
          type: "map_step_result",
          payload: {
            transactionId,
            step,
            success: response?.success ?? false,
            error: response?.error,
          },
        });
        break;
      }

      case "map_transfer_ownership": {
        // Transfer map ownership from seller to buyer (completed maps only)
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "transferOwnership" as GameApiMethod,
            args: [uh, data.mhMapId as number, data.buyerSnUserId as string],
          },
        } satisfies ExecuteApiCallMessage);

        send({
          type: "map_step_result",
          payload: {
            transactionId,
            step,
            success: response?.success ?? false,
            error: response?.error,
          },
        });
        break;
      }

      case "map_leave_map": {
        // Buyer leaves map (rollback on failure in unopened flow)
        const response = await chrome.tabs.sendMessage(tabId, {
          source: "mhcm-service-worker",
          type: "execute_api_call",
          payload: {
            requestId,
            method: "leaveMap" as GameApiMethod,
            args: [uh, data.mhMapId as number],
          },
        } satisfies ExecuteApiCallMessage);

        send({
          type: "map_step_result",
          payload: {
            transactionId,
            step,
            success: response?.success ?? false,
            error: response?.error,
          },
        });
        break;
      }

      default:
        send({
          type: "map_step_result",
          payload: {
            transactionId,
            step,
            success: false,
            error: `Unknown map step type: ${step}`,
          },
        });
    }
  } catch (err) {
    send({
      type: "map_step_result",
      payload: {
        transactionId,
        step,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

function sendStepResult(
  resultType: "step_result" | "sniping_step_result",
  transactionId: number,
  step: SlotTransactionStepType | SnipingStepType,
  success: boolean,
  error?: string,
  code?: "buyer_not_ready" | "no_slots_available" | "invite_not_found_exhausted"
): void {
  if (resultType === "sniping_step_result") {
    send({
      type: "sniping_step_result",
      payload: { transactionId, step: step as SnipingStepType, success, ...(error != null && { error }) },
    });
  } else {
    send({
      type: "step_result",
      payload: { transactionId, step: step as SlotTransactionStepType, success, ...(error != null && { error }), ...(code != null && { code }) },
    });
  }
}

async function executeContentScriptCall(
  tabId: number,
  transactionId: number,
  step: SlotTransactionStepType | SnipingStepType,
  method: GameApiMethod,
  args: any[],
  resultType: "step_result" | "sniping_step_result" = "step_result"
): Promise<void> {
  const requestId = `${transactionId}-${step}`;
  verboseLog("snipe-sw", `API CALL: method=${method}, args=${JSON.stringify(args)}, tabId=${tabId}`);

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      source: "mhcm-service-worker",
      type: "execute_api_call",
      payload: { requestId, method, args },
    } satisfies ExecuteApiCallMessage);

    if (response?.success) {
      verboseLog("snipe-sw", `API RESULT: txn #${transactionId}, step=${step} – success`);
      sendStepResult(resultType, transactionId, step, true);
    } else {
      const err = response?.error || "API call failed";
      verboseLog("snipe-sw", `API RESULT: txn #${transactionId}, step=${step} – failed: ${err}`);
      sendStepResult(resultType, transactionId, step, false, err);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    verboseLog("snipe-sw", `API RESULT: txn #${transactionId}, step=${step} – exception: ${errMsg}`);
    sendStepResult(resultType, transactionId, step, false, errMsg);
  }
}

async function executeValidateMapStep(
  tabId: number,
  transactionId: number,
  step: SlotTransactionStepType,
  uh: string,
  data: any
): Promise<void> {
  const requestId = `${transactionId}-${step}`;
  const { mhMapId, requiredSlots } = data;

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      source: "mhcm-service-worker",
      type: "execute_api_call",
      payload: { requestId, method: "getMapInfo" as GameApiMethod, args: [uh, mhMapId] },
    } satisfies ExecuteApiCallMessage);

    if (!response?.success) {
      send({
        type: "step_result",
        payload: { transactionId, step, success: false, error: response?.error || "Failed to fetch map info" },
      });
      return;
    }

    const mapData = response.data;
    if (!mapData) {
      send({
        type: "step_result",
        payload: { transactionId, step, success: false, error: "No map data returned" },
      });
      return;
    }

    // Check the map is still valid: owned, not complete, has enough slots
    if (!mapData.is_owner) {
      send({
        type: "step_result",
        payload: { transactionId, step, success: false, error: "Seller no longer owns this map" },
      });
      return;
    }

    if (mapData.is_complete) {
      send({
        type: "step_result",
        payload: { transactionId, step, success: false, error: "Map is already complete", code: "no_slots_available", availableSlots: 0 },
      });
      return;
    }

    // Filter is_active to exclude departed hunters (is_active: false)
    const activeHunters = mapData.hunters?.filter((h: any) => h.is_active !== false).length ?? 0;
    const invitedHunters = mapData.invited_hunters?.length ?? 0;
    const maxHunters = mapData.max_hunters ?? 5;
    const availableSlots = maxHunters - activeHunters - invitedHunters;

    if (availableSlots < requiredSlots) {
      send({
        type: "step_result",
        payload: {
          transactionId,
          step,
          success: false,
          error: `Not enough slots: need ${requiredSlots}, available ${availableSlots}`,
          code: "no_slots_available",
          availableSlots,
        },
      });
      return;
    }

    send({ type: "step_result", payload: { transactionId, step, success: true, availableSlots } });
  } catch (err) {
    send({
      type: "step_result",
      payload: {
        transactionId,
        step,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

/**
 * Accept invite step with pre-checks and exponential backoff retry:
 * 1. Poll for invite with exponential backoff (MH has propagation delay after send_invite)
 * 2. Check user is not already on a map (would prevent accepting invite)
 * 3. Check user has enough SB (only when amount is provided, i.e. slot trades)
 * 4. If all pass, call acceptInvite
 *
 * Shared by both slot trading and sniping transactions.
 * Reports code: "buyer_not_ready" on pre-check failures so the server
 * can deprioritize the buy order and try the next buyer.
 * Reports code: "invite_not_found_exhausted" after all retries fail so the server
 * can have the seller cancel the invite.
 */
async function executeAcceptInviteStep(
  tabId: number,
  transactionId: number,
  step: SlotTransactionStepType | SnipingStepType,
  uh: string,
  data: any,
  resultType: "step_result" | "sniping_step_result" = "step_result"
): Promise<void> {
  const { mhMapId, amount } = data;

  try {
    // Exponential backoff delays: wait 1s, then 4s more (5s total), then 5s more (10s total)
    // This gives MH up to 10 seconds to propagate the invite after send_invite returns
    const RETRY_DELAYS_MS = [1000, 4000, 5000];

    let invite: any = null;
    let lastError = "Invite not found";

    // Poll for invite with retries
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      // Wait before this attempt (except the first one)
      if (attempt > 0) {
        verboseLog("snipe-sw", `accept_invite: waiting ${RETRY_DELAYS_MS[attempt - 1]}ms before retry ${attempt}`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
      }

      const invitesResult = await executeApiViaContentScript("getReceivedInvites", [uh]);
      if (invitesResult.success && Array.isArray(invitesResult.data)) {
        // Debug: log what we're looking for vs what we got
        const inviteMapIds = invitesResult.data.map((inv: any) => ({
          raw: inv.map_id,
          type: typeof inv.map_id,
          asNum: Number(inv.map_id),
        }));
        verboseLog("snipe-sw", `accept_invite: looking for mhMapId=${mhMapId} (type: ${typeof mhMapId}), got invites:`, inviteMapIds);

        // MH API returns map_id as string, convert for comparison
        invite = invitesResult.data.find((inv: any) => Number(inv.map_id) === Number(mhMapId));
        if (invite) {
          verboseLog("snipe-sw", `accept_invite: found invite on attempt ${attempt + 1}`);
          break;
        }
      } else {
        lastError = invitesResult.error || "Failed to fetch invites";
        verboseLog("snipe-sw", `accept_invite: failed to get invites: ${lastError}`);
      }
    }

    // All retries exhausted - report so server can have seller cancel the invite
    if (!invite) {
      verboseLog("snipe-sw", `accept_invite: invite not found after all retries`);
      sendStepResult(resultType, transactionId, step, false, lastError, "invite_not_found_exhausted");
      return;
    }

    // Check can_join status (user might already be on another map)
    if (invite.can_join === false) {
      sendStepResult(resultType, transactionId, step, false, "Cannot join map – user may already be on another map", "buyer_not_ready");
      return;
    }

    // Pre-check: Does the user have enough SB? (only for slot trades that pass amount)
    if (amount != null && amount > 0) {
      const balanceResult = await executeApiViaContentScript("getItemQuantity", [uh, MH_SB_ITEM_TYPE]);
      if (balanceResult.success) {
        const balance = balanceResult.data;
        if (typeof balance === "number" && balance < amount) {
          sendStepResult(resultType, transactionId, step, false, `Insufficient SB: need ${amount}, have ${balance}`, "buyer_not_ready");
          return;
        }
      }
    }

    // All checks passed – accept the invite (retry on transient failures)
    const ACCEPT_RETRY_DELAYS = [1000, 2000, 4000];
    let lastAcceptError = "Accept invite failed";

    for (let attempt = 0; attempt <= ACCEPT_RETRY_DELAYS.length; attempt++) {
      const result = await executeApiViaContentScript("acceptInvite", [uh, mhMapId]);
      if (result.success) {
        verboseLog("snipe-sw", `accept_invite: accepted on attempt ${attempt + 1}`);
        sendStepResult(resultType, transactionId, step, true);
        return;
      }
      lastAcceptError = result.error || "Accept invite failed";
      if (attempt < ACCEPT_RETRY_DELAYS.length) {
        verboseLog("snipe-sw", `accept_invite: attempt ${attempt + 1} failed (${lastAcceptError}), retrying in ${ACCEPT_RETRY_DELAYS[attempt]}ms`);
        await new Promise((r) => setTimeout(r, ACCEPT_RETRY_DELAYS[attempt]));
      }
    }

    verboseLog("snipe-sw", `accept_invite: all ${ACCEPT_RETRY_DELAYS.length + 1} attempts failed: ${lastAcceptError}`);
    sendStepResult(resultType, transactionId, step, false, lastAcceptError);
  } catch (err) {
    sendStepResult(resultType, transactionId, step, false, err instanceof Error ? err.message : String(err));
  }
}

async function executeBalanceCheckAndTransfer(
  tabId: number,
  transactionId: number,
  step: SlotTransactionStepType,
  uh: string,
  data: any
): Promise<void> {
  const { sellerSnUserId, amount } = data;
  const balanceRequestId = `${transactionId}-${step}-balance`;

  try {
    // Step 1: Check balance
    const balanceResponse = await chrome.tabs.sendMessage(tabId, {
      source: "mhcm-service-worker",
      type: "execute_api_call",
      payload: {
        requestId: balanceRequestId,
        method: "getItemQuantity" as GameApiMethod,
        args: [uh, MH_SB_ITEM_TYPE],
      },
    } satisfies ExecuteApiCallMessage);

    if (!balanceResponse?.success) {
      send({
        type: "step_result",
        payload: {
          transactionId,
          step,
          success: false,
          error: balanceResponse?.error || "Failed to check SB balance",
        },
      });
      return;
    }

    const balance = balanceResponse.data;
    if (typeof balance !== "number" || balance < amount) {
      send({
        type: "step_result",
        payload: {
          transactionId,
          step,
          success: false,
          error: `Insufficient SB: need ${amount}, have ${balance ?? 0}`,
        },
      });
      return;
    }

    // Step 2: Transfer
    const transferRequestId = `${transactionId}-${step}-transfer`;
    const transferTimestampUtc = new Date().toISOString();
    const transferResponse = await chrome.tabs.sendMessage(tabId, {
      source: "mhcm-service-worker",
      type: "execute_api_call",
      payload: {
        requestId: transferRequestId,
        method: "transferSupplies" as GameApiMethod,
        args: [uh, sellerSnUserId, MH_SB_ITEM_TYPE, amount],
      },
    } satisfies ExecuteApiCallMessage);

    if (transferResponse?.success) {
      send({ type: "step_result", payload: { transactionId, step, success: true, transferTimestampUtc } });
    } else {
      send({
        type: "step_result",
        payload: {
          transactionId,
          step,
          success: false,
          error: transferResponse?.error || "SB transfer failed",
        },
      });
    }
  } catch (err) {
    send({
      type: "step_result",
      payload: {
        transactionId,
        step,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

async function executeRtOpenChestStep(
  tabId: number,
  transactionId: number,
  step: SlotTransactionStepType,
  uh: string,
  data: any
): Promise<void> {
  const { chestItemType } = data;
  const requestId = `${transactionId}-${step}`;

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      source: "mhcm-service-worker",
      type: "execute_api_call",
      payload: {
        requestId,
        method: "openChest" as GameApiMethod,
        args: [uh, chestItemType],
      },
    } satisfies ExecuteApiCallMessage);

    if (!response?.success) {
      send({
        type: "step_result",
        payload: {
          transactionId,
          step,
          success: false,
          error: response?.error || "Failed to open chest",
        },
      });
      return;
    }

    const result = response.data;
    const items: Array<{ type: string; name: string; quantity: number; thumbnail?: string }> = result?.items ?? [];
    const inventory: Record<string, { is_tradable?: boolean | null }> = result?.inventory ?? {};

    // Filter to tradable items: is_tradable === true (null = not tradable)
    const tradableItems = items
      .filter((item) => inventory[item.type]?.is_tradable === true)
      .map((item) => ({
        type: item.type,
        name: item.name,
        quantity: item.quantity,
        ...(item.thumbnail && { thumbnail: item.thumbnail }),
      }));

    send({
      type: "step_result",
      payload: {
        transactionId,
        step,
        success: true,
        tradableItems,
      },
    });
  } catch (err) {
    send({
      type: "step_result",
      payload: {
        transactionId,
        step,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

function refreshGameTab(): void {
  const tabId = getState().gameTabId;
  if (!tabId) return;

  chrome.tabs.sendMessage(tabId, {
    source: "mhcm-service-worker",
    type: "refresh_page",
  }).catch(() => {
    // Content script may not be available
  });
}

function shouldNotify(type: keyof NotificationPrefs): boolean {
  return getState().notificationPrefs[type] ?? true;
}

function showNotification(id: string, title: string, message: string): void {
  // 1x1 transparent PNG as placeholder (Chrome requires iconUrl for basic notifications)
  const placeholderIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: placeholderIcon,
    title,
    message,
  });
}

async function handleRiskCheckPrompt(payload: {
  transactionId: number;
  marketplace: "slot" | "map";
  mapTypeId: number;
  goalType: "mouse" | "item";
  remainingGoals: Array<{ uniqueId: number; type: string; name: string; thumbnail: string | null }>;
  itemRiskConfig?: Array<{ type: string; riskLocations: string[]; alwaysWarn: boolean }>;
  timeoutSeconds: number;
}): Promise<void> {
  const { transactionId, goalType, remainingGoals } = payload;

  // Helper: auto-accept (no risk found or unable to determine risk)
  const autoAccept = () => {
    send({
      type: "risk_check_response",
      payload: { transactionId, marketplace: payload.marketplace, decision: "accepted" as const, autoAccepted: true },
    });
  };

  if (goalType === "mouse") {
    // Call getMiceEffectiveness to find attractable mice
    const uh = getState().playerIdentity?.uniqueHash;
    if (!uh) {
      // No game identity – can't determine risk, auto-accept
      autoAccept();
      return;
    }

    try {
      const result = await executeApiViaContentScript("getMiceEffectiveness", [uh]);
      if (result.success && result.data) {
        const { mice, environmentType } = result.data as {
          mice: Array<{ type: string; name: string }>;
          environmentType: string | null;
        };

        // Build set of attractable mouse types for fast lookup
        const attractableTypes = new Set(mice.map((m: { type: string }) => m.type));

        // Check which remaining goals are at risk
        const atRiskGoals = remainingGoals
          .filter((g) => attractableTypes.has(g.type))
          .map((g) => ({ type: g.type, reason: "You can currently attract this mouse" }));

        if (atRiskGoals.length === 0) {
          // No risk detected – auto-accept silently
          autoAccept();
          return;
        }

        // Risk found – forward to panel with enriched data
        broadcastRawToPanel({
          type: "risk_check_show_prompt",
          payload: { ...payload, atRiskGoals, environmentType },
        });
        return;
      }
    } catch (err) {
      console.warn("[mhcm] getMiceEffectiveness failed:", err);
    }

    // API call failed – can't determine risk, auto-accept
    autoAccept();
  } else {
    // Item goals – check buyer's location against item risk config
    const riskConfig = payload.itemRiskConfig;
    if (!riskConfig || riskConfig.length === 0) {
      // No risk config available – auto-accept
      autoAccept();
      return;
    }

    try {
      const result = await executeApiViaContentScript("getPlayerEnvironment", []);
      if (result.success && result.data) {
        const { environmentType } = result.data as { environmentType: string | null };

        // Build at-risk goals list
        const atRiskGoals: Array<{ type: string; reason: string }> = [];
        const configByType = new Map(riskConfig.map((c) => [c.type, c]));

        for (const goal of remainingGoals) {
          const cfg = configByType.get(goal.type);
          if (!cfg) continue;

          if (cfg.alwaysWarn) {
            atRiskGoals.push({ type: goal.type, reason: "This item requires manual risk confirmation" });
          } else if (environmentType && cfg.riskLocations.includes(environmentType)) {
            atRiskGoals.push({ type: goal.type, reason: `You are currently in a risk location for this item` });
          }
        }

        if (atRiskGoals.length === 0) {
          autoAccept();
          return;
        }

        // Risk found – forward to panel
        broadcastRawToPanel({
          type: "risk_check_show_prompt",
          payload: { ...payload, atRiskGoals, environmentType },
        });
        return;
      }
    } catch (err) {
      console.warn("[mhcm] getPlayerEnvironment failed:", err);
    }

    // Fallback: can't determine environment – auto-accept
    autoAccept();
  }
}

function broadcastToPanel(message: ServerMessage): void {
  chrome.runtime
    .sendMessage({ type: "ws_message", payload: message })
    .catch(() => {
      // Panel may not be open
    });
}

function broadcastRawToPanel(message: any): void {
  chrome.runtime
    .sendMessage(message)
    .catch(() => {
      // Panel may not be open
    });
}

const verificationAttemptSeen = new Map<number, number>();

async function handleVerifyTransfer(payload: {
  transactionId: number;
  verificationType: VerificationType;
  attemptNumber: number;
  senderMhUserId?: string;
  itemDisplayName?: string;
  quantity?: number;
  transferTimestampUtc?: string;
  mapId?: number;
  expectedHunterSnUserId?: string;
}): Promise<void> {
  const { transactionId, verificationType, attemptNumber } = payload;

  const seen = verificationAttemptSeen.get(transactionId) ?? 0;
  if (seen >= attemptNumber) return;
  verificationAttemptSeen.set(transactionId, attemptNumber);

  let verified = false;
  try {
    verified = await runVerification(payload);
  } catch (err) {
    console.warn("[mhcm] verify_transfer error:", err);
  }

  send({
    type: "verify_transfer_result",
    payload: { transactionId, verificationType, verified },
  });
}

async function runVerification(payload: Parameters<typeof handleVerifyTransfer>[0]): Promise<boolean> {
  const { verificationType } = payload;

  if (verificationType === "item_receipt" || verificationType === "sb_receipt") {
    return checkMessageReceipt(payload);
  }

  if (verificationType === "invite_received") {
    return checkInviteReceived(payload);
  }

  if (verificationType === "invite_accepted" || verificationType === "party_left") {
    return checkMapHunterPresence(payload);
  }

  if (verificationType === "ownership_transferred") {
    return checkMapOwnership(payload);
  }

  // scroll_opened, goal_completed – implemented in future phases
  console.warn(`[mhcm] verify_transfer: unhandled verificationType "${verificationType}"`);
  return false;
}

async function checkInviteReceived(payload: Parameters<typeof handleVerifyTransfer>[0]): Promise<boolean> {
  const { mapId } = payload;
  if (mapId == null) {
    console.warn("[mhcm] checkInviteReceived: missing mapId");
    return false;
  }

  const uh = getState().playerIdentity?.uniqueHash;
  if (!uh) return false;

  const result = await executeApiViaContentScript("getReceivedInvites", [uh]);
  if (!result.success || !Array.isArray(result.data)) return false;

  return result.data.some((inv: any) => Number(inv.map_id) === mapId);
}

async function checkMapHunterPresence(payload: Parameters<typeof handleVerifyTransfer>[0]): Promise<boolean> {
  const { mapId, expectedHunterSnUserId, verificationType } = payload;
  if (mapId == null || !expectedHunterSnUserId) {
    console.warn("[mhcm] checkMapHunterPresence: missing mapId or expectedHunterSnUserId");
    return false;
  }

  const uh = getState().playerIdentity?.uniqueHash;
  if (!uh) return false;

  const result = await executeApiViaContentScript("getMapInfo", [uh, mapId]);
  if (!result.success || !result.data) return false;

  const hunters: any[] = result.data.hunters ?? [];
  const isPresent = hunters.some(
    (h: any) => String(h.sn_user_id) === String(expectedHunterSnUserId) && h.is_active === true
  );

  // For invite_accepted: hunter must be present. For party_left: hunter must be absent.
  return verificationType === "party_left" ? !isPresent : isPresent;
}

async function checkMapOwnership(payload: Parameters<typeof handleVerifyTransfer>[0]): Promise<boolean> {
  const { mapId } = payload;
  if (mapId == null) {
    console.warn("[mhcm] checkMapOwnership: missing mapId");
    return false;
  }

  const uh = getState().playerIdentity?.uniqueHash;
  if (!uh) return false;

  const result = await executeApiViaContentScript("getMapInfo", [uh, mapId]);
  if (!result.success || !result.data) return false;

  return result.data.is_owner === true;
}

async function checkMessageReceipt(payload: Parameters<typeof handleVerifyTransfer>[0]): Promise<boolean> {
  const { senderMhUserId, itemDisplayName, quantity, transferTimestampUtc } = payload;

  if (!senderMhUserId || !itemDisplayName || quantity == null || !transferTimestampUtc) {
    console.warn("[mhcm] checkMessageReceipt: missing challenge fields");
    return false;
  }

  const [result, utcOffset] = await Promise.all([
    executeApiViaContentScript("fetchMessages", []),
    (async (): Promise<number> => {
      if (getState().gameSettings?.utcOffset != null) return getState().gameSettings!.utcOffset;
      const uh = getState().playerIdentity?.uniqueHash;
      if (!uh) return 0;
      const r = await executeApiViaContentScript("fetchPreferencesPage", [uh]);
      return r.success ? ((r.data?.utc_offset as number) ?? 0) : 0;
    })(),
  ]);

  if (!result.success || !Array.isArray(result.data)) return false;

  const transferTs = Date.parse(transferTimestampUtc);
  const windowStart = transferTs - 2_000;
  const windowEnd = transferTs + 3_000;

  for (const msg of result.data as Array<{
    senderMhUserId: string;
    itemDisplayName: string;
    quantity: number;
    messageDateLocal: string;
  }>) {
    if (msg.senderMhUserId !== senderMhUserId) continue;
    if (msg.itemDisplayName !== itemDisplayName) continue;
    if (msg.quantity !== quantity) continue;

    // Convert local messageDate to UTC using ISO 8601 format (space→T, append Z)
    const messageUtc = Date.parse(msg.messageDateLocal.replace(" ", "T") + "Z") - utcOffset * 3_600_000;
    if (messageUtc >= windowStart && messageUtc <= windowEnd) {
      return true;
    }
  }

  return false;
}
