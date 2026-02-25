import { useEffect } from "preact/hooks";
import { MH_SB_ITEM_TYPE, type ServerMessage } from "@mhcm/shared";
import { getPlatform } from "../platform/index.js";
import { wsConnected } from "../signals/connection.js";
import { playerIdentity, sbBalance, activeMaps, playerTitleId, realPlayerTitleId, playerTitleName } from "../signals/game-state.js";
import { isAfk, afkWarning, authError, gameSettingsValid, gameSettings } from "../signals/auth.js";
import { logout } from "./useAuth.js";
import { handleSharedMessage } from "./message-handlers/shared-messages.js";
import { handleSlotMessage } from "./message-handlers/slot-messages.js";
import { handleSnipingMessage } from "./message-handlers/sniping-messages.js";
import { handleItemMessage } from "./message-handlers/item-messages.js";
import { handleMapMessage } from "./message-handlers/map-messages.js";
import { handleAdminMessage } from "./message-handlers/admin-messages.js";
import { handleModMessage } from "./message-handlers/mod-messages.js";
import { handleRiskCheckShowPrompt, handleRiskCheckServerMessage } from "./message-handlers/risk-check-messages.js";

export function sendToWorker(message: any): Promise<any> {
  return getPlatform().sendMessage(message).catch((err) => {
    console.warn("[panel] failed to send message:", err);
    return undefined;
  });
}

export function wsSend(payload: any): void {
  sendToWorker({ type: "ws_send", payload });
}

export function openInGameTab(url: string): void {
  sendToWorker({ type: "navigate_url", payload: { url } });
}

/**
 * Fetch current SB balance from game API and request available SB calculation.
 * This is the centralized SB balance fetching logic used by all marketplaces.
 * Returns a promise that resolves when the balance has been fetched and set.
 */
export async function refreshAvailableSb(): Promise<void> {
  const uh = playerIdentity.value?.uniqueHash;
  if (!uh) {
    console.warn("[refreshAvailableSb] No player identity available");
    return;
  }

  try {
    const result = await sendToWorker({
      type: "execute_api_via_content",
      payload: { method: "getItemQuantity", args: [uh, MH_SB_ITEM_TYPE] },
    });

    if (result?.success && typeof result.data === "number") {
      sbBalance.value = result.data;
      // Now request available SB calculation from server
      wsSend({ type: "get_available_sb", payload: {} });
    }
  } catch (err) {
    console.warn("[refreshAvailableSb] Failed to fetch balance:", err);
  }
}

function fetchInitialData(): void {
  // Slot data
  wsSend({ type: "get_my_orders" });
  wsSend({ type: "get_transactions" });
  wsSend({ type: "get_transaction_history", payload: { perPage: 15 } });
  wsSend({ type: "get_home_data" });
  wsSend({ type: "get_favourites" });
  wsSend({ type: "get_subscriptions" });
  wsSend({ type: "get_notification_prefs" });

  // Sniping data
  wsSend({ type: "get_my_sniping_orders" });
  wsSend({ type: "get_sniping_home_data" });
  wsSend({ type: "get_sniping_favourites" });
  wsSend({ type: "get_sniping_transaction_history", payload: { perPage: 15 } });
  wsSend({ type: "get_active_sniping_transactions" });

  // Item data
  wsSend({ type: "get_item_types" });
  wsSend({ type: "get_item_home_data" });
  wsSend({ type: "get_item_favourites" });
  wsSend({ type: "get_item_notifications" });
  wsSend({ type: "get_my_item_orders" });
  wsSend({ type: "get_item_transaction_history", payload: { perPage: 15 } });

  // Map data
  wsSend({ type: "get_my_map_orders" });
  wsSend({ type: "get_map_notifications" });
  wsSend({ type: "get_map_transaction_history", payload: { page: 1, perPage: 15 } });
}

export function useServiceWorker(): void {
  useEffect(() => {
    const platform = getPlatform();

    // Get initial state
    platform.sendMessage({ type: "get_connection_status" }).then((res) => {
      if (res?.payload) {
        wsConnected.value = res.payload.connected;
        if (res.payload.connected) {
          fetchInitialData();
        }
      }
    });

    platform.sendMessage({ type: "get_game_state" }).then((res) => {
      if (res?.payload?.playerIdentity) {
        playerIdentity.value = res.payload.playerIdentity;
      }
      if (res?.payload?.sbBalance != null) {
        sbBalance.value = res.payload.sbBalance;
      }
      if (res?.payload?.activeMaps?.length) {
        activeMaps.value = res.payload.activeMaps;
      }
      if (res?.payload?.playerTitleId != null) {
        playerTitleId.value = res.payload.playerTitleId;
        realPlayerTitleId.value = res.payload.playerTitleId;
      }
      if (res?.payload?.playerTitleName != null) {
        playerTitleName.value = res.payload.playerTitleName;
      }
    });

    // Listen for messages from the backend bridge
    const unsubscribe = platform.onMessage((message: any) => {
      if (message?.type === "ws_message") {
        handleServerMessage(message.payload);
      }
      if (message?.type === "connection_status") {
        const wasConnected = wsConnected.value;
        wsConnected.value = message.payload.connected;
        if (!wasConnected && message.payload.connected) {
          fetchInitialData();
        }
      }
      if (message?.type === "game_state") {
        if (message.payload?.playerIdentity) {
          playerIdentity.value = message.payload.playerIdentity;
        }
        if (message.payload?.sbBalance != null) {
          sbBalance.value = message.payload.sbBalance;
        }
        if (message.payload?.activeMaps) {
          activeMaps.value = message.payload.activeMaps;
        }
        if (message.payload?.playerTitleId != null) {
          playerTitleId.value = message.payload.playerTitleId;
          realPlayerTitleId.value = message.payload.playerTitleId;
        }
        if (message.payload?.playerTitleName !== undefined) {
          playerTitleName.value = message.payload.playerTitleName;
        }
      }
      if (message?.type === "afk_status") {
        isAfk.value = message.payload.isAfk;
        afkWarning.value = message.payload.warning;
      }
      if (message?.type === "game_settings") {
        gameSettingsValid.value = message.payload.valid;
        gameSettings.value = {
          allowMapInvites: message.payload.allowMapInvites,
          allowAnonymousSupplyTransfers: message.payload.allowAnonymousSupplyTransfers,
        };
      }
      if (message?.type === "auth_expired") {
        logout();
        authError.value = message.payload.reason;
      }
      if (message?.type === "risk_check_show_prompt") {
        handleRiskCheckShowPrompt(message.payload);
      }
    });

    // Tell the backend bridge we're ready
    sendToWorker({ type: "panel_ready" });

    return unsubscribe;
  }, []);
}

function handleServerMessage(message: ServerMessage): void {
  if (handleSharedMessage(message)) return;
  if (handleSlotMessage(message)) return;
  if (handleSnipingMessage(message)) return;
  if (handleItemMessage(message)) return;
  if (handleMapMessage(message)) return;
  if (handleModMessage(message)) return;
  if (handleAdminMessage(message)) return;
  if (handleRiskCheckServerMessage(message)) return;
}
