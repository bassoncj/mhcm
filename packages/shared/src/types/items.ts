export interface ItemType {
  id: number;
  /** Game API slug (e.g. "condensed_creativity_stat_item"). */
  type: string;
  name: string;
  /** Category (e.g. "bait", "weapon", "base", "trinket"). */
  classification: string;
  thumbnail: string | null;
  /** Mod-assigned alternate searchable name. */
  alias: string | null;
  /** Global tier override for item-goal map classification (null = default to B). */
  globalTier: "S" | "A" | "B" | null;
  isTradable: boolean;
  /** Whether this item is hidden by default in the mod tier UI (non-goal classifications/tags). */
  systemHidden: boolean;
  enabled: boolean;
  /** Whether this item always triggers a risk warning on match (regardless of location). */
  alwaysWarn: boolean;
  /** True when this entry represents a sniping item group, not an individual item. */
  isGroup?: boolean;
  /** Group-only: whether the group is archived. */
  archived?: boolean;
  /** Group-only: number of items in the group. */
  itemCount?: number;
}

/** Per-map-type tier override for an item (mirrors MouseMapTier). */
export interface ItemMapTier {
  itemTypeId: number;
  mapTypeId: number;
  tier: "S" | "A" | "B";
}

export type ItemOrderSide = "sell" | "buy";

export type ItemOrderStatus =
  | "open"
  | "partially_filled"
  | "filled"
  | "cancelled";

export interface ItemOrder {
  id: number;
  userId: number;
  itemTypeId: number;
  itemName: string;
  itemThumbnail: string | null;
  side: ItemOrderSide;
  /** Price per unit in SB (supports one decimal place, e.g. 1.3). */
  price: number;
  quantity: number;
  filledQuantity: number;
  status: ItemOrderStatus;
  /** Reason the order was closed (e.g. "Insufficient SB", "Item(s) no longer found"). */
  closeReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemOrderPayload {
  itemTypeId: number;
  side: ItemOrderSide;
  /** Price per unit in SB (supports one decimal place, minimum 0.1). */
  price: number;
  quantity: number;
  /** Client's current SB balance (for server-side overcommit prevention). */
  sbBalance?: number;
}

export interface CancelItemOrderPayload {
  orderId: number;
}

export interface AdjustItemOrderPayload {
  orderId: number;
  /** New price per unit in SB (supports one decimal place, e.g. 1.3). */
  price?: number;
  /** New total quantity (must be >= filledQuantity). */
  quantity?: number;
  /** Client's current SB balance (for server-side overcommit prevention). */
  sbBalance?: number;
}

export interface ItemOrderBookLevel {
  /** Price per unit in SB (supports one decimal place, e.g. 1.3). */
  price: number;
  totalQuantity: number;
  orderCount: number;
}

export interface ItemPricePoint {
  date: string;
  /** Average price in SB (supports one decimal place, e.g. 1.3). */
  avgPrice: number;
  volume: number;
}

export interface ItemSalesStats {
  yesterday: number;
  week: number;
  month: number;
}

export interface ItemMarketStats {
  priceHistory: ItemPricePoint[];
  sales: ItemSalesStats;
}

export interface ItemOrderBookSnapshot {
  itemTypeId: number;
  sells: ItemOrderBookLevel[];
  buys: ItemOrderBookLevel[];
  stats: ItemMarketStats;
}

export type ItemTransactionState =
  | "pending"
  | "validating"
  | "seller_transferring"
  | "verifying_item_receipt"
  | "buyer_transferring"
  | "verifying_sb_receipt"
  | "pending_payment"
  | "completed"
  | "failed";

export interface ItemTransaction {
  id: number;
  sellOrderId: number;
  buyOrderId: number;
  sellerUserId: number;
  buyerUserId: number;
  itemTypeId: number;
  /** Game API slug for the item being traded. */
  itemType: string;
  itemName: string;
  itemThumbnail: string | null;
  /** Price per unit in SB (locked at match time, supports one decimal place). */
  price: number;
  quantity: number;
  state: ItemTransactionState;
  sellerMhSnUserId: string;
  buyerMhSnUserId: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type ItemStepType =
  | "item_validate_seller"
  | "item_validate_buyer"
  | "item_transfer_items"
  | "item_transfer_sb";

export interface ItemTransactionStep {
  transactionId: number;
  step: ItemStepType;
  data: Record<string, unknown>;
}

export interface ItemHomeItem {
  itemTypeId: number;
  name: string;
  thumbnail: string | null;
  /** Average price in SB (supports one decimal place, e.g. 1.3). */
  avgPrice: number | null;
}

export interface ItemHomeData {
  topSelling: ItemHomeItem[];
  favourites: ItemHomeItem[];
  highValue: ItemHomeItem[];
  inDemand: ItemHomeItem[];
}

export interface ItemTransactionLine {
  id: number;
  counterpartySnUserId: string;
  /** Price per unit in SB (supports one decimal place, e.g. 1.3). */
  price: number;
  quantity: number;
  completedAt: string;
}

/** Mirrors SlotOrderHistoryGroup for slots. */
export interface ItemOrderHistoryGroup {
  orderId: number;
  side: "sell" | "buy";
  itemTypeId: number;
  itemName: string;
  itemThumbnail: string | null;
  /** Price per unit in SB (supports one decimal place, e.g. 1.3). */
  price: number;
  quantity: number;
  filledQuantity: number;
  orderStatus: "open" | "partially_filled" | "filled" | "cancelled";
  lastActivityAt: string;
  transactions: ItemTransactionLine[];
}

