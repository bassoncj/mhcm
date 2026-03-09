import type { MHMapClass, MHMapQuality } from "./api.js";
import type { RemainingGoal } from "./slots.js";

/** Goal type discriminator: mouse-goal maps vs item-goal (scavenger hunt) maps. */
export type GoalType = "mouse" | "item";

/** Markets that can be independently enabled/disabled per map type. */
export type MapMarket = "slots" | "unopened" | "complete";

/** Number of remaining goals allowed for listing: 1=LM/LL, 2=L2M/L2L, 3=L3M/L3L. */
export type LastGoalCount = 1 | 2 | 3;

/** @deprecated Use LastGoalCount instead. */
export type LastMouseCount = LastGoalCount;

/**
 * A map type in the marketplace catalog.
 * `id` is an auto-increment integer PK. `mapType` is the chest type string
 * from api.mouse.rip (e.g., "arduous_rh_treasure_chest_convertible") which
 * matches `treasure_map.reward.type` from the game API.
 */
export interface MapType {
  id: number;
  /** Chest type string -- matches treasure_map.reward.type exactly. */
  mapType: string;
  quality: MHMapQuality;
  goal: GoalType;
  /** Human-readable name. Updated to QuestRelicHunter map name on first discovery. */
  displayName: string;
  thumbnail: string | null;
  /** Optional short alias set by admins/moderators (e.g., "RECS"). */
  alias: string | null;
  maxHunters: number;
  /** Max remaining goals for listing eligibility: 1=LM/LL, 2=L2M/L2L, 3=L3M/L3L. */
  lastGoalCount: LastGoalCount;
  enabledSlots: boolean;
  enabledUnopened: boolean;
  enabledComplete: boolean;
  /** Scroll item type required to open this map (for unopened marketplace). */
  scrollItemType: string | null;
  /** Minimum hunter rank ID required to use this scroll (for rank-dependent maps). */
  minRank: number | null;
  /** Human-readable rank name for display (populated server-side from ranks table). */
  minRankName: string | null;
  /** Map class: treasure, event, or poster. Null if not yet classified. */
  mapClass: MHMapClass | null;
  supportsRt: boolean;
}

/** Per-map-type marketplace stats for sorting/display in the selector. */
export interface MapTypeStats {
  /** Count of open orders (buy + sell). */
  activity: number;
  avgPrice: number | null;
}

/** Payload for auto-discovered map types sent from the extension. */
export interface DiscoveredMapType {
  quality: MHMapQuality;
  name: string;
  maxHunters?: number;
  /** treasure_map.reward.type -- matches the map_type column in the DB. */
  rewardType?: string;
  /** treasure_map.reward.thumb_transparent -- fallback thumbnail for new maps. */
  thumbnail?: string;
  mapClass?: MHMapClass;
  /** True for scavenger hunt (item-goal) maps. Null/false for mouse-goal maps. */
  isScavengerHunt?: boolean;
  /** treasure_map.min_title_name -- minimum rank name from the game API (e.g. "Baron"). */
  minTitleName?: string;
}

export interface Scroll {
  id: number;
  type: string;
  name: string;
  thumbnail: string | null;
}

export type MapOrderMode = "unopened" | "completed";
export type MapOrderSide = "sell" | "buy";
export type MapOrderStatus = "open" | "partially_filled" | "filled" | "cancelled";

export interface MapOrder {
  id: number;
  userId: number;
  mapTypeId: number;
  mode: MapOrderMode;
  side: MapOrderSide;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: MapOrderStatus;
  closeReason: string | null;
  mhMapId: number | null;
  tier: "S" | "A" | "B" | null;
  acceptedTiers: ("S" | "A" | "B")[] | null;
  priorityAt: string;
  createdAt: string;
  updatedAt: string;
  // Denormalized display fields
  mapDisplayName: string;
  mapThumbnail: string | null;
}

export interface CreateMapOrderPayload {
  mapTypeId: number;
  mode: MapOrderMode;
  side: MapOrderSide;
  price: number;
  quantity: number;
  mhMapId?: number;
  remainingGoals?: RemainingGoal[]; // For completed sells: tier calculation
  acceptedTiers?: ("S" | "A" | "B")[];
  /** Client's current SB balance (for server-side overcommit prevention). */
  sbBalance?: number;
}

export interface CancelMapOrderPayload {
  orderId: number;
}

export interface AdjustMapOrderPayload {
  orderId: number;
  price?: number;
  quantity?: number;
  /** Client's current SB balance (for server-side overcommit prevention). */
  sbBalance?: number;
}

export type MapTransactionState =
  | "pending"
  | "risk_checking"
  | "validating_seller"
  | "validating_buyer"
  | "inviting"
  | "verifying_invite_sent"
  | "verifying_map_valid"
  | "transferring_sb"
  | "verifying_sb_receipt"
  | "verifying_map_free"
  | "opening_scroll"
  | "verifying_scroll_opened"
  | "accepting"
  | "transferring_ownership"
  | "verifying_ownership"
  | "seller_leaving"
  | "verifying_seller_left"
  | "reversing_sb"
  | "cancelling_invite"
  | "pending_completion"
  | "completed"
  | "failed";

export interface MapTransaction {
  id: number;
  sellOrderId: number;
  buyOrderId: number;
  sellerUserId: number;
  buyerUserId: number;
  mapTypeId: number;
  mode: MapOrderMode;
  price: number;
  quantity: number;
  state: MapTransactionState;
  mhMapId: number | null;
  scrollItemType: string | null;
  sellerMhSnUserId: string;
  buyerMhSnUserId: string;
  failureReason: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  /** True when a post-PONR step has parked waiting for a party to reconnect. */
  parked?: boolean;
  /** Which party must reconnect and retry to unpark. */
  parkedWaitingFor?: "seller" | "buyer";
}

/** Typed step data interfaces prevent field name bugs at compile time. */
export type MapStepType =
  | "map_validate_scroll"
  | "map_validate_sb"
  | "map_validate_map"
  | "map_transfer_sb"
  | "map_open_scroll"
  | "map_reverse_sb"
  | "map_send_invite"
  | "map_cancel_invite"
  | "map_accept_invite"
  | "map_transfer_ownership"
  | "map_leave_map";

export interface MapValidateScrollData {
  scrollItemType: string;
  requiredQuantity: number;
}

export interface MapValidateSbData {
  requiredAmount: number;
}

export interface MapValidateMapData {
  mhMapId: number;
}

export interface MapTransferSbData {
  receiverSnUserId: string; // CRITICAL: must match service worker read
  amount: number;
}

export interface MapOpenScrollData {
  scrollItemType: string;
}

export interface MapReverseSbData {
  receiverSnUserId: string; // Buyer's SN user ID for refund
  amount: number;
}

export interface MapSendInviteData {
  mhMapId: number;
  buyerSnUserId: string;
}

export interface MapCancelInviteData {
  mhMapId: number;
  buyerSnUserId: string;
}

export interface MapAcceptInviteData {
  mhMapId: number;
}

export interface MapTransferOwnershipData {
  mhMapId: number;
  buyerSnUserId: string;
}

export interface MapLeaveMapData {
  mhMapId: number;
}

export interface MapTransactionStep {
  transactionId: number;
  step: MapStepType;
  data:
    | MapValidateScrollData
    | MapValidateSbData
    | MapValidateMapData
    | MapTransferSbData
    | MapOpenScrollData
    | MapReverseSbData
    | MapSendInviteData
    | MapCancelInviteData
    | MapAcceptInviteData
    | MapTransferOwnershipData
    | MapLeaveMapData;
}

export interface MapOrderBookLevel {
  price: number;
  totalQuantity: number;
  orderCount: number;
  // Tier breakdown (completed mode only)
  tierS?: number;
  tierA?: number;
  tierB?: number;
}

export interface MapPricePoint {
  date: string; // YYYY-MM-DD
  avgPrice: number;
}

export interface MapSalesStats {
  yesterday: number; // Volume sold yesterday
  week: number; // Volume sold in last 7 days
  month: number; // Volume sold in last 30 days
}

export interface MapMarketStats {
  priceHistory: MapPricePoint[]; // Daily avg prices for last 90 days
  sales: MapSalesStats;
}

export interface MapOrderBookSnapshot {
  mapTypeId: number;
  mode: MapOrderMode;
  sells: MapOrderBookLevel[];
  buys: MapOrderBookLevel[];
  stats: MapMarketStats | null;
}

export interface MapHomeItem {
  mapTypeId: number;
  mapDisplayName: string;
  mapThumbnail: string | null;
  avgPrice: number | null;
  volume: number; // Volume metric (depends on section)
}

export interface MapHomeData {
  mode: MapOrderMode;
  topSelling: MapHomeItem[]; // Top 10 by 30-day volume
  favourites: MapHomeItem[]; // User's favourited map types
  highValue: MapHomeItem[]; // Top 10 by avg price (last 30 days)
  inDemand: MapHomeItem[]; // Top 10 by open buy order volume
}

export interface MapTransactionLine {
  transactionId: number;
  counterpartySnUserId: string;
  price: number; // Always positive (UI applies sign based on side)
  quantity: number;
  completedAt: string | null;
  state: MapTransactionState;
  failureReason: string | null;
}

export interface MapOrderHistoryGroup {
  orderId: number;
  mapTypeId: number;
  mapDisplayName: string;
  mapThumbnail: string | null;
  mode: MapOrderMode;
  side: MapOrderSide;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: MapOrderStatus;
  tier: "S" | "A" | "B" | null;
  createdAt: string;
  transactions: MapTransactionLine[];
}
