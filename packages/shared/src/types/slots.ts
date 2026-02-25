import type { OrderTier } from "./mice.js";

export type SlotOrderSide = "sell" | "buy";

export type SlotOrderStatus =
  | "open"
  | "partially_filled"
  | "filled"
  | "cancelled";

export interface SlotOrder {
  id: number;
  userId: number;
  mapTypeId: number;
  side: SlotOrderSide;
  /** Price per slot in SB. */
  price: number;
  quantity: number;
  filledQuantity: number;
  status: SlotOrderStatus;
  /**
   * MH map_id (required for sell orders - the specific map being sold).
   * Null for buy orders.
   */
  mhMapId: number | null;
  /**
   * Calculated tier for sell orders (S/A/B based on remaining mice).
   * Null for buy orders or untiered/legacy orders.
   */
  tier: OrderTier;
  /**
   * Accepted tiers for buy orders (JSON array of S/A/B/null).
   * Null means accept all tiers. Null for sell orders.
   */
  acceptedTiers: OrderTier[] | null;
  /**
   * RT price per slot in SB (sell orders only).
   * If set, seller accepts RT buyers at this discounted price.
   */
  rtPrice: number | null;
  /** If true, seller only accepts RT buyers (no non-RT price). */
  rtOnly: boolean;
  /** If true, this buy order commits to returning tradable items. */
  isRt: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Remaining goal on a map (mouse or item, for tier calculation). */
export interface RemainingGoal {
  uniqueId: number;
  /** Type string (e.g., "ancient_of_the_deep" for mice, "cherry_potion" for items). */
  type: string;
}

export interface CreateSlotOrderPayload {
  mapTypeId: number;
  side: SlotOrderSide;
  /** Price per slot in SB. */
  price: number;
  quantity: number;
  /**
   * MH map_id (required for sell orders).
   * The extension validates map state before sending.
   */
  mhMapId?: number;
  /**
   * Remaining goals (mice or items) on the map (for sell orders).
   * Used to calculate the order tier. Required for sell orders.
   */
  remainingGoals?: RemainingGoal[];
  /**
   * Accepted tiers for buy orders (multi-select S/A/B/null).
   * Defaults to all tiers if not specified.
   */
  acceptedTiers?: OrderTier[];
  /** Client's current SB balance (for server-side overcommit prevention). */
  sbBalance?: number;
  /** RT price per slot (sell orders). Seller accepts RT buyers at this price. */
  rtPrice?: number;
  /** Sell order is RT-only (no non-RT price). */
  rtOnly?: boolean;
  /** Buy order commits to returning tradable items. */
  isRt?: boolean;
}

export interface CancelSlotOrderPayload {
  orderId: number;
}

export interface AdjustSlotOrderPayload {
  orderId: number;
  price?: number;
  /** New total quantity (must be >= filledQuantity). */
  quantity?: number;
  /** Client's current SB balance (for server-side overcommit prevention). */
  sbBalance?: number;
}

/** Tier volume breakdown (for sell orders: what tier they ARE). */
export interface SlotTierVolume {
  S: number;
  A: number;
  B: number;
  none: number;
}

export interface SlotOrderBookLevel {
  price: number;
  /** Total unfilled slots at this price. */
  quantity: number;
  orderCount: number;
  /** Tier breakdown for sell orders (quantity by tier). */
  tierBreakdown?: SlotTierVolume;
  /**
   * Accepted tier breakdown for buy orders.
   * Shows how many slots at this price ACCEPT each tier.
   * Note: 'all' counts orders that accept ANY tier (acceptedTiers = null).
   */
  acceptedTiersBreakdown?: {
    S: number;
    A: number;
    B: number;
    all: number;
  };
  /** Number of RT-eligible (sell) or RT-committed (buy) slots at this price level. */
  rtQty?: number;
}

export interface SlotPricePoint {
  date: string;
  avgPrice: number;
  volume: number;
  /** Volume breakdown by tier of the sold map. */
  tierVolume: SlotTierVolume;
}

export interface SlotSalesStats {
  yesterday: number;
  week: number;
  month: number;
  /** Volume breakdown by tier for each time period. */
  tierVolume: {
    yesterday: SlotTierVolume;
    week: SlotTierVolume;
    month: SlotTierVolume;
  };
}

export interface SlotMarketStats {
  priceHistory: SlotPricePoint[];
  sales: SlotSalesStats;
}

export interface SlotOrderBookSnapshot {
  mapTypeId: number;
  sells: SlotOrderBookLevel[];
  buys: SlotOrderBookLevel[];
  stats: SlotMarketStats;
}

export type SlotTransactionState =
  | "pending"
  | "risk_checking"
  | "validating"
  | "inviting"
  | "invite_sent"
  | "verifying_invite_sent" // Buyer confirms invite was received
  | "accepting"
  | "cancelling_invite" // Buyer couldn't find invite, seller revoking it
  | "invite_accepted"
  | "transferring"
  | "verifying_sb_receipt" // Seller confirms SB payment was received
  | "pending_payment" // Buyer on map, payment failed, awaiting retry
  | "awaiting_map_completion" // RT: buyer on map, waiting for map to complete
  | "claiming_chest" // RT: buyer claiming chest from completed map
  | "opening_chest" // RT: buyer opening chest to identify tradable items
  | "transferring_rt" // RT: buyer transferring tradable items to seller
  | "completed"
  | "failed";

export interface SlotTransaction {
  id: number;
  sellOrderId: number;
  buyOrderId: number;
  sellerUserId: number;
  buyerUserId: number;
  /** Price per slot in SB (locked at match time). */
  price: number;
  /** Number of slots in this transaction. */
  quantity: number;
  state: SlotTransactionState;
  /** The MH map_id for this transaction. */
  mhMapId: number;
  /** The buyer's MH sn_user_id (needed for invite). */
  buyerMhSnUserId: string;
  /** The seller's MH sn_user_id (needed for SB transfer). */
  sellerMhSnUserId: string;
  createdAt: string;
  updatedAt: string;
  failureReason?: string;
  isRt: boolean;
  /** Total RT items to transfer (populated after chest opened). */
  rtItemsTotal?: number;
  rtItemsTransferred?: number;
}

export interface SlotTransactionHistoryLine {
  id: number;
  counterpartySnUserId: string;
  price: number;
  completedAt: string;
  isRt: boolean;
  /** Items returned via RT (only for completed RT transactions). */
  rtItems?: Array<{ name: string; quantity: number }>;
}

export interface SlotOrderHistoryGroup {
  orderId: number;
  side: "sell" | "buy";
  mapTypeId: number;
  mapDisplayName: string;
  mapThumbnail: string | null;
  price: number;
  quantity: number;
  filledQuantity: number;
  orderStatus: "open" | "partially_filled" | "filled" | "cancelled";
  lastActivityAt: string;
  transactions: SlotTransactionHistoryLine[];
}

export type SlotTransactionStepType =
  | "validate_map"
  | "send_invite"
  | "accept_invite"
  | "cancel_invite"
  | "check_balance_and_transfer"
  | "rt_claim_chest"
  | "rt_open_chest"
  | "rt_transfer_item";

export interface SlotTransactionStep {
  transactionId: number;
  step: SlotTransactionStepType;
  data: ValidateMapStepData | SendInviteStepData | AcceptInviteStepData | CancelInviteStepData | TransferStepData
    | RtClaimChestData | RtOpenChestData | RtTransferItemData;
}

export interface ValidateMapStepData {
  mhMapId: number;
  /** Expected available slots (max_hunters - active - invited). */
  requiredSlots: number;
}

export interface SendInviteStepData {
  mhMapId: number;
  buyerSnUserId: string;
}

export interface AcceptInviteStepData {
  mhMapId: number;
  /** Total SB cost so the extension can pre-check buyer's balance. */
  amount: number;
}

export interface TransferStepData {
  sellerSnUserId: string;
  /** Total SB to transfer (price * quantity for this cycle). */
  amount: number;
}

export interface CancelInviteStepData {
  mhMapId: number;
  buyerSnUserId: string;
}

export interface RtClaimChestData {
  mhMapId: number;
  mapType: string;
}

export interface RtOpenChestData {
  /** The chest item_type string (same as map_type). */
  chestItemType: string;
}

export interface RtTransferItemData {
  sellerSnUserId: string;
  itemType: string;
  itemName: string;
  quantity: number;
}
