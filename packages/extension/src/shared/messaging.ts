export type ContentToWorkerMessage =
  | GameStateUpdateMessage
  | ApiResultMessage
  | XhrLogMessage;

export interface XhrLogMessage {
  type: "xhr_log";
  payload: {
    source: "api_call" | "xhr_intercept";
    url: string;
    requestBody?: Record<string, string>;
    responseData: any;
    timestamp: string;
  };
}

export interface GameStateUpdateMessage {
  type: "game_state_update";
  payload:
    | {
        type: "identity";
        userId: number;
        snUserId: string;
        uniqueHash: string;
        email: string | null;
        lastReadJournalEntryId: number | null;
        titleId?: number | null;
        titleName?: string | null;
      }
    | {
        type: "sb_balance";
        balance: number;
      }
    | {
        type: "map_discovered";
        mapType: string;
        quality: "common" | "rare";
        name: string;
        maxHunters: number;
        mapId: number;
        isOwner: boolean;
        rewardType: string;
        thumbnail: string;
        mapClass: string;
        isScavengerHunt: boolean;
        minTitleName: string;
      }
    | {
        type: "active_maps_detected";
        maps: Array<{
          map_id: number;
          name: string;
          num_found: number;
          num_total: number;
          is_rare: boolean | null;
          map_class: string;
        }>;
      }
    | {
        type: "catches_detected";
        mapId: number;
        goalType: "mouse" | "item";
        hunterCatches: Array<{ snUserId: string; completedGoalIds: number[] }>;
      }
    | {
        type: "map_complete_detected";
        mapId: number;
        mapName: string;
      }
    | {
        type: "map_hunters_updated";
        mapId: number;
        numActiveHunters: number;
        maxHunters: number;
        invitedHunters: string[];
        isOwner: boolean;
      }
    | { type: "player_rank"; titleId: number; titleName?: string };
}

export interface ApiResultMessage {
  type: "api_result";
  payload: {
    requestId: string;
    success: boolean;
    data?: any;
    error?: string;
  };
}

export type WorkerToContentMessage =
  | ExecuteApiCallMessage
  | RefreshPageMessage
  | NavigateUrlMessage
  | TogglePanelMessage;

export interface RefreshPageMessage {
  source: "mhcm-service-worker";
  type: "refresh_page";
}

export interface NavigateUrlMessage {
  source: "mhcm-service-worker";
  type: "navigate_url";
  payload: { url: string };
}

export interface TogglePanelMessage {
  source: "mhcm-service-worker";
  type: "toggle_panel";
}

export interface ExecuteApiCallMessage {
  source: "mhcm-service-worker";
  type: "execute_api_call";
  payload: {
    requestId: string;
    method: GameApiMethod;
    args: any[];
  };
}

export type GameApiMethod =
  | "getMapInventory"
  | "getMapInfo"
  | "sendInvites"
  | "cancelInvites"
  | "getReceivedInvites"
  | "acceptInvite"
  | "transferOwnership"
  | "leaveMap"
  | "claimChest"
  | "transferSupplies"
  | "getItemQuantity"
  | "openChest"
  | "openScroll"
  | "postToCorkBoard"
  | "getHunterProfile"
  | "fetchCampPage"
  | "fetchPreferencesPage"
  | "getMiceEffectiveness"
  | "getPlayerEnvironment"
  | "fetchMessages";

export type PanelToWorkerMessage =
  | { type: "panel_ready" }
  | { type: "get_connection_status" }
  | { type: "get_game_state" }
  | { type: "refresh_game_state" }
  | { type: "ws_send"; payload: any }
  | { type: "execute_api_via_content"; payload: { method: GameApiMethod; args: any[] } }
  | { type: "navigate_url"; payload: { url: string } }
  | { type: "set_notification_prefs"; payload: import("@mhcm/shared").NotificationPrefs }
  | { type: "recheck_game_settings" };

export type WorkerToPanelMessage =
  | { type: "connection_status"; payload: { connected: boolean } }
  | { type: "game_state"; payload: any }
  | { type: "ws_message"; payload: any }
  | { type: "auth_expired"; payload: { reason: string } }
  | { type: "game_settings"; payload: { valid: boolean; allowMapInvites: boolean; allowAnonymousSupplyTransfers: boolean } }
  | { type: "risk_check_show_prompt"; payload: RiskCheckShowPromptPayload };

export interface RiskCheckShowPromptPayload {
  transactionId: number;
  marketplace: "slot" | "map";
  mapTypeId: number;
  goalType: "mouse" | "item";
  remainingGoals: Array<{ uniqueId: number; type: string; name: string; thumbnail: string | null }>;
  timeoutSeconds: number;
  atRiskGoals: Array<{ type: string; reason: string }>;
  environmentType: string | null;
}
