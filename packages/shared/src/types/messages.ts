import type { MarketType, BetaRequest, NotificationPrefs, UserRole, UserStatus, Suspension } from "./auth.js";
import type {
  AdjustSlotOrderPayload,
  CancelSlotOrderPayload,
  CreateSlotOrderPayload,
  SlotOrder,
  SlotOrderBookSnapshot,
  SlotTransaction,
  SlotTransactionState,
  SlotTransactionStep,
  SlotTransactionStepType,
  SlotTransactionHistoryLine,
  SlotOrderHistoryGroup,
} from "./slots.js";
import type { MHMapClass } from "./api.js";
import type {
  DiscoveredMapType,
  MapType,
  MapTypeStats,
  GoalType,
  Scroll,
  CreateMapOrderPayload,
  CancelMapOrderPayload,
  AdjustMapOrderPayload,
  MapOrder,
  MapOrderBookSnapshot,
  MapTransaction,
  MapTransactionStep,
  MapStepType,
  MapHomeData,
  MapOrderHistoryGroup,
  MapMarketStats,
  MapOrderMode,
} from "./maps.js";
import type { MouseTier, MouseType, MouseMapTier, MouseAlias } from "./mice.js";
import type {
  CreateSnipingOrderPayload,
  CancelSnipingOrderPayload,
  SnipingOrder,
  SnipingOrderBookSnapshot,
  SnipingTarget,
  SnipingTransaction,
  SnipingPriceSuggestion,
  SnipingMouseGroup,
  SnipingItemGroup,
  SnipingMapHistoryGroup,
} from "./sniping.js";
import type {
  CreateItemOrderPayload,
  CancelItemOrderPayload,
  AdjustItemOrderPayload,
  ItemOrder,
  ItemOrderBookSnapshot,
  ItemTransaction,
  ItemTransactionStep,
  ItemStepType,
  ItemHomeData,
  ItemOrderHistoryGroup,
  ItemType,
  ItemMarketStats,
} from "./items.js";
import type { Rank } from "./ranks.js";
import type { ActiveAlert, AdminAlert, AlertType } from "./alerts.js";


export interface HomeMapItem {
  mapTypeId: number;
  displayName: string;
  thumbnail: string | null;
  avgPrice: number | null;
}

export interface HomeData {
  topSelling: HomeMapItem[];
  highValue: HomeMapItem[];
  inDemand: HomeMapItem[];
}

export interface SnipingHomeGoalItem {
  mouseTypeId?: number;
  mouseGroupId?: number;
  itemTypeId?: number;
  itemGroupId?: number;
  name: string;
  thumbnail: string | null;
  avgPrice: number | null;
  /** True if this represents a group (mouse group or item group). */
  isGroup?: boolean;
}

/** @deprecated Use SnipingHomeGoalItem instead. */
export type SnipingHomeMouseItem = SnipingHomeGoalItem;

export interface SnipingHomeData {
  topSelling: SnipingHomeGoalItem[];
  highValue: SnipingHomeGoalItem[];
  inDemand: SnipingHomeGoalItem[];
  favourites: SnipingHomeGoalItem[];
}

export interface SnipingWizardMouse {
  mouseTypeId: number;
  name: string;
  thumbnail: string | null;
  avg7d: number | null;
  avg30d: number | null;
}

export interface SnipingWizardGroupMember {
  mouseTypeId: number;
  name: string;
  thumbnail: string | null;
}

export interface SnipingWizardGroup {
  groupId: number;
  name: string;
  mice: SnipingWizardGroupMember[];
  avg7d: number | null;
  avg30d: number | null;
}

export type SnipingStepType =
  | "sniping_send_invite"
  | "sniping_accept_invite"
  | "sniping_transfer_sb"
  | "sniping_leave_map";

export interface RtPendingItem {
  id: number;
  transactionId: number;
  itemType: string;
  itemName: string;
  quantity: number;
  transferred: boolean;
  transferredAt: string | null;
}

export type ClientMessage =
  | ClientReportVersion
  | ClientPing
  | ClientCreateOrder
  | ClientCancelOrder
  | ClientAdjustOrder
  | ClientSubscribeOrderBook
  | ClientUnsubscribeOrderBook
  | ClientStepResult
  | ClientLeaveMapResult
  | ClientConfirmMHLink
  | ClientVerifyMHLink
  | ClientVerifyMHLinkResult
  | ClientReportMapTypes
  | ClientGetMyOrders
  | ClientGetTransactions
  | ClientUserAfk
  | ClientUserActive
  | ClientMapsRemoved
  | ClientGetTransactionHistory
  | ClientGetHomeData
  | ClientGetFavourites
  | ClientAddFavourite
  | ClientRemoveFavourite
  // Map type notification subscriptions
  | ClientGetSubscriptions
  | ClientSubscribeMapType
  | ClientUnsubscribeMapType
  // Notification preferences
  | ClientGetNotificationPrefs
  | ClientUpdateNotificationPrefs
  // Map completion
  | ClientMapCompletedReport
  // Mod: Mouse tier management
  | ClientModListMice
  | ClientModSetMouseTier
  | ClientModSetMouseMapTier
  | ClientModDeleteMouseMapTier
  | ClientModGetMouseMapTiers
  | ClientModGetMapMouseTiers
  // Mod: Mouse aliases
  | ClientModGetMouseAliases
  | ClientModAddMouseAlias
  | ClientModDeleteMouseAlias
  | ClientModUpdateMouseAlias
  // Admin: Settings
  | ClientAdminGetSettings
  | ClientAdminSetAllowAnyGoalCount
  // Mod: Mouse groups
  | ClientModListGroups
  | ClientModCreateGroup
  | ClientModToggleGroup
  | ClientModArchiveGroup
  | ClientModDeleteGroup
  | ClientModGetGroupMembers
  // Sniping marketplace
  | ClientCreateSnipingOrder
  | ClientCancelSnipingOrder
  | ClientGetSnipingOrderBook
  | ClientSearchMice
  | ClientGetSnipingPriceSuggestion
  | ClientSubscribeSnipingOrderBook
  | ClientUnsubscribeSnipingOrderBook
  | ClientGetMySnipingOrders
  | ClientMouseCaught
  | ClientSniperLeftMap
  | ClientUpdateActiveMaps
  | ClientSnipingStepResult
  // Sniping home + favourites + wizard
  | ClientGetSnipingHomeData
  | ClientGetSnipingFavourites
  | ClientAddSnipingFavourite
  | ClientRemoveSnipingFavourite
  | ClientListMice
  | ClientGetSnipingWizardData
  | ClientGetSnipingTransactionHistory
  | ClientGetActiveSnipingTransactions
  // Admin: Server management
  | ClientAdminGracefulRestart
  | ClientAdminForceRestart
  | ClientAdminCancelRestart
  // Admin: XHR diagnostic logging
  | ClientAdminSetXhrLogging
  | ClientXhrLog
  // Item marketplace
  | ClientCreateItemOrder
  | ClientCancelItemOrder
  | ClientAdjustItemOrder
  | ClientSubscribeItemOrderBook
  | ClientUnsubscribeItemOrderBook
  | ClientGetItemOrderBook
  | ClientGetItemTypes
  | ClientGetItemHomeData
  | ClientGetMyItemOrders
  | ClientItemStepResult
  | ClientGetItemTransactionHistory
  // Item favourites + notifications
  | ClientGetItemFavourites
  | ClientToggleItemFavourite
  | ClientGetItemNotifications
  | ClientToggleItemNotification
  // Mod: Item management
  | ClientModListItems
  | ClientModToggleItem
  | ClientModSetItemAlias
  | ClientModSetItemThumbnail
  // Mod: Item risk settings
  | ClientModSetItemAlwaysWarn
  | ClientModGetItemRiskLocations
  | ClientModAddItemRiskLocation
  | ClientModRemoveItemRiskLocation
  | ClientModSearchEnvironments
  // Mod: Item tier management
  | ClientModSetItemTier
  | ClientModSetItemMapTier
  | ClientModDeleteItemMapTier
  | ClientModGetItemMapTiers
  | ClientModGetMapItemTiers
  // Mod: Item groups (sniping)
  | ClientModListItemGroups
  | ClientModCreateItemGroup
  | ClientModToggleItemGroup
  | ClientModArchiveItemGroup
  | ClientModDeleteItemGroup
  | ClientModGetItemGroupMembers
  // Admin: Item sync
  | ClientAdminSyncItems
  // Item sniping
  | ClientSearchItems
  | ClientListItems
  | ClientItemFound
  | ClientGetSnipingItemWizardData
  // Map marketplace
  | ClientCreateMapOrder
  | ClientCancelMapOrder
  | ClientAdjustMapOrder
  | ClientSubscribeMapOrderBook
  | ClientUnsubscribeMapOrderBook
  | ClientGetMapOrderBook
  | ClientGetMapHomeData
  | ClientGetMyMapOrders
  | ClientMapStepResult
  | ClientGetMapTransactionHistory
  | ClientToggleMapNotification
  | ClientGetMapNotifications
  | ClientToggleMapFavourite
  | ClientGetMapFavourites
  | ClientGetMapTypes
  | ClientGetMapTier
  // Cross-marketplace: SB reservation
  | ClientGetAvailableSb
  // Mod: Map class management
  | ClientModSetMapClass
  | ClientModSetMapSupportsRt
  // Mod: Scroll management
  | ClientModGetScrolls
  | ClientModSetMapScroll
  | ClientModSetMapMinRank
  // Admin: Scroll sync
  | ClientAdminSyncScrolls
  // Mod: Rank management
  | ClientModGetRanks
  // Admin: Rank sync
  | ClientAdminSyncRanks
  // Game settings validation
  | ClientReportGameSettings
  // Beta access
  | ClientApplyForBeta
  // Admin: Market beta
  | ClientAdminSetMarketBeta
  | ClientAdminGetBetaRequests
  | ClientAdminApproveBetaRequest
  | ClientAdminDenyBetaRequest
  // Admin: Alerts
  | ClientAdminGetAlerts
  | ClientAdminCreateAlert
  | ClientAdminUpdateAlert
  | ClientAdminDeleteAlert
  | ClientAdminSetVersionAlert
  // User: Alerts
  | ClientAcknowledgeAlert
  | ClientDismissVersionAlert
  // Admin: Data sync (maps, mice)
  | ClientAdminSyncMaps
  | ClientAdminSyncMice
  // Admin: Market enabled
  | ClientAdminSetMarketEnabled
  // Admin: Rate limits
  | ClientAdminSetRateLimits
  // Admin: Rank override (testing)
  | ClientAdminSetRankOverride
  // Admin: Risk check timeout
  | ClientAdminSetRiskCheckTimeout
  | ClientAdminSetDemoMarketVisible
  // Admin: Environment sync
  | ClientAdminSyncEnvironments
  // Admin: MH account management
  | ClientAdminResetMHLink
  // Risk check
  | ClientRiskCheckResponse
  | ClientRiskCheckRetry
  // Onboarding
  | ClientCompleteOnboardingStep
  // Admin: Onboarding
  | ClientAdminSetOnboardingStepEnabled
  | ClientAdminGetOnboardingStats
  // Admin: Verification method
  | ClientAdminSetVerificationMethod
  // RT (Return Tradables)
  | ClientRtManualConfirm
  // Mod: Map type management (WS)
  | ClientModGetMapTypes
  | ClientModToggleMapTypeMarket
  | ClientModSetMapTypeAlias
  | ClientModSetMapTypeThumbnail
  | ClientModSetMapTypeLastGoalCount
  // Mod: User management (WS)
  | ClientModGetUsers
  | ClientModSuspendUser
  | ClientModUnsuspendUser
  | ClientModGetSuspensions
  // Admin: User management (WS)
  | ClientAdminGetUsers
  | ClientAdminGetUser
  | ClientAdminSetUserRoleWs
  | ClientAdminGetAuditLog
  // Admin: Demo management (WS)
  | ClientAdminGetDemoStatus
  | ClientAdminToggleDemo
  | ClientAdminSeedDemo
  | ClientAdminPurgeDemo
  // Admin: Beta management (WS)
  | ClientAdminGetBetaStatus
  | ClientAdminToggleBeta
  | ClientAdminAddBetaTester
  | ClientAdminRemoveBetaTester
  // Cross-verification
  | ClientVerifyTransferResult;

export interface ClientReportVersion {
  type: "report_version";
  payload: { version: string; titleId?: number };
}

export interface ClientAdminSetRankOverride {
  type: "admin_set_rank_override";
  payload: { rankId: number | null };
}

export interface ClientAdminSetRiskCheckTimeout {
  type: "admin_set_risk_check_timeout";
  payload: { seconds: number };
}

export interface ClientAdminSetDemoMarketVisible {
  type: "admin_set_demo_market_visible";
  payload: { market: MarketType; visible: boolean };
}

export interface ClientPing {
  type: "ping";
}

export interface ClientCreateOrder {
  type: "create_order";
  payload: CreateSlotOrderPayload;
}

export interface ClientCancelOrder {
  type: "cancel_order";
  payload: CancelSlotOrderPayload;
}

export interface ClientAdjustOrder {
  type: "adjust_order";
  payload: AdjustSlotOrderPayload;
}

export interface ClientSubscribeOrderBook {
  type: "subscribe_order_book";
  payload: { mapTypeId: number };
}

export interface ClientUnsubscribeOrderBook {
  type: "unsubscribe_order_book";
  payload: { mapTypeId: number };
}

/** Extension reports the result of executing a transaction step. */
export interface ClientStepResult {
  type: "step_result";
  payload: {
    transactionId: number;
    step: SlotTransactionStepType;
    success: boolean;
    error?: string;
    /** Machine-readable failure code for special handling. */
    code?: "buyer_not_ready" | "no_slots_available" | "invite_not_found_exhausted";
    /** Actual available slots reported by validate_map (used for auto-adjusting sell orders). */
    availableSlots?: number;
    /** Tradable items identified from opening chest (rt_open_chest step). */
    tradableItems?: Array<{ type: string; name: string; quantity: number; thumbnail?: string }>;
    transferTimestampUtc?: string;
  };
}

/** Extension reports the result of leaving a map (forced by server after payment failure). */
export interface ClientLeaveMapResult {
  type: "leave_map_result";
  payload: {
    transactionId: number;
    success: boolean;
    error?: string;
  };
}

export interface ClientConfirmMHLink {
  type: "confirm_mh_link";
  payload: {
    mhUserId: number;
    mhSnUserId: string;
  };
}

/** User clicks "Verify" after posting the code to their corkboard. */
export interface ClientVerifyMHLink {
  type: "verify_mh_link";
  payload: Record<string, never>;
}

/** Extension returns corkboard messages after fetching the hunter profile (proxy verification). */
export interface ClientVerifyMHLinkResult {
  type: "verify_mh_link_result";
  payload: {
    success: boolean;
    messages?: Array<{ body: string; sn_user_id: string }>;
    error?: string;
  };
}

/** Extension reports discovered map types from game data. */
export interface ClientReportMapTypes {
  type: "report_map_types";
  payload: { mapTypes: DiscoveredMapType[] };
}

export interface ClientGetMyOrders {
  type: "get_my_orders";
}

export interface ClientGetTransactions {
  type: "get_transactions";
}

export interface ClientGetTransactionHistory {
  type: "get_transaction_history";
  payload?: {
    /** 1-indexed page number. Defaults to 1. */
    page?: number;
    /** Orders per page. Defaults to 25. */
    perPage?: number;
  };
}

/** Extension signals the user has been AFK (no interaction with MH tab) for 60 minutes. */
export interface ClientUserAfk {
  type: "user_afk";
}

/** Extension signals the user has returned from AFK (interacted with MH tab). */
export interface ClientUserActive {
  type: "user_active";
}

/** Extension reports owned maps that were removed from the user's active list.
 *  Server should cancel any sell orders referencing these map IDs. */
export interface ClientMapsRemoved {
  type: "maps_removed";
  payload: { mapIds: number[] };
}

export interface ClientGetHomeData {
  type: "get_home_data";
}

export interface ClientGetFavourites {
  type: "get_favourites";
}

export interface ClientAddFavourite {
  type: "add_favourite";
  payload: { mapTypeId: number };
}

export interface ClientRemoveFavourite {
  type: "remove_favourite";
  payload: { mapTypeId: number };
}

export interface ClientGetSubscriptions {
  type: "get_subscriptions";
}

export interface ClientSubscribeMapType {
  type: "subscribe_map_type";
  payload: { mapTypeId: number };
}

export interface ClientUnsubscribeMapType {
  type: "unsubscribe_map_type";
  payload: { mapTypeId: number };
}

export interface ClientGetNotificationPrefs {
  type: "get_notification_prefs";
}

export interface ClientUpdateNotificationPrefs {
  type: "update_notification_prefs";
  payload: Partial<NotificationPrefs>;
}

export interface ClientMapCompletedReport {
  type: "map_completed_report";
  payload: { mhMapId: number; mapName: string };
}

export interface ClientModListMice {
  type: "mod_list_mice";
  payload: {
    search?: string;
    tierFilter?: MouseTier | "unset";
    limit?: number;
    offset?: number;
    includeArchivedGroups?: boolean;
    groupsOnly?: boolean;
  };
}

export interface ClientModSetMouseTier {
  type: "mod_set_mouse_tier";
  payload: {
    mouseId: number;
    tier: MouseTier | null;
  };
}

export interface ClientModSetMouseMapTier {
  type: "mod_set_mouse_map_tier";
  payload: {
    mouseId: number;
    mapTypeId: number;
    tier: MouseTier;
  };
}

export interface ClientModDeleteMouseMapTier {
  type: "mod_delete_mouse_map_tier";
  payload: {
    mouseId: number;
    mapTypeId: number;
  };
}

export interface ClientModGetMouseMapTiers {
  type: "mod_get_mouse_map_tiers";
  payload: {
    mouseId: number;
  };
}

export interface ClientModGetMapMouseTiers {
  type: "mod_get_map_mouse_tiers";
  payload: {
    mapTypeId: number;
  };
}

export interface ClientModGetMouseAliases {
  type: "mod_get_mouse_aliases";
  payload: { mouseId: number };
}

export interface ClientModAddMouseAlias {
  type: "mod_add_mouse_alias";
  payload: { mouseId: number; alias: string };
}

export interface ClientModDeleteMouseAlias {
  type: "mod_delete_mouse_alias";
  payload: { aliasId: number; mouseId: number };
}

export interface ClientModUpdateMouseAlias {
  type: "mod_update_mouse_alias";
  payload: { aliasId: number; mouseId: number; alias: string };
}

export interface ClientAdminGetSettings {
  type: "admin_get_settings";
}

export interface ClientAdminSetAllowAnyGoalCount {
  type: "admin_set_allow_any_goal_count";
  payload: {
    value: boolean;
  };
}

export interface ClientModListGroups {
  type: "mod_list_groups";
}

export interface ClientModCreateGroup {
  type: "mod_create_group";
  payload: { name: string; mouseTypeIds: number[] };
}

export interface ClientModToggleGroup {
  type: "mod_toggle_group";
  payload: { groupId: number; enabled: boolean };
}

export interface ClientModArchiveGroup {
  type: "mod_archive_group";
  payload: { groupId: number };
}

export interface ClientModDeleteGroup {
  type: "mod_delete_group";
  payload: { groupId: number };
}

export interface ClientModGetGroupMembers {
  type: "mod_get_group_members";
  payload: { groupId: number };
}

export interface ClientCreateSnipingOrder {
  type: "create_sniping_order";
  payload: CreateSnipingOrderPayload;
}

export interface ClientCancelSnipingOrder {
  type: "cancel_sniping_order";
  payload: CancelSnipingOrderPayload;
}

export interface ClientGetSnipingOrderBook {
  type: "get_sniping_order_book";
  payload: { mouseTypeId?: number; mouseGroupId?: number; itemTypeId?: number; itemGroupId?: number };
}

export interface ClientSearchMice {
  type: "search_mice";
  payload: { query: string };
}

export interface ClientGetSnipingPriceSuggestion {
  type: "get_sniping_price_suggestion";
  payload: { mouseTypeId?: number; mouseGroupId?: number; itemTypeId?: number; itemGroupId?: number };
}

export interface ClientSubscribeSnipingOrderBook {
  type: "subscribe_sniping_order_book";
  payload: { mouseTypeId?: number; mouseGroupId?: number; itemTypeId?: number; itemGroupId?: number };
}

export interface ClientUnsubscribeSnipingOrderBook {
  type: "unsubscribe_sniping_order_book";
  payload: { mouseTypeId?: number; mouseGroupId?: number; itemTypeId?: number; itemGroupId?: number };
}

export interface ClientGetMySnipingOrders {
  type: "get_my_sniping_orders";
}

/** Extension reports that a target mouse was caught (auto-detected from XHR). */
export interface ClientMouseCaught {
  type: "mouse_caught";
  payload: {
    transactionId: number;
    mouseTypeId: number;
  };
}

/** Extension reports that the sniper left the map (auto-detected from hunters array). */
export interface ClientSniperLeftMap {
  type: "sniper_left_map";
  payload: {
    transactionId: number;
  };
}

/** Extension reports the user's current active maps with class info. */
export interface ClientUpdateActiveMaps {
  type: "update_active_maps";
  payload: {
    maps: Array<{ mapId: number; mapClass: MHMapClass }>;
  };
}

/** Extension reports the result of executing a sniping transaction step. */
export interface ClientSnipingStepResult {
  type: "sniping_step_result";
  payload: {
    transactionId: number;
    step: SnipingStepType;
    success: boolean;
    error?: string;
    /** Failure classification code (e.g. "map_full", "insufficient_sb") for distinct server handling. */
    code?: string;
    /** Maptain's SB balance -- reported on transfer failure for insufficient SB detection. */
    sbBalance?: number;
    transferTimestampUtc?: string;
  };
}

export interface ClientGetSnipingHomeData {
  type: "get_sniping_home_data";
  payload?: { goalType?: GoalType };
}

export interface ClientGetSnipingFavourites {
  type: "get_sniping_favourites";
}

export interface ClientAddSnipingFavourite {
  type: "add_sniping_favourite";
  payload: { goalType: string; goalId: number };
}

export interface ClientRemoveSnipingFavourite {
  type: "remove_sniping_favourite";
  payload: { goalType: string; goalId: number };
}

export interface ClientListMice {
  type: "list_mice";
  payload: { offset: number; limit: number; search?: string };
}

export interface ClientGetSnipingWizardData {
  type: "get_sniping_wizard_data";
  payload: { mouseTypeIds: number[]; goalType?: GoalType };
}

export interface ClientGetSnipingTransactionHistory {
  type: "get_sniping_transaction_history";
  payload?: {
    page?: number;
    perPage?: number;
  };
}

export interface ClientGetActiveSnipingTransactions {
  type: "get_active_sniping_transactions";
}

export interface ClientAdminGracefulRestart {
  type: "admin_graceful_restart";
}

export interface ClientAdminForceRestart {
  type: "admin_force_restart";
}

export interface ClientAdminCancelRestart {
  type: "admin_cancel_restart";
}

export interface ClientAdminSetXhrLogging {
  type: "admin_set_xhr_logging";
  payload: { enabled: boolean };
}

export interface ClientXhrLog {
  type: "xhr_log";
  payload: {
    /** "api_call" = our game-api.ts call; "xhr_intercept" = intercepted XHR/fetch */
    source: "api_call" | "xhr_intercept";
    url: string;
    /** Request body (for api_call only) */
    requestBody?: Record<string, string>;
    /** Response data (truncated if too large) */
    responseData: any;
    timestamp: string;
  };
}

export interface ClientCreateItemOrder {
  type: "create_item_order";
  payload: CreateItemOrderPayload;
}

export interface ClientCancelItemOrder {
  type: "cancel_item_order";
  payload: CancelItemOrderPayload;
}

export interface ClientAdjustItemOrder {
  type: "adjust_item_order";
  payload: AdjustItemOrderPayload;
}

export interface ClientSubscribeItemOrderBook {
  type: "subscribe_item_order_book";
  payload: { itemTypeId: number };
}

export interface ClientUnsubscribeItemOrderBook {
  type: "unsubscribe_item_order_book";
  payload: { itemTypeId: number };
}

export interface ClientGetItemOrderBook {
  type: "get_item_order_book";
  payload: { itemTypeId: number };
}

export interface ClientGetItemTypes {
  type: "get_item_types";
}

export interface ClientGetItemHomeData {
  type: "get_item_home_data";
}

export interface ClientGetMyItemOrders {
  type: "get_my_item_orders";
}

/** Extension reports the result of executing an item transaction step. */
export interface ClientItemStepResult {
  type: "item_step_result";
  payload: {
    transactionId: number;
    step: ItemStepType;
    success: boolean;
    error?: string;
    /** Inventory quantity returned by validation steps. */
    quantity?: number;
    transferTimestampUtc?: string;
  };
}

export interface ClientGetItemTransactionHistory {
  type: "get_item_transaction_history";
  payload?: {
    page?: number;
    perPage?: number;
  };
}

export interface ClientGetItemFavourites {
  type: "get_item_favourites";
}

export interface ClientToggleItemFavourite {
  type: "toggle_item_favourite";
  payload: { itemTypeId: number };
}

export interface ClientGetItemNotifications {
  type: "get_item_notifications";
}

export interface ClientToggleItemNotification {
  type: "toggle_item_notification";
  payload: { itemTypeId: number };
}

export interface ClientModListItems {
  type: "mod_list_items";
  payload: {
    search?: string;
    classifications?: string[];
    limit?: number;
    offset?: number;
    /** Include system-hidden items (non-goal classifications/tags). Default: false. */
    showHidden?: boolean;
    /** Filter by global tier (null = all). */
    tierFilter?: "S" | "A" | "B" | "unset";
    /** Show only groups (no individual items). */
    groupsOnly?: boolean;
    /** Include archived groups in the list. */
    includeArchivedGroups?: boolean;
  };
}

export interface ClientModToggleItem {
  type: "mod_toggle_item";
  payload: { itemTypeId: number; enabled: boolean };
}

export interface ClientModSetItemAlias {
  type: "mod_set_item_alias";
  payload: { itemTypeId: number; alias: string | null };
}

export interface ClientModSetItemThumbnail {
  type: "mod_set_item_thumbnail";
  payload: { itemTypeId: number; thumbnail: string | null };
}

export interface ClientModSetItemAlwaysWarn {
  type: "mod_set_item_always_warn";
  payload: { itemTypeId: number; alwaysWarn: boolean };
}

export interface ClientModGetItemRiskLocations {
  type: "mod_get_item_risk_locations";
  payload: { itemTypeId: number };
}

export interface ClientModAddItemRiskLocation {
  type: "mod_add_item_risk_location";
  payload: { itemTypeId: number; environmentType: string };
}

export interface ClientModRemoveItemRiskLocation {
  type: "mod_remove_item_risk_location";
  payload: { itemTypeId: number; environmentType: string };
}

export interface ClientModSearchEnvironments {
  type: "mod_search_environments";
  payload: { query: string };
}

export interface ClientModSetItemTier {
  type: "mod_set_item_tier";
  payload: { itemId: number; tier: "S" | "A" | "B" | null };
}

export interface ClientModSetItemMapTier {
  type: "mod_set_item_map_tier";
  payload: { itemId: number; mapTypeId: number; tier: "S" | "A" | "B" };
}

export interface ClientModDeleteItemMapTier {
  type: "mod_delete_item_map_tier";
  payload: { itemId: number; mapTypeId: number };
}

export interface ClientModGetItemMapTiers {
  type: "mod_get_item_map_tiers";
  payload: { itemId: number };
}

export interface ClientModGetMapItemTiers {
  type: "mod_get_map_item_tiers";
  payload: { mapTypeId: number };
}

export interface ClientModListItemGroups {
  type: "mod_list_item_groups";
}

export interface ClientModCreateItemGroup {
  type: "mod_create_item_group";
  payload: { name: string; itemTypeIds: number[] };
}

export interface ClientModToggleItemGroup {
  type: "mod_toggle_item_group";
  payload: { groupId: number; enabled: boolean };
}

export interface ClientModArchiveItemGroup {
  type: "mod_archive_item_group";
  payload: { groupId: number };
}

export interface ClientModDeleteItemGroup {
  type: "mod_delete_item_group";
  payload: { groupId: number };
}

export interface ClientModGetItemGroupMembers {
  type: "mod_get_item_group_members";
  payload: { groupId: number };
}

export interface ClientAdminSyncItems {
  type: "admin_sync_items";
}

export interface ClientSearchItems {
  type: "search_items";
  payload: { query: string };
}

export interface ClientListItems {
  type: "list_items";
  payload: { offset: number; limit: number; search?: string };
}

/** Extension reports that a target item was found (auto-detected from XHR). */
export interface ClientItemFound {
  type: "item_found";
  payload: { transactionId: number; itemTypeId: number };
}

export interface ClientGetSnipingItemWizardData {
  type: "get_sniping_item_wizard_data";
  payload: { itemTypeIds: number[] };
}

export interface ClientCreateMapOrder {
  type: "create_map_order";
  payload: CreateMapOrderPayload;
}

export interface ClientCancelMapOrder {
  type: "cancel_map_order";
  payload: CancelMapOrderPayload;
}

export interface ClientAdjustMapOrder {
  type: "adjust_map_order";
  payload: AdjustMapOrderPayload;
}

export interface ClientSubscribeMapOrderBook {
  type: "subscribe_map_order_book";
  payload: { mapTypeId: number; mode: MapOrderMode };
}

export interface ClientUnsubscribeMapOrderBook {
  type: "unsubscribe_map_order_book";
  payload: { mapTypeId: number; mode: MapOrderMode };
}

export interface ClientGetMapOrderBook {
  type: "get_map_order_book";
  payload: { mapTypeId: number; mode: MapOrderMode };
}

export interface ClientGetMapHomeData {
  type: "get_map_home_data";
  payload: { mode: MapOrderMode };
}

export interface ClientGetMyMapOrders {
  type: "get_my_map_orders";
}

export interface ClientMapStepResult {
  type: "map_step_result";
  payload: {
    transactionId: number;
    step: MapStepType;
    success: boolean;
    error?: string;
    /** Failure classification code (e.g. "no_slots_available") for distinct server handling. */
    code?: string;
    quantity?: number; // From validate_scroll
    mapId?: number; // From open_scroll
    mapType?: string; // From open_scroll
    mapInfo?: any; // From validate_map
    transferTimestampUtc?: string;
  };
}

export interface ClientGetMapTransactionHistory {
  type: "get_map_transaction_history";
  payload: { page: number; perPage: number };
}

export interface ClientToggleMapNotification {
  type: "toggle_map_notification";
  payload: { mapTypeId: number; mode: MapOrderMode };
}

export interface ClientGetMapNotifications {
  type: "get_map_notifications";
}

export interface ClientToggleMapFavourite {
  type: "toggle_map_favourite";
  payload: { mapTypeId: number; mode: MapOrderMode };
}

export interface ClientGetMapFavourites {
  type: "get_map_favourites";
  payload: { mode: MapOrderMode };
}

export interface ClientGetMapTypes {
  type: "get_map_types";
}

export interface ClientGetMapTier {
  type: "get_map_tier";
  payload: { mapTypeId: number; goalIds: number[] };
}

export interface ClientGetAvailableSb {
  type: "get_available_sb";
}

export interface ClientModGetScrolls {
  type: "mod_get_scrolls";
  payload: { search: string };
}

export interface ClientModSetMapScroll {
  type: "mod_set_map_scroll";
  payload: { mapTypeId: number; scrollItemType: string | null };
}

export interface ClientModSetMapMinRank {
  type: "mod_set_map_min_rank";
  payload: { mapTypeId: number; minRank: number | null };
}

export interface ClientModSetMapClass {
  type: "mod_set_map_class";
  payload: { mapTypeId: number; mapClass: MHMapClass | null };
}

export interface ClientModSetMapSupportsRt {
  type: "mod_set_map_supports_rt";
  payload: { mapTypeId: number; supportsRt: boolean };
}

export interface ClientAdminSyncScrolls {
  type: "admin_sync_scrolls";
}

export interface ClientModGetRanks {
  type: "mod_get_ranks";
}

export interface ClientAdminSyncRanks {
  type: "admin_sync_ranks";
}

export interface ClientAdminSyncEnvironments {
  type: "admin_sync_environments";
}

export interface ClientAdminResetMHLink {
  type: "admin_reset_mh_link";
  payload: { targetUserId: number };
}

/** Extension reports the user's current MH game settings (map invites, supply transfers). */
export interface ClientReportGameSettings {
  type: "report_game_settings";
  payload: { allowMapInvites: boolean; allowAnonymousSupplyTransfers: boolean; utcOffset: number };
}

// --- Cross-verification ---

export type VerificationType =
  | "item_receipt"
  | "sb_receipt"
  | "invite_received"
  | "invite_accepted"
  | "ownership_transferred"
  | "scroll_opened"
  | "goal_completed"
  | "party_left";

/** Server asks the non-executing party to independently verify a step outcome. */
export interface ServerVerifyTransfer {
  type: "verify_transfer";
  payload: {
    transactionId: number;
    verificationType: VerificationType;
    /** Retry attempt number (1, 2, or 3). */
    attemptNumber: number;
    /** Sender's numeric MH user ID (from p.php?id=X) – for messages-API checks. */
    senderMhUserId?: string;
    /** Item display name as shown in the notification text – for messages-API checks. */
    itemDisplayName?: string;
    /** Quantity – for messages-API checks. */
    quantity?: number;
    /** ISO UTC timestamp when the transfer step completed – for messages-API checks. */
    transferTimestampUtc?: string;
    /** Map ID – for map-state checks. */
    mapId?: number;
    /** SN user ID of the hunter expected to be present/absent – for map-state checks. */
    expectedHunterSnUserId?: string;
  };
}

/** Extension reports the result of a verification challenge. */
export interface ClientVerifyTransferResult {
  type: "verify_transfer_result";
  payload: {
    transactionId: number;
    verificationType: VerificationType;
    verified: boolean;
  };
}

export type ServerMessage =
  | ServerPong
  | ServerError
  | ServerOrderCreated
  | ServerOrderCancelled
  | ServerOrderAdjusted
  | ServerOrderBookSnapshot
  | ServerMyOrders
  | ServerOrderMatched
  | ServerExecuteStep
  | ServerTransactionUpdate
  | ServerLeaveMap
  | ServerRequestActiveMaps
  | ServerTransactions
  | ServerTransactionHistory
  | ServerMHLinkResult
  | ServerMHLinkVerifyCode
  | ServerVerifyMHLinkStep
  | ServerMHLinkReset
  | ServerMapTypes
  | ServerMapTier
  | ServerHomeData
  | ServerFavourites
  | ServerNotificationPrefs
  // Map type notification subscriptions
  | ServerSubscriptions
  | ServerNewSellOrder
  // Mod: Mouse tier management
  | ServerModMiceList
  | ServerModMouseUpdated
  | ServerModMouseMapTiers
  | ServerModMapMouseTiers
  // Mod: Mouse aliases
  | ServerModMouseAliases
  // Admin: Settings
  | ServerAdminSettings
  // Mod: Mouse groups
  | ServerModGroupList
  | ServerModGroupCreated
  | ServerModGroupUpdated
  | ServerModGroupMembers
  | ServerModGroupDeleted
  // Sniping marketplace
  | ServerSnipingOrderCreated
  | ServerSnipingOrderCancelled
  | ServerSnipingOrderBookSnapshot
  | ServerMySnipingOrders
  | ServerMouseSearchResults
  | ServerSnipingPriceSuggestion
  | ServerSnipingTransactionUpdate
  | ServerSnipingMouseCaught
  | ServerSnipingExecuteStep
  // Sniping home + favourites + wizard
  | ServerSnipingHomeData
  | ServerSnipingFavourites
  | ServerMouseList
  | ServerSnipingWizardData
  | ServerSnipingTransactionHistory
  // Admin: Server management
  | ServerAdminDrainProgress
  // Admin: XHR diagnostic logging
  | ServerXhrLoggingState
  // Item marketplace
  | ServerItemOrderCreated
  | ServerItemOrderCancelled
  | ServerItemOrderAdjusted
  | ServerItemOrderBookSnapshot
  | ServerMyItemOrders
  | ServerItemOrderMatched
  | ServerItemExecuteStep
  | ServerItemTransactionUpdate
  | ServerItemTransactionHistory
  | ServerItemTypes
  | ServerItemHomeData
  | ServerItemFavourites
  | ServerItemNotifications
  | ServerNewItemSellOrder
  | ServerItemMarketStats
  // Mod: Item management
  | ServerModItemList
  | ServerModItemUpdated
  // Mod: Item risk settings
  | ServerModItemRiskLocations
  | ServerModEnvironmentSearchResults
  // Mod: Item tier management
  | ServerModItemMapTiers
  | ServerModMapItemTiers
  // Mod: Item groups (sniping)
  | ServerModItemGroupList
  | ServerModItemGroupCreated
  | ServerModItemGroupUpdated
  | ServerModItemGroupMembers
  | ServerModItemGroupDeleted
  // Admin: Item sync
  | ServerAdminItemsSynced
  // Item sniping
  | ServerItemSearchResults
  | ServerItemList
  | ServerSnipingItemFound
  | ServerSnipingItemWizardData
  // Sniping payment penalties
  | ServerSnipingPaymentGrace
  | ServerSnipingPaymentResolved
  // Map marketplace
  | ServerMapOrderCreated
  | ServerMapOrderCancelled
  | ServerMapOrderAdjusted
  | ServerMapOrderBookSnapshot
  | ServerMyMapOrders
  | ServerMapOrderMatched
  | ServerMapExecuteStep
  | ServerMapTransactionUpdate
  | ServerMapHomeData
  | ServerMapMarketStats
  | ServerMapTransactionHistory
  | ServerMapNotifications
  | ServerMapFavourites
  | ServerNewMapSellOrder
  // Cross-marketplace: SB reservation
  | ServerAvailableSb
  // Market disable notification
  | ServerMarketDisabledNotice
  // Mod: Scroll management
  | ServerModScrolls
  // Admin: Scroll sync
  | ServerAdminScrollsSynced
  // Mod: Rank management
  | ServerModRanks
  // Admin: Rank sync
  | ServerAdminRanksSynced
  // Admin: Environment sync
  | ServerAdminEnvironmentsSynced
  // Game settings validation
  | ServerGameSettingsInvalid
  // Beta access
  | ServerMarketBetaConfig
  | ServerBetaTesterStatus
  | ServerBetaApplied
  // Admin: Beta requests
  | ServerAdminBetaRequests
  | ServerAdminBetaRequestReceived
  // Admin: Alerts
  | ServerAdminAlerts
  // User: Alerts
  | ServerActiveAlert
  | ServerVersionOutdated
  // Admin: Data sync (maps, mice)
  | ServerAdminMapsSynced
  | ServerAdminMiceSynced
  // Market enabled config
  | ServerMarketEnabledConfig
  | ServerDemoMarketConfig
  // Map completion broadcast
  | ServerMapCompleted
  // Risk check
  | ServerRiskCheckPrompt
  | ServerRiskCheckTimedOut
  | ServerRiskCheckRetryNoMatch
  // Onboarding
  | ServerOnboardingStatus
  | ServerOnboardingConfig
  | ServerOnboardingStats
  // RT (Return Tradables)
  | ServerRtManualConfirmPrompt
  | ServerRtItemsIdentified
  // Mod: Map type management (WS)
  | ServerModMapTypesList
  // Mod: User management (WS)
  | ServerModUsersList
  | ServerModUserUpdated
  | ServerModSuspensionHistory
  // Admin: User management (WS)
  | ServerAdminUsersList
  | ServerAdminUser
  | ServerAdminAuditLog
  // Admin: Demo management (WS)
  | ServerAdminDemoStatus
  // Admin: Beta management (WS)
  | ServerAdminBetaStatus
  // Cross-verification
  | ServerVerifyTransfer;

export interface ServerPong {
  type: "pong";
}

export interface ServerError {
  type: "error";
  payload: {
    message: string;
    /** The client message type that caused the error, if applicable. */
    source?: ClientMessage["type"];
  };
}

export interface ServerOrderCreated {
  type: "order_created";
  payload: { order: SlotOrder };
}

export interface ServerOrderCancelled {
  type: "order_cancelled";
  payload: { orderId: number };
}

export interface ServerOrderAdjusted {
  type: "order_adjusted";
  payload: { order: SlotOrder };
}

export interface ServerOrderBookSnapshot {
  type: "order_book_snapshot";
  payload: SlotOrderBookSnapshot;
}

export interface ServerMyOrders {
  type: "my_orders";
  payload: { orders: SlotOrder[] };
}

export interface ServerOrderMatched {
  type: "order_matched";
  payload: { transaction: SlotTransaction };
}

/** Server instructs the extension to execute a transaction step. */
export interface ServerExecuteStep {
  type: "execute_step";
  payload: SlotTransactionStep;
}

/** Server broadcasts a transaction state change. */
export interface ServerTransactionUpdate {
  type: "transaction_update";
  payload: { transaction: SlotTransaction };
}

/** Server instructs the extension to leave a map (after payment failure + max retries). */
export interface ServerLeaveMap {
  type: "leave_map";
  payload: {
    transactionId: number;
    mapId: number;
    reason: string;
  };
}

/** Server requests the extension to report current active maps (for transaction recovery). */
export interface ServerRequestActiveMaps {
  type: "request_active_maps";
}

export interface ServerTransactions {
  type: "transactions";
  payload: { transactions: SlotTransaction[] };
}

export interface ServerTransactionHistory {
  type: "transaction_history";
  payload: {
    groups: SlotOrderHistoryGroup[];
    page: number;
    totalPages: number;
    totalOrders: number;
  };
}

/** Result of attempting to link MH account to Discord account. */
export interface ServerMHLinkResult {
  type: "mh_link_result";
  payload: {
    success: boolean;
    error?: string;
    /**
     * Error code for specific failure reasons:
     * - "already_linked": MH account is already linked to a different Discord account
     */
    code?: "already_linked";
    mhAccount?: {
      userId: number;
      mhUserId: number;
      mhSnUserId: string;
      verifiedAt: string;
    };
  };
}

/** Server sends verification code for the user to post on their corkboard. */
export interface ServerMHLinkVerifyCode {
  type: "mh_link_verify_code";
  payload: { code: string; mhUserId: number };
}

/** Server asks a proxy user's extension to fetch a target's corkboard (proxy verification). */
export interface ServerVerifyMHLinkStep {
  type: "verify_mh_link_step";
  payload: { snUserId: string };
}

/** Sent to a user when admin resets their MH account link. */
export interface ServerMHLinkReset {
  type: "mh_link_reset";
  payload: Record<string, never>;
}

export interface ServerMapTypes {
  type: "map_types";
  payload: {
    mapTypes: MapType[];
    stats?: Record<string, MapTypeStats>;
  };
}

export interface ServerMapTier {
  type: "map_tier";
  payload: { tier: "S" | "A" | "B" };
}

export interface ServerHomeData {
  type: "home_data";
  payload: HomeData;
}

export interface ServerFavourites {
  type: "favourites";
  payload: { mapTypeIds: number[] };
}

export interface ServerNotificationPrefs {
  type: "notification_prefs";
  payload: NotificationPrefs;
}

export interface ServerSubscriptions {
  type: "subscriptions";
  payload: { mapTypeIds: number[] };
}

/** Notification that a new sell order was created for a subscribed map type. */
export interface ServerNewSellOrder {
  type: "new_sell_order";
  payload: {
    mapTypeId: number;
    mapName: string;
    price: number;
    quantity: number;
    tier: "S" | "A" | "B" | null;
  };
}

export interface ServerModMiceList {
  type: "mod_mice_list";
  payload: {
    mice: MouseType[];
    total: number;
  };
}

export interface ServerModMouseUpdated {
  type: "mod_mouse_updated";
  payload: {
    mouse: MouseType;
    mapTiers?: MouseMapTier[];
  };
}

/** Mouse tier override with full mouse info for map-centric view. */
export interface MouseTierWithInfo {
  mouseTypeId: number;
  mouseType: string;
  mouseName: string;
  mouseThumbnail: string | null;
  globalTier: MouseTier | null;
  mapTier: MouseTier;
}

export interface ServerModMapMouseTiers {
  type: "mod_map_mouse_tiers";
  payload: {
    mapTypeId: number;
    tiers: MouseTierWithInfo[];
  };
}

export interface ServerModMouseMapTiers {
  type: "mod_mouse_map_tiers";
  payload: {
    mouseId: number;
    mapTiers: MouseMapTier[];
  };
}

export interface ServerModMouseAliases {
  type: "mod_mouse_aliases";
  payload: {
    mouseId: number;
    aliases: MouseAlias[];
  };
}

export interface ServerAdminSettings {
  type: "admin_settings";
  payload: {
    allowAnyGoalCount: boolean;
    xhrLoggingEnabled: boolean;
    syncCounts: { maps: number; scrolls: number; items: number; mice: number; ranks: number; environments: number };
    marketEnabled: { slots: boolean; sniping: boolean; items: boolean; maps: boolean };
    rateLimits?: Record<string, RateLimitCategoryConfig>;
    rankOverride?: number | null;
    riskCheckTimeoutSeconds: number;
    demoMarketVisible?: { slots: boolean; sniping: boolean; items: boolean; maps: boolean };
    verificationMethod: VerificationMethod;
  };
}

export interface ServerModGroupList {
  type: "mod_group_list";
  payload: { groups: SnipingMouseGroup[] };
}

export interface ServerModGroupCreated {
  type: "mod_group_created";
  payload: { group: SnipingMouseGroup };
}

export interface ServerModGroupUpdated {
  type: "mod_group_updated";
  payload: { groupId: number; enabled?: boolean; archived?: boolean };
}

export interface ServerModGroupMembers {
  type: "mod_group_members";
  payload: {
    groupId: number;
    members: Array<{ mouseTypeId: number; mouseName: string; mouseThumbnail: string | null }>;
  };
}

export interface ServerModGroupDeleted {
  type: "mod_group_deleted";
  payload: { groupId: number };
}

export interface ServerSnipingOrderCreated {
  type: "sniping_order_created";
  payload: { order: SnipingOrder };
}

export interface ServerSnipingOrderCancelled {
  type: "sniping_order_cancelled";
  payload: { orderId: number };
}

export interface ServerSnipingOrderBookSnapshot {
  type: "sniping_order_book_snapshot";
  payload: SnipingOrderBookSnapshot;
}

export interface ServerMySnipingOrders {
  type: "my_sniping_orders";
  payload: { orders: SnipingOrder[] };
}

export interface ServerMouseSearchResults {
  type: "mouse_search_results";
  payload: { mice: MouseType[] };
}

export interface ServerSnipingPriceSuggestion {
  type: "sniping_price_suggestion";
  payload: SnipingPriceSuggestion;
}

/** Sniping transaction state change (sent to both sniper and maptain). */
export interface ServerSnipingTransactionUpdate {
  type: "sniping_transaction_update";
  payload: { transaction: SnipingTransaction };
}

/** A target mouse was caught -- UI should update progress. */
export interface ServerSnipingMouseCaught {
  type: "sniping_mouse_caught";
  payload: {
    transactionId: number;
    mouseTypeId: number;
  };
}

/** Server instructs the extension to execute a sniping transaction step. */
export interface ServerSnipingExecuteStep {
  type: "sniping_execute_step";
  payload: {
    transactionId: number;
    step: SnipingStepType;
    data: Record<string, unknown>;
  };
}

export interface ServerSnipingHomeData {
  type: "sniping_home_data";
  payload: SnipingHomeData;
}

export interface ServerSnipingFavourites {
  type: "sniping_favourites";
  payload: { favourites: Array<{ goalType: string; goalId: number }> };
}

export interface ServerMouseList {
  type: "mouse_list";
  payload: { mice: MouseType[]; hasMore: boolean };
}

export interface ServerSnipingWizardData {
  type: "sniping_wizard_data";
  payload: { mice: SnipingWizardMouse[]; groups: SnipingWizardGroup[] };
}

export interface ServerSnipingTransactionHistory {
  type: "sniping_transaction_history";
  payload: {
    groups: SnipingMapHistoryGroup[];
    page: number;
    totalPages: number;
    totalMaps: number;
  };
}

export interface ServerAdminDrainProgress {
  type: "admin_drain_progress";
  payload: {
    draining: boolean;
    remaining: number;
    elapsed: number;
  };
}

export interface ServerXhrLoggingState {
  type: "xhr_logging_state";
  payload: { enabled: boolean };
}

export interface ServerItemOrderCreated {
  type: "item_order_created";
  payload: { order: ItemOrder };
}

export interface ServerItemOrderCancelled {
  type: "item_order_cancelled";
  payload: { orderId: number };
}

export interface ServerItemOrderAdjusted {
  type: "item_order_adjusted";
  payload: { order: ItemOrder };
}

export interface ServerItemOrderBookSnapshot {
  type: "item_order_book_snapshot";
  payload: ItemOrderBookSnapshot;
}

export interface ServerMyItemOrders {
  type: "my_item_orders";
  payload: { orders: ItemOrder[] };
}

export interface ServerItemOrderMatched {
  type: "item_order_matched";
  payload: { transaction: ItemTransaction };
}

/** Server instructs the extension to execute an item transaction step. */
export interface ServerItemExecuteStep {
  type: "item_execute_step";
  payload: ItemTransactionStep;
}

/** Server broadcasts an item transaction state change. */
export interface ServerItemTransactionUpdate {
  type: "item_transaction_update";
  payload: { transaction: ItemTransaction };
}

export interface ServerItemTransactionHistory {
  type: "item_transaction_history";
  payload: {
    groups: ItemOrderHistoryGroup[];
    page: number;
    totalPages: number;
    totalOrders: number;
  };
}

export interface ServerItemTypes {
  type: "item_types";
  payload: {
    items: ItemType[];
    classifications: string[];
  };
}

export interface ServerItemHomeData {
  type: "item_home_data";
  payload: ItemHomeData;
}

export interface ServerItemFavourites {
  type: "item_favourites";
  payload: { itemTypeIds: number[] };
}

export interface ServerItemNotifications {
  type: "item_notifications";
  payload: { itemTypeIds: number[] };
}

/** Notification that a new sell order was created for a followed item type. */
export interface ServerNewItemSellOrder {
  type: "new_item_sell_order";
  payload: {
    itemTypeId: number;
    itemName: string;
    price: number;
    quantity: number;
  };
}

export interface ServerItemMarketStats {
  type: "item_market_stats";
  payload: {
    itemTypeId: number;
    stats: ItemMarketStats;
  };
}

export interface ServerModItemList {
  type: "mod_item_list";
  payload: {
    items: ItemType[];
    total: number;
    classifications?: string[];
  };
}

export interface ServerModItemUpdated {
  type: "mod_item_updated";
  payload: { item: ItemType; mapTiers?: import("./items.js").ItemMapTier[] };
}

export interface ServerModItemRiskLocations {
  type: "mod_item_risk_locations";
  payload: {
    itemTypeId: number;
    locations: Array<{ environmentType: string; environmentName: string }>;
  };
}

export interface ServerModEnvironmentSearchResults {
  type: "mod_environment_search_results";
  payload: {
    environments: Array<{ type: string; name: string }>;
  };
}

/** Item tier override with full item info for map-centric view. */
export interface ItemTierWithInfo {
  itemTypeId: number;
  itemType: string;
  itemName: string;
  itemThumbnail: string | null;
  globalTier: "S" | "A" | "B" | null;
  mapTier: "S" | "A" | "B";
}

export interface ServerModItemMapTiers {
  type: "mod_item_map_tiers";
  payload: { itemId: number; mapTiers: import("./items.js").ItemMapTier[] };
}

export interface ServerModMapItemTiers {
  type: "mod_map_item_tiers";
  payload: { mapTypeId: number; tiers: ItemTierWithInfo[] };
}

export interface ServerModItemGroupList {
  type: "mod_item_group_list";
  payload: { groups: SnipingItemGroup[] };
}

export interface ServerModItemGroupCreated {
  type: "mod_item_group_created";
  payload: { group: SnipingItemGroup };
}

export interface ServerModItemGroupUpdated {
  type: "mod_item_group_updated";
  payload: { groupId: number; enabled?: boolean; archived?: boolean };
}

export interface ServerModItemGroupMembers {
  type: "mod_item_group_members";
  payload: {
    groupId: number;
    members: Array<{ itemTypeId: number; itemName: string; itemThumbnail: string | null }>;
  };
}

export interface ServerModItemGroupDeleted {
  type: "mod_item_group_deleted";
  payload: { groupId: number };
}

export interface ServerItemSearchResults {
  type: "item_search_results";
  payload: { items: ItemType[] };
}

export interface ServerItemList {
  type: "item_list";
  payload: { items: ItemType[]; hasMore: boolean };
}

/** A target item was found -- UI should update progress. */
export interface ServerSnipingItemFound {
  type: "sniping_item_found";
  payload: { transactionId: number; itemTypeId: number };
}

/** Server notifies maptain of insufficient SB grace period. */
export interface ServerSnipingPaymentGrace {
  type: "sniping_payment_grace";
  payload: {
    transactionId: number;
    requiredAmount: number;
    reportedBalance: number;
    graceExpiresAt: string;
  };
}

/** Server notifies that a payment penalty was resolved. */
export interface ServerSnipingPaymentResolved {
  type: "sniping_payment_resolved";
  payload: {
    transactionId: number;
    resolution: "paid" | "suspended";
  };
}

export interface SnipingItemWizardItem {
  itemTypeId: number;
  name: string;
  thumbnail: string | null;
  avg7d: number | null;
  avg30d: number | null;
}

export interface SnipingItemWizardGroupMember {
  itemTypeId: number;
  name: string;
  thumbnail: string | null;
}

export interface SnipingItemWizardGroup {
  groupId: number;
  name: string;
  items: SnipingItemWizardGroupMember[];
  avg7d: number | null;
  avg30d: number | null;
}

export interface ServerSnipingItemWizardData {
  type: "sniping_item_wizard_data";
  payload: { items: SnipingItemWizardItem[]; groups: SnipingItemWizardGroup[] };
}

export interface ServerAdminItemsSynced {
  type: "admin_items_synced";
  payload: { added: number };
}

export interface ServerMapOrderCreated {
  type: "map_order_created";
  payload: { order: MapOrder };
}

export interface ServerMapOrderCancelled {
  type: "map_order_cancelled";
  payload: { orderId: number };
}

export interface ServerMapOrderAdjusted {
  type: "map_order_adjusted";
  payload: { order: MapOrder };
}

export interface ServerMapOrderBookSnapshot {
  type: "map_order_book_snapshot";
  payload: MapOrderBookSnapshot;
}

export interface ServerMyMapOrders {
  type: "my_map_orders";
  payload: { orders: MapOrder[] };
}

export interface ServerMapOrderMatched {
  type: "map_order_matched";
  payload: { transaction: MapTransaction };
}

export interface ServerMapExecuteStep {
  type: "map_execute_step";
  payload: MapTransactionStep;
}

export interface ServerMapTransactionUpdate {
  type: "map_transaction_update";
  payload: { transaction: MapTransaction };
}

export interface ServerMapHomeData {
  type: "map_home_data";
  payload: MapHomeData;
}

export interface ServerMapMarketStats {
  type: "map_market_stats";
  payload: {
    mapTypeId: number;
    mode: MapOrderMode;
    stats: MapMarketStats;
  };
}

export interface ServerMapTransactionHistory {
  type: "map_transaction_history";
  payload: {
    groups: MapOrderHistoryGroup[];
    page: number;
    totalPages: number;
    totalOrders: number;
  };
}

export interface ServerMapNotifications {
  type: "map_notifications";
  payload: {
    notifications: Array<{ mapTypeId: number; mode: MapOrderMode }>;
  };
}

export interface ServerMapFavourites {
  type: "map_favourites";
  payload: { mapTypeIds: number[] };
}

export interface ServerNewMapSellOrder {
  type: "new_map_sell_order";
  payload: {
    mapName: string;
    mode: MapOrderMode;
    price: number;
  };
}

export interface ServerAvailableSb {
  type: "available_sb";
  payload: {
    totalSb: number | null; // User's total SB balance (from game API, fetched client-side)
    committedSb: number; // SB reserved by open buy orders across all marketplaces
    availableSb: number | null; // totalSb - committedSb (null if totalSb not known)
  };
}

export interface ServerMarketDisabledNotice {
  type: "market_disabled_notice";
  payload: { message: string };
}

export interface ServerModScrolls {
  type: "mod_scrolls";
  payload: { scrolls: Scroll[] };
}

export interface ServerAdminScrollsSynced {
  type: "admin_scrolls_synced";
  payload: { added: number };
}

export interface ServerModRanks {
  type: "mod_ranks";
  payload: { ranks: Rank[] };
}

export interface ServerAdminRanksSynced {
  type: "admin_ranks_synced";
  payload: { added: number };
}

export interface ServerAdminEnvironmentsSynced {
  type: "admin_environments_synced";
  payload: { added: number };
}

/** Server tells the user their MH game settings are invalid (blocking marketplace use). */
export interface ServerGameSettingsInvalid {
  type: "game_settings_invalid";
  payload: { allowMapInvites: boolean; allowAnonymousSupplyTransfers: boolean };
}

export interface ClientApplyForBeta {
  type: "apply_for_beta";
}

export interface ClientAdminSetMarketBeta {
  type: "admin_set_market_beta";
  payload: { market: MarketType; beta: boolean };
}

export interface ClientAdminGetBetaRequests {
  type: "admin_get_beta_requests";
}

export interface ClientAdminApproveBetaRequest {
  type: "admin_approve_beta_request";
  payload: { requestId: number };
}

export interface ClientAdminDenyBetaRequest {
  type: "admin_deny_beta_request";
  payload: { requestId: number };
}

export interface ServerMarketBetaConfig {
  type: "market_beta_config";
  payload: { slots: boolean; sniping: boolean; items: boolean; maps: boolean };
}

export interface ServerBetaTesterStatus {
  type: "beta_tester_status";
  payload: { isBetaTester: boolean; hasPendingRequest: boolean };
}

export interface ServerBetaApplied {
  type: "beta_applied";
}

export interface ServerAdminBetaRequests {
  type: "admin_beta_requests";
  payload: { requests: BetaRequest[] };
}

export interface ServerAdminBetaRequestReceived {
  type: "admin_beta_request_received";
  payload: { request: BetaRequest };
}

export interface ClientAdminGetAlerts {
  type: "admin_get_alerts";
}

export interface ClientAdminCreateAlert {
  type: "admin_create_alert";
  payload: { message: string; alertType: AlertType; startsAt: string; endsAt: string };
}

export interface ClientAdminUpdateAlert {
  type: "admin_update_alert";
  payload: {
    alertId: number;
    message: string;
    alertType: AlertType;
    startsAt: string;
    endsAt: string;
  };
}

export interface ClientAdminDeleteAlert {
  type: "admin_delete_alert";
  payload: { alertId: number };
}

export interface ClientAdminSetVersionAlert {
  type: "admin_set_version_alert";
  payload: { enabled: boolean };
}

export interface ServerAdminAlerts {
  type: "admin_alerts";
  payload: { alerts: AdminAlert[]; versionAlertEnabled: boolean };
}

export interface ClientAcknowledgeAlert {
  type: "acknowledge_alert";
  payload: { alertId: number };
}

export interface ClientDismissVersionAlert {
  type: "dismiss_version_alert";
}

export interface ServerActiveAlert {
  type: "active_alert";
  payload: ActiveAlert;
}

export interface ServerVersionOutdated {
  type: "version_outdated";
  payload: { serverVersion: string; extensionVersion: string };
}

export interface ClientAdminSyncMaps {
  type: "admin_sync_maps";
}

export interface ClientAdminSyncMice {
  type: "admin_sync_mice";
}

export interface ServerAdminMapsSynced {
  type: "admin_maps_synced";
  payload: { count: number };
}

export interface ServerAdminMiceSynced {
  type: "admin_mice_synced";
  payload: { count: number };
}

export interface ClientAdminSetMarketEnabled {
  type: "admin_set_market_enabled";
  payload: { market: MarketType; enabled: boolean };
}

export interface ServerMarketEnabledConfig {
  type: "market_enabled_config";
  payload: { slots: boolean; sniping: boolean; items: boolean; maps: boolean };
}

export interface ServerDemoMarketConfig {
  type: "demo_market_config";
  payload: { slots: boolean; sniping: boolean; items: boolean; maps: boolean };
}

export interface RateLimitCategoryConfig {
  burst: number;
  /** Tokens per 10 seconds (integer). */
  rate: number;
}

export interface ClientAdminSetRateLimits {
  type: "admin_set_rate_limits";
  payload: {
    rateLimits: Record<string, RateLimitCategoryConfig>;
  };
}

/** Server broadcasts map completion to all connected users on the same map. */
export interface ServerMapCompleted {
  type: "map_completed";
  payload: { mhMapId: number; mapName: string };
}

export interface RiskCheckGoal {
  uniqueId: number;
  type: string;
  name: string;
  thumbnail: string | null;
}

/** Risk config for a single item goal (sent with item-goal risk checks). */
export interface ItemRiskConfig {
  type: string;
  riskLocations: string[];
  alwaysWarn: boolean;
}

/** Server -> buyer: check your game state against these remaining goals. */
export interface ServerRiskCheckPrompt {
  type: "risk_check_prompt";
  payload: {
    transactionId: number;
    marketplace: "slot" | "map";
    mapTypeId: number;
    goalType: "mouse" | "item";
    remainingGoals: RiskCheckGoal[];
    /** For item goals: per-item risk config from mod settings. */
    itemRiskConfig?: ItemRiskConfig[];
    timeoutSeconds: number;
  };
}

/** Server -> buyer: risk check timed out, offer retry. */
export interface ServerRiskCheckTimedOut {
  type: "risk_check_timed_out";
  payload: {
    transactionId: number;
    marketplace: "slot" | "map";
    sellOrderId: number;
    buyOrderId: number;
    mapTypeId: number;
  };
}

/** Server -> buyer: retry produced no match. */
export interface ServerRiskCheckRetryNoMatch {
  type: "risk_check_retry_no_match";
  payload: {};
}

/** Buyer -> server: accept or reject risk. */
export interface ClientRiskCheckResponse {
  type: "risk_check_response";
  payload: {
    transactionId: number;
    marketplace: "slot" | "map";
    decision: "accepted" | "rejected";
    autoAccepted?: boolean;
  };
}

/** Buyer -> server: retry after timeout. */
export interface ClientRiskCheckRetry {
  type: "risk_check_retry";
  payload: {
    marketplace: "slot" | "map";
    buyOrderId: number;
    sellOrderId: number;
    mapTypeId: number;
  };
}

export interface OnboardingTask {
  stepId: string;
  version: number;
  completedAt: string | null;
}

export interface ClientCompleteOnboardingStep {
  type: "complete_onboarding_step";
  payload: {
    stepId: string;
    version: number;
  };
}

/** Server sends onboarding status on connect and after step completion. */
export interface ServerOnboardingStatus {
  type: "onboarding_status";
  payload: {
    complete: boolean;
    tasks: OnboardingTask[];
  };
}

/** Server broadcasts enabled/disabled state of onboarding steps (admin config). */
export interface ServerOnboardingConfig {
  type: "onboarding_config";
  payload: {
    stepConfigs: Record<string, boolean>;
  };
}

export interface ClientAdminSetOnboardingStepEnabled {
  type: "admin_set_onboarding_step_enabled";
  payload: {
    stepId: string;
    enabled: boolean;
  };
}

export interface ClientAdminGetOnboardingStats {
  type: "admin_get_onboarding_stats";
}

export interface ServerOnboardingStats {
  type: "onboarding_stats";
  payload: {
    totalUsers: number;
    completedUsers: number;
    perStep: Array<{ stepId: string; version: number; completedCount: number }>;
  };
}

export type VerificationMethod = "service_account" | "proxy_user";

export interface ClientAdminSetVerificationMethod {
  type: "admin_set_verification_method";
  payload: { method: VerificationMethod };
}

/** Buyer manually confirms they returned tradable items (fallback when auto-detection fails). */
export interface ClientRtManualConfirm {
  type: "rt_manual_confirm";
  payload: {
    transactionId: number;
  };
}

/** Server prompts buyer to manually confirm RT completion (buyer left map before auto flow). */
export interface ServerRtManualConfirmPrompt {
  type: "rt_manual_confirm_prompt";
  payload: {
    transactionId: number;
    sellerSnUserId: string;
    sellerUsername: string;
  };
}

/** Server notifies both parties that RT items have been identified from chest. */
export interface ServerRtItemsIdentified {
  type: "rt_items_identified";
  payload: {
    transactionId: number;
    items: Array<{ itemType: string; itemName: string; quantity: number }>;
  };
}

// ─── Shared types for mod/admin user lists ───────────────────────────────────

/** A user entry as seen in mod/admin user lists. */
export interface UserListItem {
  id: number;
  username: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastConnectedAt: string | null;
  mhLinked: boolean;
}

/** A map type as seen in the moderation panel (full detail including disabled). */
export interface ModMapTypeItem {
  id: number;
  mapType: string;
  quality: string;
  goal: "mouse" | "item";
  displayName: string;
  alias: string | null;
  thumbnail: string | null;
  maxHunters: number;
  lastGoalCount: number;
  enabledSlots: boolean;
  enabledUnopened: boolean;
  enabledComplete: boolean;
  scrollItemType: string | null;
  minRank: number | null;
  mapClass: string | null;
  supportsRt: boolean;
  createdAt: string;
}

/** An audit log entry as seen in the admin panel. */
export interface AuditEntry {
  timestamp: string;
  event: string;
  userId?: number;
  data?: Record<string, unknown>;
}

/** Demo data market visibility stats. */
export interface DemoMarketStats {
  orders: number;
  transactions: number;
}

/** Full demo status as seen in the admin panel. */
export interface DemoStatus {
  enabled: boolean;
  users: number;
  markets: Record<string, boolean>;
  slots: DemoMarketStats;
  items: DemoMarketStats;
  maps: DemoMarketStats;
  sniping: DemoMarketStats;
}

/** A beta tester allowlist entry. */
export interface BetaTester {
  discordId: string;
  discordUsername: string | null;
  addedBy: number | null;
  createdAt: string;
}

/** Closed beta status and tester allowlist. */
export interface BetaStatus {
  enabled: boolean;
  testers: BetaTester[];
}

// ─── Phase 5: Mod map type management (WS) ───────────────────────────────────

export interface ClientModGetMapTypes {
  type: "mod_get_map_types";
}

export interface ClientModToggleMapTypeMarket {
  type: "mod_toggle_map_type_market";
  payload: { id: number; market: string; enable: boolean };
}

export interface ClientModSetMapTypeAlias {
  type: "mod_set_map_type_alias";
  payload: { id: number; alias: string | null };
}

export interface ClientModSetMapTypeThumbnail {
  type: "mod_set_map_type_thumbnail";
  payload: { id: number; thumbnail: string | null };
}

export interface ClientModSetMapTypeLastGoalCount {
  type: "mod_set_map_type_last_goal_count";
  payload: { id: number; lastGoalCount: number };
}

export interface ServerModMapTypesList {
  type: "mod_map_types_list";
  payload: { mapTypes: ModMapTypeItem[] };
}

// ─── Phase 5: Mod user management (WS) ───────────────────────────────────────

export interface ClientModGetUsers {
  type: "mod_get_users";
}

export interface ClientModSuspendUser {
  type: "mod_suspend_user";
  payload: { userId: number; reason?: string; expiresAt?: string };
}

export interface ClientModUnsuspendUser {
  type: "mod_unsuspend_user";
  payload: { userId: number; note?: string };
}

export interface ClientModGetSuspensions {
  type: "mod_get_suspensions";
  payload: { userId: number };
}

export interface ServerModUsersList {
  type: "mod_users_list";
  payload: { users: UserListItem[] };
}

export interface ServerModUserUpdated {
  type: "mod_user_updated";
  payload: { userId: number; status: UserStatus };
}

export interface ServerModSuspensionHistory {
  type: "mod_suspension_history";
  payload: { userId: number; suspensions: Suspension[] };
}

// ─── Phase 6: Admin user management (WS) ─────────────────────────────────────

export interface ClientAdminGetUsers {
  type: "admin_get_users";
}

export interface ClientAdminGetUser {
  type: "admin_get_user";
  payload: { userId: number };
}

/** WS version of set user role (distinct from HTTP to avoid name collision). */
export interface ClientAdminSetUserRoleWs {
  type: "admin_set_user_role";
  payload: { userId: number; role: UserRole };
}

export interface ClientAdminGetAuditLog {
  type: "admin_get_audit_log";
  payload: { limit?: number; offset?: number };
}

export interface ServerAdminUsersList {
  type: "admin_users_list";
  payload: { users: UserListItem[] };
}

export interface ServerAdminUser {
  type: "admin_user";
  payload: { user: UserListItem };
}

export interface ServerAdminAuditLog {
  type: "admin_audit_log";
  payload: { entries: AuditEntry[]; limit: number; offset: number };
}

// ─── Phase 6: Admin demo management (WS) ─────────────────────────────────────

export interface ClientAdminGetDemoStatus {
  type: "admin_get_demo_status";
}

export interface ClientAdminToggleDemo {
  type: "admin_toggle_demo";
}

export interface ClientAdminSeedDemo {
  type: "admin_seed_demo";
}

export interface ClientAdminPurgeDemo {
  type: "admin_purge_demo";
}

export interface ServerAdminDemoStatus {
  type: "admin_demo_status";
  payload: DemoStatus;
}

// ─── Phase 6: Admin beta management (WS) ─────────────────────────────────────

export interface ClientAdminGetBetaStatus {
  type: "admin_get_beta_status";
}

export interface ClientAdminToggleBeta {
  type: "admin_toggle_beta";
}

export interface ClientAdminAddBetaTester {
  type: "admin_add_beta_tester";
  payload: { discordId: string; discordUsername?: string };
}

export interface ClientAdminRemoveBetaTester {
  type: "admin_remove_beta_tester";
  payload: { discordId: string };
}

export interface ServerAdminBetaStatus {
  type: "admin_beta_status";
  payload: BetaStatus;
}
