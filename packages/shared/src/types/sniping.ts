import type { MHMapClass } from "./api.js";
import type { GoalType } from "./maps.js";
import type { MouseType } from "./mice.js";

/** Identifies a sniping target -- one of mouse, mouse group, item, or item group. */
export type SnipingTarget =
  | { mouseTypeId: number; mouseGroupId?: undefined; itemTypeId?: undefined; itemGroupId?: undefined }
  | { mouseGroupId: number; mouseTypeId?: undefined; itemTypeId?: undefined; itemGroupId?: undefined }
  | { itemTypeId: number; mouseTypeId?: undefined; mouseGroupId?: undefined; itemGroupId?: undefined }
  | { itemGroupId: number; mouseTypeId?: undefined; mouseGroupId?: undefined; itemTypeId?: undefined };

/** A mod-curated group of mouse types that trades as one unit. */
export interface SnipingMouseGroup {
  id: number;
  name: string;
  mice: Array<{ mouseTypeId: number; mouseName: string; mouseThumbnail: string | null }>;
  enabled: boolean;
  archived: boolean;
}

/** A mod-curated group of item types that trades as one unit. */
export interface SnipingItemGroup {
  id: number;
  name: string;
  items: Array<{ itemTypeId: number; itemName: string; itemThumbnail: string | null }>;
  enabled: boolean;
  archived: boolean;
}

/** sniper_sell = sniper offering service, sniper_buy = maptain wanting service */
export type SnipingOrderSide = "sniper_sell" | "sniper_buy";

export type SnipingOrderStatus =
  | "open"
  | "matched"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "paused";

export interface SnipingOrder {
  id: number;
  userId: number;
  goalType: GoalType;
  mouseTypeId?: number;
  mouseName?: string;
  mouseThumbnail?: string | null;
  mouseGroupId?: number;
  mouseGroupName?: string;
  itemTypeId?: number;
  itemName?: string;
  itemThumbnail?: string | null;
  itemGroupId?: number;
  itemGroupName?: string;
  side: SnipingOrderSide;
  price: number;
  status: SnipingOrderStatus;
  /** For sniper_buy orders: the map that needs the snipe. */
  mhMapId?: number;
  pausedReason?: string;
  createdAt: string;
}

/** Payload to create a sniping order (exactly one of mouseTypeId, mouseGroupId, itemTypeId, or itemGroupId). */
export interface CreateSnipingOrderPayload {
  goalType?: GoalType;
  mouseTypeId?: number;
  mouseGroupId?: number;
  itemTypeId?: number;
  itemGroupId?: number;
  side: SnipingOrderSide;
  price: number;
  /** Required for sniper_buy orders. */
  mhMapId?: number;
  /** Map class of the target map (for class-aware matching). */
  mapClass?: MHMapClass;
  /** Minimum rank ID required for the map (for rank-based sniping matching). */
  minRankId?: number;
  /** Client's current SB balance (for server-side overcommit prevention). */
  sbBalance?: number;
}

export interface CancelSnipingOrderPayload {
  orderId: number;
}

export interface SnipingOrderBookLevel {
  price: number;
  quantity: number;
}

export interface SnipingPricePoint {
  date: string;
  avgPrice: number;
  volume: number;
}

export interface SnipingSalesStats {
  yesterday: number;
  week: number;
  month: number;
}

export interface SnipingMarketStats {
  priceHistory: SnipingPricePoint[];
  sales: SnipingSalesStats;
}

/** Order book snapshot for a sniping target (mouse, mouse group, item, or item group). */
export interface SnipingOrderBookSnapshot {
  mouseTypeId?: number;
  mouseGroupId?: number;
  itemTypeId?: number;
  itemGroupId?: number;
  sells: SnipingOrderBookLevel[];
  buys: SnipingOrderBookLevel[];
  stats: SnipingMarketStats;
  /** Groups that contain this mouse (only for individual mouse order books). */
  groupsContainingMouse?: Array<{ groupId: number; groupName: string }>;
  /** Component mice in this group (only for mouse group order books). */
  groupMembers?: Array<{ mouseTypeId: number; name: string; thumbnail: string | null }>;
  /** Groups that contain this item (only for individual item order books). */
  groupsContainingItem?: Array<{ groupId: number; groupName: string }>;
  /** Component items in this group (only for item group order books). */
  itemGroupMembers?: Array<{ itemTypeId: number; name: string; thumbnail: string | null }>;
}

export type SnipingTransactionState =
  | "pending"
  | "inviting"
  | "invite_sent"
  | "sniping"
  | "awaiting_payment"
  | "pending_payment"
  | "transferring"
  | "awaiting_leave"
  | "completed"
  | "failed";

export interface SnipingTransaction {
  id: number;
  sniperUserId: number;
  maptainUserId: number;
  goalType: GoalType;
  mouseGroupId?: number;
  mouseGroupName?: string;
  itemGroupId?: number;
  itemGroupName?: string;
  mhMapId: number;
  totalPrice: number;
  state: SnipingTransactionState;
  sniperMhSnUserId: string;
  maptainMhSnUserId: string;
  failureReason?: string;
  /** Mouse goals (populated for goalType='mouse'). */
  mice: SnipingTransactionMouse[];
  /** Item goals (populated for goalType='item'). */
  items: SnipingTransactionItem[];
  createdAt: string;
  updatedAt: string;
}

export interface SnipingTransactionMouse {
  mouseTypeId: number;
  mouseName: string;
  mouseThumbnail: string | null;
  price: number;
  caught: boolean;
  caughtAt?: string;
  paid: boolean;
  paidAt?: string;
}

export interface SnipingTransactionItem {
  itemTypeId: number;
  itemName: string;
  itemThumbnail: string | null;
  price: number;
  found: boolean;
  foundAt?: string;
  paid: boolean;
  paidAt?: string;
}

export interface SnipingHistoryMouse {
  mouseTypeId: number;
  mouseName: string;
  mouseThumbnail: string | null;
  price: number;
  caught: boolean;
  caughtAt?: string;
}

export interface SnipingHistoryItem {
  itemTypeId: number;
  itemName: string;
  itemThumbnail: string | null;
  price: number;
  found: boolean;
  foundAt?: string;
}

export interface SnipingMapTransactionLine {
  id: number;
  counterpartySnUserId: string;
  totalPrice: number;
  state: "completed" | "failed";
  failureReason?: string;
  mice: SnipingHistoryMouse[];
  items: SnipingHistoryItem[];
  completedAt: string;
}

/** One sniping history group -- grouped by map ID. */
export interface SnipingMapHistoryGroup {
  mhMapId: number;
  /** "sniper" or "maptain" -- the current user's role on this map. */
  role: "sniper" | "maptain";
  goalType: GoalType;
  totalGoals: number;
  completedGoals: number;
  totalSb: number;
  lastActivityAt: string;
  transactions: SnipingMapTransactionLine[];
}

export interface MouseSearchResult {
  mice: MouseType[];
}

export interface SnipingPriceSuggestion {
  mouseTypeId?: number;
  mouseGroupId?: number;
  itemTypeId?: number;
  itemGroupId?: number;
  /** 7-day average price (null if no data). */
  avg7d: number | null;
  /** 30-day average price (null if no data). */
  avg30d: number | null;
}

export type PaymentPenaltyType = "insufficient_sb";
export type PaymentPenaltyResolution = "paid" | "suspended";

export interface PaymentPenalty {
  id: number;
  userId: number;
  transactionId: number;
  penaltyType: PaymentPenaltyType;
  reportedBalance?: number;
  requiredAmount: number;
  graceExpiresAt: string;
  resolvedAt?: string;
  resolution?: PaymentPenaltyResolution;
  createdAt: string;
}
