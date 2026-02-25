import { getDb } from "../connection.js";

export interface RtPendingItemRow {
  id: number;
  transaction_id: number;
  item_type: string;
  item_name: string;
  quantity: number;
  transferred: number;
  created_at: string;
  transferred_at: string | null;
}

export function insertRtPendingItems(
  transactionId: number,
  items: Array<{ type: string; name: string; quantity: number }>
): void {
  const stmt = getDb().prepare(
    `INSERT INTO rt_pending_items (transaction_id, item_type, item_name, quantity)
     VALUES (?, ?, ?, ?)`
  );
  const insertAll = getDb().transaction(() => {
    for (const item of items) {
      stmt.run(transactionId, item.type, item.name, item.quantity);
    }
  });
  insertAll();
}

export function findNextPendingRtItem(
  transactionId: number
): RtPendingItemRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM rt_pending_items
       WHERE transaction_id = ? AND transferred = 0
       ORDER BY id ASC
       LIMIT 1`
    )
    .get(transactionId) as RtPendingItemRow | undefined;
}

export function findRtPendingItems(
  transactionId: number
): RtPendingItemRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM rt_pending_items
       WHERE transaction_id = ?
       ORDER BY id ASC`
    )
    .all(transactionId) as RtPendingItemRow[];
}

export function markRtItemTransferred(itemId: number): void {
  getDb()
    .prepare(
      `UPDATE rt_pending_items
       SET transferred = 1, transferred_at = datetime('now')
       WHERE id = ?`
    )
    .run(itemId);
}

export function countRtItemProgress(
  transactionId: number
): { total: number; transferred: number } {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN transferred = 1 THEN 1 ELSE 0 END) as transferred
       FROM rt_pending_items
       WHERE transaction_id = ?`
    )
    .get(transactionId) as { total: number; transferred: number };
  return { total: row.total, transferred: row.transferred };
}

/** Used when resetting to claiming_chest on restart. */
export function deleteRtPendingItems(transactionId: number): void {
  getDb()
    .prepare(`DELETE FROM rt_pending_items WHERE transaction_id = ?`)
    .run(transactionId);
}

export function findRtTransactionsAwaitingCompletion(
  mhMapId: number
): Array<{ id: number; buyer_user_id: number }> {
  return getDb()
    .prepare(
      `SELECT id, buyer_user_id FROM transactions
       WHERE mh_map_id = ? AND state = 'awaiting_map_completion' AND is_rt = 1`
    )
    .all(mhMapId) as Array<{ id: number; buyer_user_id: number }>;
}

export function findRtAwaitingCompletionByBuyer(
  buyerUserId: number
): Array<{ id: number; mh_map_id: number; seller_user_id: number; seller_mh_sn_user_id: string }> {
  return getDb()
    .prepare(
      `SELECT id, mh_map_id, seller_user_id, seller_mh_sn_user_id FROM transactions
       WHERE buyer_user_id = ? AND state = 'awaiting_map_completion' AND is_rt = 1`
    )
    .all(buyerUserId) as Array<{ id: number; mh_map_id: number; seller_user_id: number; seller_mh_sn_user_id: string }>;
}
