import type { SlotTransactionState } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoTxnFilter } from "../../demo/demo-mode.js";

export interface TransactionRow {
  id: number;
  sell_order_id: number;
  buy_order_id: number;
  seller_user_id: number;
  buyer_user_id: number;
  price: number;
  quantity: number;
  state: SlotTransactionState;
  mh_map_id: number;
  buyer_mh_sn_user_id: string;
  seller_mh_sn_user_id: string;
  failure_reason: string | null;
  payment_retry_count: number;
  is_rt: number;
  sb_transfer_ts: string | null;
  created_at: string;
  updated_at: string;
}

export function createTransaction(params: {
  sellOrderId: number;
  buyOrderId: number;
  sellerUserId: number;
  buyerUserId: number;
  price: number;
  quantity: number;
  mhMapId: number;
  buyerMhSnUserId: string;
  sellerMhSnUserId: string;
  isRt: number;
}): TransactionRow {
  return getDb()
    .prepare(
      `INSERT INTO transactions (
         sell_order_id, buy_order_id, seller_user_id, buyer_user_id,
         price, quantity, mh_map_id, buyer_mh_sn_user_id, seller_mh_sn_user_id, is_rt
       ) VALUES (
         @sellOrderId, @buyOrderId, @sellerUserId, @buyerUserId,
         @price, @quantity, @mhMapId, @buyerMhSnUserId, @sellerMhSnUserId, @isRt
       ) RETURNING *`
    )
    .get(params) as TransactionRow;
}

export function findTransactionById(
  id: number
): TransactionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(id) as TransactionRow | undefined;
}

export function findTransactionsByUser(
  userId: number
): TransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM transactions t
       WHERE (t.seller_user_id = ? OR t.buyer_user_id = ?) AND t.state != 'failed'
         ${demoTxnFilter("t", "slots")}
       ORDER BY t.created_at DESC
       LIMIT 50`
    )
    .all(userId, userId) as TransactionRow[];
}

export function findPendingTransactions(): TransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM transactions
       WHERE state NOT IN ('completed', 'failed')
       ORDER BY created_at ASC`
    )
    .all() as TransactionRow[];
}

/**
 * Get average price of last 50 completed transactions per map type.
 * Bounded to end-of-previous-day for cacheability.
 */
export function getAvgPriceByMapType(): Record<number, number> {
  const rows = getDb()
    .prepare(
      `SELECT map_type_id, ROUND(AVG(price)) as avg_price
       FROM (
         SELECT t.price, o.map_type_id,
                ROW_NUMBER() OVER (PARTITION BY o.map_type_id ORDER BY t.created_at DESC) as rn
         FROM transactions t
         JOIN orders o ON o.id = t.sell_order_id
         WHERE t.state = 'completed'
           AND DATE(t.created_at) <= DATE('now', '-1 day')
           ${demoTxnFilter("t", "slots")}
       )
       WHERE rn <= 50
       GROUP BY map_type_id`
    )
    .all() as Array<{ map_type_id: number; avg_price: number }>;

  const result: Record<number, number> = {};
  for (const row of rows) {
    result[row.map_type_id] = row.avg_price;
  }
  return result;
}

export interface SlotTierVolume {
  S: number;
  A: number;
  B: number;
  none: number;
}

/**
 * Market stats for a single map type: daily price history + sales volume.
 * Bounded to complete days only (through end of yesterday) for cacheability.
 * Includes tier breakdowns for filtering.
 */
export function getMarketStats(mapTypeId: number): {
  priceHistory: Array<{ date: string; avgPrice: number; volume: number; tierVolume: SlotTierVolume }>;
  sales: { yesterday: number; week: number; month: number; tierVolume: { yesterday: SlotTierVolume; week: SlotTierVolume; month: SlotTierVolume } };
} {
  // Price history with tier breakdown per day
  const priceHistory = getDb()
    .prepare(
      `SELECT DATE(t.created_at) as date,
              ROUND(AVG(t.price)) as avg_price,
              SUM(t.quantity) as volume,
              SUM(CASE WHEN o.tier = 'S' THEN t.quantity ELSE 0 END) as tier_s,
              SUM(CASE WHEN o.tier = 'A' THEN t.quantity ELSE 0 END) as tier_a,
              SUM(CASE WHEN o.tier = 'B' THEN t.quantity ELSE 0 END) as tier_b,
              SUM(CASE WHEN o.tier IS NULL THEN t.quantity ELSE 0 END) as tier_none
       FROM transactions t
       JOIN orders o ON o.id = t.sell_order_id
       WHERE o.map_type_id = ? AND t.state = 'completed'
         AND DATE(t.created_at) >= DATE('now', '-31 days')
         AND DATE(t.created_at) <= DATE('now', '-1 day')
       GROUP BY DATE(t.created_at)
       ORDER BY date ASC`
    )
    .all(mapTypeId) as Array<{
      date: string;
      avg_price: number;
      volume: number;
      tier_s: number;
      tier_a: number;
      tier_b: number;
      tier_none: number;
    }>;

  // Sales totals with tier breakdown
  const salesRow = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(t.created_at) = DATE('now', '-1 day') THEN t.quantity ELSE 0 END), 0) as yesterday,
         COALESCE(SUM(CASE WHEN DATE(t.created_at) >= DATE('now', '-7 days') THEN t.quantity ELSE 0 END), 0) as week,
         COALESCE(SUM(t.quantity), 0) as month,
         COALESCE(SUM(CASE WHEN DATE(t.created_at) = DATE('now', '-1 day') AND o.tier = 'S' THEN t.quantity ELSE 0 END), 0) as yesterday_s,
         COALESCE(SUM(CASE WHEN DATE(t.created_at) = DATE('now', '-1 day') AND o.tier = 'A' THEN t.quantity ELSE 0 END), 0) as yesterday_a,
         COALESCE(SUM(CASE WHEN DATE(t.created_at) = DATE('now', '-1 day') AND o.tier = 'B' THEN t.quantity ELSE 0 END), 0) as yesterday_b,
         COALESCE(SUM(CASE WHEN DATE(t.created_at) = DATE('now', '-1 day') AND o.tier IS NULL THEN t.quantity ELSE 0 END), 0) as yesterday_none,
         COALESCE(SUM(CASE WHEN DATE(t.created_at) >= DATE('now', '-7 days') AND o.tier = 'S' THEN t.quantity ELSE 0 END), 0) as week_s,
         COALESCE(SUM(CASE WHEN DATE(t.created_at) >= DATE('now', '-7 days') AND o.tier = 'A' THEN t.quantity ELSE 0 END), 0) as week_a,
         COALESCE(SUM(CASE WHEN DATE(t.created_at) >= DATE('now', '-7 days') AND o.tier = 'B' THEN t.quantity ELSE 0 END), 0) as week_b,
         COALESCE(SUM(CASE WHEN DATE(t.created_at) >= DATE('now', '-7 days') AND o.tier IS NULL THEN t.quantity ELSE 0 END), 0) as week_none,
         COALESCE(SUM(CASE WHEN o.tier = 'S' THEN t.quantity ELSE 0 END), 0) as month_s,
         COALESCE(SUM(CASE WHEN o.tier = 'A' THEN t.quantity ELSE 0 END), 0) as month_a,
         COALESCE(SUM(CASE WHEN o.tier = 'B' THEN t.quantity ELSE 0 END), 0) as month_b,
         COALESCE(SUM(CASE WHEN o.tier IS NULL THEN t.quantity ELSE 0 END), 0) as month_none
       FROM transactions t
       JOIN orders o ON o.id = t.sell_order_id
       WHERE o.map_type_id = ? AND t.state = 'completed'
         AND DATE(t.created_at) >= DATE('now', '-31 days')
         AND DATE(t.created_at) <= DATE('now', '-1 day')`
    )
    .get(mapTypeId) as {
      yesterday: number; week: number; month: number;
      yesterday_s: number; yesterday_a: number; yesterday_b: number; yesterday_none: number;
      week_s: number; week_a: number; week_b: number; week_none: number;
      month_s: number; month_a: number; month_b: number; month_none: number;
    };

  return {
    priceHistory: priceHistory.map((r) => ({
      date: r.date,
      avgPrice: r.avg_price,
      volume: r.volume,
      tierVolume: {
        S: r.tier_s,
        A: r.tier_a,
        B: r.tier_b,
        none: r.tier_none,
      },
    })),
    sales: {
      yesterday: salesRow.yesterday,
      week: salesRow.week,
      month: salesRow.month,
      tierVolume: {
        yesterday: { S: salesRow.yesterday_s, A: salesRow.yesterday_a, B: salesRow.yesterday_b, none: salesRow.yesterday_none },
        week: { S: salesRow.week_s, A: salesRow.week_a, B: salesRow.week_b, none: salesRow.week_none },
        month: { S: salesRow.month_s, A: salesRow.month_a, B: salesRow.month_b, none: salesRow.month_none },
      },
    },
  };
}

let marketStatsCacheDate: string | null = null;
const marketStatsCache = new Map<number, ReturnType<typeof getMarketStats>>();

export function getMarketStatsCached(mapTypeId: number): ReturnType<typeof getMarketStats> {
  const today = new Date().toISOString().slice(0, 10);
  if (marketStatsCacheDate !== today) {
    marketStatsCache.clear();
    marketStatsCacheDate = today;
  }

  const cached = marketStatsCache.get(mapTypeId);
  if (cached) return cached;

  const stats = getMarketStats(mapTypeId);
  marketStatsCache.set(mapTypeId, stats);
  return stats;
}

export function updateSlotTransactionState(
  id: number,
  state: SlotTransactionState,
  failureReason?: string
): void {
  if (failureReason) {
    getDb()
      .prepare(
        `UPDATE transactions SET state = ?, failure_reason = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(state, failureReason, id);
  } else {
    getDb()
      .prepare(
        "UPDATE transactions SET state = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(state, id);
  }
}

/**
 * Find all transactions in pending_payment state for a specific buyer.
 * Used on reconnection to retry failed payments.
 */
export function findPendingPaymentTransactions(
  buyerUserId: number
): TransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM transactions
       WHERE buyer_user_id = ? AND state = 'pending_payment'
       ORDER BY created_at ASC`
    )
    .all(buyerUserId) as TransactionRow[];
}

export function getPaymentRetryCount(transactionId: number): number {
  const row = getDb()
    .prepare("SELECT payment_retry_count FROM transactions WHERE id = ?")
    .get(transactionId) as { payment_retry_count: number } | undefined;
  return row?.payment_retry_count ?? 0;
}

export function setPaymentRetryCount(
  transactionId: number,
  count: number
): void {
  getDb()
    .prepare(
      "UPDATE transactions SET payment_retry_count = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(count, transactionId);
}

/**
 * Increment the payment retry count for a transaction.
 * Returns the new count.
 */
export function incrementPaymentRetryCount(transactionId: number): number {
  getDb()
    .prepare(
      `UPDATE transactions
       SET payment_retry_count = payment_retry_count + 1, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(transactionId);
  return getPaymentRetryCount(transactionId);
}

export function findActiveTransactionForBuyOrder(buyOrderId: number): TransactionRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM transactions
       WHERE buy_order_id = ? AND state NOT IN ('completed', 'failed')
       LIMIT 1`
    )
    .get(buyOrderId) as TransactionRow | undefined;
}

export function setSlotSbTransferTs(txnId: number, ts: string): void {
  getDb()
    .prepare("UPDATE transactions SET sb_transfer_ts = ?, updated_at = datetime('now') WHERE id = ?")
    .run(ts, txnId);
}
