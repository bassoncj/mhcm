import type { MapOrderMode, MapTransactionState } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoTxnFilter } from "../../demo/demo-mode.js";

export interface MapTransactionRow {
  id: number;
  sell_order_id: number;
  buy_order_id: number;
  seller_user_id: number;
  buyer_user_id: number;
  map_type_id: number;
  mode: MapOrderMode;
  price: number;
  quantity: number;
  state: MapTransactionState;
  mh_map_id: number | null;
  scroll_item_type: string | null;
  seller_mh_sn_user_id: string;
  buyer_mh_sn_user_id: string;
  failure_reason: string | null;
  retry_count: number;
  /** Buyer's captured timestamp immediately before the SB transfer API call. */
  sb_transfer_ts: string | null;
  created_at: string;
  updated_at: string;
}

export function createMapTransaction(params: {
  sellOrderId: number;
  buyOrderId: number;
  sellerUserId: number;
  buyerUserId: number;
  mapTypeId: number;
  mode: MapOrderMode;
  price: number;
  quantity: number;
  mhMapId: number | null;
  scrollItemType: string | null;
  sellerMhSnUserId: string;
  buyerMhSnUserId: string;
}): MapTransactionRow {
  return getDb()
    .prepare(
      `INSERT INTO map_transactions (
         sell_order_id, buy_order_id, seller_user_id, buyer_user_id,
         map_type_id, mode, price, quantity,
         mh_map_id, scroll_item_type,
         seller_mh_sn_user_id, buyer_mh_sn_user_id
       ) VALUES (
         @sellOrderId, @buyOrderId, @sellerUserId, @buyerUserId,
         @mapTypeId, @mode, @price, @quantity,
         @mhMapId, @scrollItemType,
         @sellerMhSnUserId, @buyerMhSnUserId
       ) RETURNING *`
    )
    .get(params) as MapTransactionRow;
}

export function findMapTransactionById(
  id: number
): MapTransactionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM map_transactions WHERE id = ?")
    .get(id) as MapTransactionRow | undefined;
}

export function findPendingMapTransactions(): MapTransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM map_transactions
       WHERE state NOT IN ('completed', 'failed')
       ORDER BY created_at ASC`
    )
    .all() as MapTransactionRow[];
}

export function updateMapTransactionState(
  id: number,
  state: MapTransactionState,
  failureReason?: string
): void {
  if (failureReason) {
    getDb()
      .prepare(
        `UPDATE map_transactions SET state = ?, failure_reason = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(state, failureReason, id);
  } else {
    getDb()
      .prepare(
        "UPDATE map_transactions SET state = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(state, id);
  }
}

export function recordMapPriceHistory(
  mapTypeId: number,
  mode: MapOrderMode,
  price: number,
  quantity: number
): void {
  getDb()
    .prepare(
      `INSERT INTO map_price_history (map_type_id, mode, price, quantity)
       VALUES (?, ?, ?, ?)`
    )
    .run(mapTypeId, mode, price, quantity);
}

export function findMapPendingCompletionTransactions(
  buyerUserId: number
): MapTransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM map_transactions
       WHERE buyer_user_id = ? AND state = 'pending_completion'
       ORDER BY created_at ASC`
    )
    .all(buyerUserId) as MapTransactionRow[];
}

export function getMapRetryCount(transactionId: number): number {
  const row = getDb()
    .prepare("SELECT retry_count FROM map_transactions WHERE id = ?")
    .get(transactionId) as { retry_count: number } | undefined;
  return row?.retry_count ?? 0;
}

export function incrementMapRetryCount(transactionId: number): number {
  getDb()
    .prepare(
      `UPDATE map_transactions
       SET retry_count = retry_count + 1, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(transactionId);
  return getMapRetryCount(transactionId);
}

/**
 * Market stats for a single (mapTypeId, mode) pair: daily price history + sales volume.
 * Bounded to complete days only (through end of yesterday) for cacheability.
 */
export function getMapMarketStats(mapTypeId: number, mode: MapOrderMode): {
  priceHistory: Array<{ date: string; avgPrice: number }>;
  sales: { yesterday: number; week: number; month: number };
} {
  const priceHistory = getDb()
    .prepare(
      `SELECT DATE(completed_at) as date,
              ROUND(AVG(price)) as avg_price
       FROM map_price_history
       WHERE map_type_id = ? AND mode = ?
         AND DATE(completed_at) >= DATE('now', '-90 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("map_price_history", "maps")}
       GROUP BY DATE(completed_at)
       ORDER BY date ASC`
    )
    .all(mapTypeId, mode) as Array<{
    date: string;
    avg_price: number;
  }>;

  const salesRow = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(completed_at) = DATE('now', '-1 day') THEN quantity ELSE 0 END), 0) as yesterday,
         COALESCE(SUM(CASE WHEN DATE(completed_at) >= DATE('now', '-7 days') THEN quantity ELSE 0 END), 0) as week,
         COALESCE(SUM(quantity), 0) as month
       FROM map_price_history
       WHERE map_type_id = ? AND mode = ?
         AND DATE(completed_at) >= DATE('now', '-30 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("map_price_history", "maps")}`
    )
    .get(mapTypeId, mode) as {
    yesterday: number;
    week: number;
    month: number;
  };

  return {
    priceHistory: priceHistory.map((r) => ({
      date: r.date,
      avgPrice: r.avg_price,
    })),
    sales: salesRow,
  };
}

let mapMarketStatsCacheDate: string | null = null;
const mapMarketStatsCache = new Map<
  string,
  ReturnType<typeof getMapMarketStats>
>();

export function getMapMarketStatsCached(
  mapTypeId: number,
  mode: MapOrderMode
): ReturnType<typeof getMapMarketStats> {
  const today = new Date().toISOString().slice(0, 10);
  if (mapMarketStatsCacheDate !== today) {
    mapMarketStatsCache.clear();
    mapMarketStatsCacheDate = today;
  }

  const cacheKey = `${mapTypeId}:${mode}`;
  const cached = mapMarketStatsCache.get(cacheKey);
  if (cached) return cached;

  const stats = getMapMarketStats(mapTypeId, mode);
  mapMarketStatsCache.set(cacheKey, stats);
  return stats;
}

export function invalidateMapMarketStatsCache(): void {
  mapMarketStatsCacheDate = null;
  mapMarketStatsCache.clear();
}

export function getAvgPriceByMapType(): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT map_type_id, mode, ROUND(AVG(price)) as avg_price
       FROM (
         SELECT price, map_type_id, mode,
                ROW_NUMBER() OVER (PARTITION BY map_type_id, mode ORDER BY completed_at DESC) as rn
         FROM map_price_history
         WHERE DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("map_price_history", "maps")}
       )
       WHERE rn <= 50
       GROUP BY map_type_id, mode`
    )
    .all() as Array<{ map_type_id: number; mode: MapOrderMode; avg_price: number }>;

  const result: Record<string, number> = {};
  for (const row of rows) {
    const key = `${row.map_type_id}:${row.mode}`;
    result[key] = row.avg_price;
  }
  return result;
}

export function setMapSbTransferTs(transactionId: number, ts: string): void {
  getDb()
    .prepare(
      `UPDATE map_transactions SET sb_transfer_ts = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(ts, transactionId);
}

export function findActiveMapTransactionForBuyOrder(buyOrderId: number): MapTransactionRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM map_transactions
       WHERE buy_order_id = ? AND state NOT IN ('completed', 'failed')
       LIMIT 1`
    )
    .get(buyOrderId) as MapTransactionRow | undefined;
}
