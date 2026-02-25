import type { ItemTransactionState } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoTxnFilter } from "../../demo/demo-mode.js";

export interface ItemTransactionRow {
  id: number;
  sell_order_id: number;
  buy_order_id: number;
  seller_user_id: number;
  buyer_user_id: number;
  item_type_id: number;
  item_type: string;
  price: number;
  quantity: number;
  state: ItemTransactionState;
  seller_mh_sn_user_id: string;
  buyer_mh_sn_user_id: string;
  failure_reason: string | null;
  payment_retry_count: number;
  seller_transfer_ts: string | null;
  buyer_transfer_ts: string | null;
  created_at: string;
  updated_at: string;
}

export function createItemTransaction(params: {
  sellOrderId: number;
  buyOrderId: number;
  sellerUserId: number;
  buyerUserId: number;
  itemTypeId: number;
  itemType: string;
  price: number;
  quantity: number;
  sellerMhSnUserId: string;
  buyerMhSnUserId: string;
}): ItemTransactionRow {
  return getDb()
    .prepare(
      `INSERT INTO item_transactions (
         sell_order_id, buy_order_id, seller_user_id, buyer_user_id,
         item_type_id, item_type, price, quantity,
         seller_mh_sn_user_id, buyer_mh_sn_user_id
       ) VALUES (
         @sellOrderId, @buyOrderId, @sellerUserId, @buyerUserId,
         @itemTypeId, @itemType, @price, @quantity,
         @sellerMhSnUserId, @buyerMhSnUserId
       ) RETURNING *`
    )
    .get(params) as ItemTransactionRow;
}

export function findItemTransactionById(
  id: number
): ItemTransactionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM item_transactions WHERE id = ?")
    .get(id) as ItemTransactionRow | undefined;
}

export function findPendingItemTransactions(): ItemTransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM item_transactions
       WHERE state NOT IN ('completed', 'failed')
       ORDER BY created_at ASC`
    )
    .all() as ItemTransactionRow[];
}

export function updateItemTransactionState(
  id: number,
  state: ItemTransactionState,
  failureReason?: string
): void {
  if (failureReason) {
    getDb()
      .prepare(
        `UPDATE item_transactions SET state = ?, failure_reason = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(state, failureReason, id);
  } else {
    getDb()
      .prepare(
        "UPDATE item_transactions SET state = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(state, id);
  }
}

export function recordItemPriceHistory(
  itemTypeId: number,
  price: number,
  quantity: number
): void {
  getDb()
    .prepare(
      `INSERT INTO item_price_history (item_type_id, price, quantity)
       VALUES (?, ?, ?)`
    )
    .run(itemTypeId, price, quantity);
}

export function findItemPendingPaymentTransactions(
  buyerUserId: number
): ItemTransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM item_transactions
       WHERE buyer_user_id = ? AND state = 'pending_payment'
       ORDER BY created_at ASC`
    )
    .all(buyerUserId) as ItemTransactionRow[];
}

export function getItemPaymentRetryCount(transactionId: number): number {
  const row = getDb()
    .prepare("SELECT payment_retry_count FROM item_transactions WHERE id = ?")
    .get(transactionId) as { payment_retry_count: number } | undefined;
  return row?.payment_retry_count ?? 0;
}

export function incrementItemPaymentRetryCount(transactionId: number): number {
  getDb()
    .prepare(
      `UPDATE item_transactions
       SET payment_retry_count = payment_retry_count + 1, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(transactionId);
  return getItemPaymentRetryCount(transactionId);
}

/**
 * Market stats for a single item type: daily price history + sales volume.
 * Bounded to complete days only (through end of yesterday) for cacheability.
 */
export function getItemMarketStats(itemTypeId: number): {
  priceHistory: Array<{ date: string; avgPrice: number; volume: number }>;
  sales: { yesterday: number; week: number; month: number };
} {
  const priceHistory = getDb()
    .prepare(
      `SELECT DATE(completed_at) as date,
              ROUND(AVG(price), 1) as avg_price,
              SUM(quantity) as volume
       FROM item_price_history
       WHERE item_type_id = ?
         AND DATE(completed_at) >= DATE('now', '-31 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("item_price_history", "items")}
       GROUP BY DATE(completed_at)
       ORDER BY date ASC`
    )
    .all(itemTypeId) as Array<{
    date: string;
    avg_price: number;
    volume: number;
  }>;

  const salesRow = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(completed_at) = DATE('now', '-1 day') THEN quantity ELSE 0 END), 0) as yesterday,
         COALESCE(SUM(CASE WHEN DATE(completed_at) >= DATE('now', '-7 days') THEN quantity ELSE 0 END), 0) as week,
         COALESCE(SUM(quantity), 0) as month
       FROM item_price_history
       WHERE item_type_id = ?
         AND DATE(completed_at) >= DATE('now', '-31 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("item_price_history", "items")}`
    )
    .get(itemTypeId) as { yesterday: number; week: number; month: number };

  return {
    priceHistory: priceHistory.map((r) => ({
      date: r.date,
      avgPrice: r.avg_price,
      volume: r.volume,
    })),
    sales: salesRow,
  };
}

let itemMarketStatsCacheDate: string | null = null;
const itemMarketStatsCache = new Map<number, ReturnType<typeof getItemMarketStats>>();

export function getItemMarketStatsCached(
  itemTypeId: number
): ReturnType<typeof getItemMarketStats> {
  const today = new Date().toISOString().slice(0, 10);
  if (itemMarketStatsCacheDate !== today) {
    itemMarketStatsCache.clear();
    itemMarketStatsCacheDate = today;
  }

  const cached = itemMarketStatsCache.get(itemTypeId);
  if (cached) return cached;

  const stats = getItemMarketStats(itemTypeId);
  itemMarketStatsCache.set(itemTypeId, stats);
  return stats;
}

export function invalidateItemMarketStatsCache(): void {
  itemMarketStatsCacheDate = null;
  itemMarketStatsCache.clear();
}

export function setItemSellerTransferTs(txnId: number, ts: string): void {
  getDb()
    .prepare("UPDATE item_transactions SET seller_transfer_ts = ?, updated_at = datetime('now') WHERE id = ?")
    .run(ts, txnId);
}

export function setItemBuyerTransferTs(txnId: number, ts: string): void {
  getDb()
    .prepare("UPDATE item_transactions SET buyer_transfer_ts = ?, updated_at = datetime('now') WHERE id = ?")
    .run(ts, txnId);
}

export function getAvgPriceByItemType(): Record<number, number> {
  const rows = getDb()
    .prepare(
      `SELECT item_type_id, ROUND(AVG(price), 1) as avg_price
       FROM (
         SELECT price, item_type_id,
                ROW_NUMBER() OVER (PARTITION BY item_type_id ORDER BY completed_at DESC) as rn
         FROM item_price_history
         WHERE DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("item_price_history", "items")}
       )
       WHERE rn <= 50
       GROUP BY item_type_id`
    )
    .all() as Array<{ item_type_id: number; avg_price: number }>;

  const result: Record<number, number> = {};
  for (const row of rows) {
    result[row.item_type_id] = row.avg_price;
  }
  return result;
}
