import type { SnipingTransactionState } from "@mhcm/shared";
import { getDb } from "../connection.js";

export interface SnipingTransactionRow {
  id: number;
  sniper_user_id: number;
  maptain_user_id: number;
  mouse_group_id: number | null;
  item_group_id: number | null;
  goal_type: string;
  mh_map_id: number;
  total_price: number;
  state: SnipingTransactionState;
  sniper_mh_sn_user_id: string;
  maptain_mh_sn_user_id: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SnipingTransactionMouseRow {
  id: number;
  transaction_id: number;
  buy_order_id: number;
  sell_order_id: number;
  mouse_type_id: number;
  price: number;
  caught: number;
  caught_at: string | null;
  paid: number;
  paid_at: string | null;
}

export interface SnipingTransactionItemRow {
  transaction_id: number;
  buy_order_id: number;
  sell_order_id: number;
  item_type_id: number;
  price: number;
  found: number;
  found_at: string | null;
  paid: number;
  paid_at: string | null;
}

export function createSnipingTransaction(params: {
  sniperUserId: number;
  maptainUserId: number;
  mouseGroupId?: number;
  itemGroupId?: number;
  goalType: string;
  mhMapId: number;
  totalPrice: number;
  sniperMhSnUserId: string;
  maptainMhSnUserId: string;
}): SnipingTransactionRow {
  return getDb()
    .prepare(
      `INSERT INTO sniping_transactions (
         sniper_user_id, maptain_user_id, mouse_group_id, item_group_id, goal_type,
         mh_map_id, total_price, sniper_mh_sn_user_id, maptain_mh_sn_user_id
       ) VALUES (
         @sniperUserId, @maptainUserId, @mouseGroupId, @itemGroupId, @goalType,
         @mhMapId, @totalPrice, @sniperMhSnUserId, @maptainMhSnUserId
       ) RETURNING *`
    )
    .get({
      ...params,
      mouseGroupId: params.mouseGroupId ?? null,
      itemGroupId: params.itemGroupId ?? null,
    }) as SnipingTransactionRow;
}

export function addSnipingTransactionMouse(params: {
  transactionId: number;
  buyOrderId: number;
  sellOrderId: number;
  mouseTypeId: number;
  price: number;
}): SnipingTransactionMouseRow {
  return getDb()
    .prepare(
      `INSERT INTO sniping_transaction_mice (
         transaction_id, buy_order_id, sell_order_id, mouse_type_id, price
       ) VALUES (
         @transactionId, @buyOrderId, @sellOrderId, @mouseTypeId, @price
       ) RETURNING *`
    )
    .get(params) as SnipingTransactionMouseRow;
}

export function findSnipingTransactionById(
  id: number
): SnipingTransactionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM sniping_transactions WHERE id = ?")
    .get(id) as SnipingTransactionRow | undefined;
}

export function findSnipingTransactionMice(
  transactionId: number
): SnipingTransactionMouseRow[] {
  return getDb()
    .prepare("SELECT * FROM sniping_transaction_mice WHERE transaction_id = ?")
    .all(transactionId) as SnipingTransactionMouseRow[];
}

export function findSnipingTransactionMiceWithInfo(
  transactionId: number
): Array<SnipingTransactionMouseRow & { mouse_name: string; mouse_thumbnail: string | null }> {
  return getDb()
    .prepare(
      `SELECT stm.*, mt.name as mouse_name, mt.thumbnail as mouse_thumbnail
       FROM sniping_transaction_mice stm
       JOIN mouse_types mt ON mt.id = stm.mouse_type_id
       WHERE stm.transaction_id = ?`
    )
    .all(transactionId) as Array<SnipingTransactionMouseRow & { mouse_name: string; mouse_thumbnail: string | null }>;
}

export function findActiveSnipingTransactions(
  userId: number
): SnipingTransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM sniping_transactions
       WHERE (sniper_user_id = ? OR maptain_user_id = ?)
         AND state NOT IN ('completed', 'failed')
       ORDER BY created_at ASC`
    )
    .all(userId, userId) as SnipingTransactionRow[];
}

/**
 * Get the set of map IDs where a user has active (non-terminal) sniping transactions.
 * Used by the matcher to determine if a sniper is busy on a different map.
 */
export function findActiveSnipingMapIds(userId: number): Set<number> {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT mh_map_id FROM sniping_transactions
       WHERE sniper_user_id = ?
         AND state IN ('sniping', 'awaiting_payment', 'transferring', 'awaiting_leave')`
    )
    .all(userId) as Array<{ mh_map_id: number }>;
  return new Set(rows.map((r) => r.mh_map_id));
}

/**
 * Check if a sniper already has an active transaction on a specific map.
 * Used to skip the invite flow – sniper is already there.
 */
export function isSniperOnMap(
  sniperUserId: number,
  mhMapId: number,
  excludeTxnId: number
): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as cnt FROM sniping_transactions
       WHERE sniper_user_id = ? AND mh_map_id = ? AND id != ?
         AND state IN ('sniping', 'awaiting_payment', 'transferring', 'awaiting_leave')`
    )
    .get(sniperUserId, mhMapId, excludeTxnId) as { cnt: number };
  return row.cnt > 0;
}

/**
 * Find active sniping transactions where a user is the SNIPER on a specific map.
 * Only returns transactions in states where the sniper is expected to be on the map
 * (sniping, awaiting_payment, transferring, awaiting_leave).
 * Used by map presence tracking to detect sniper abandonment.
 */
export function findActiveSnipingTransactionsForSniperOnMap(
  sniperUserId: number,
  mhMapId: number
): SnipingTransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM sniping_transactions
       WHERE sniper_user_id = ? AND mh_map_id = ?
         AND state IN ('sniping', 'awaiting_payment', 'pending_payment', 'transferring', 'awaiting_leave')
       ORDER BY created_at ASC`
    )
    .all(sniperUserId, mhMapId) as SnipingTransactionRow[];
}

/**
 * Find ALL active sniping transactions where a user is the SNIPER (any map).
 * Used for positive assertion: verify sniper is actually on each transaction's map.
 */
export function findActiveSnipingTransactionsAsSniper(
  sniperUserId: number
): SnipingTransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM sniping_transactions
       WHERE sniper_user_id = ?
         AND state IN ('sniping', 'awaiting_payment', 'pending_payment', 'transferring', 'awaiting_leave')
       ORDER BY created_at ASC`
    )
    .all(sniperUserId) as SnipingTransactionRow[];
}

export function findPendingSnipingTransactions(): SnipingTransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM sniping_transactions
       WHERE state NOT IN ('completed', 'failed')
       ORDER BY created_at ASC`
    )
    .all() as SnipingTransactionRow[];
}

/**
 * Find sniping transactions in pending_payment state where a user is the MAPTAIN.
 * Used by resumePendingPayments() when the maptain comes back from AFK.
 */
export function findPendingSnipingTransactionsByMaptain(
  maptainUserId: number
): SnipingTransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM sniping_transactions
       WHERE maptain_user_id = ? AND state = 'pending_payment'
       ORDER BY created_at ASC`
    )
    .all(maptainUserId) as SnipingTransactionRow[];
}

export function updateSnipingTransactionState(
  id: number,
  state: SnipingTransactionState,
  failureReason?: string
): void {
  if (failureReason) {
    getDb()
      .prepare(
        `UPDATE sniping_transactions SET state = ?, failure_reason = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(state, failureReason, id);
  } else {
    getDb()
      .prepare(
        "UPDATE sniping_transactions SET state = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(state, id);
  }
}

export function markMouseCaught(
  transactionId: number,
  mouseTypeId: number
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE sniping_transaction_mice
       SET caught = 1, caught_at = datetime('now')
       WHERE transaction_id = ? AND mouse_type_id = ? AND caught = 0`
    )
    .run(transactionId, mouseTypeId);
  return result.changes > 0;
}

export function allMiceCaught(transactionId: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as uncaught
       FROM sniping_transaction_mice
       WHERE transaction_id = ? AND caught = 0`
    )
    .get(transactionId) as { uncaught: number };
  return row.uncaught === 0;
}

export function markMousePaid(
  transactionId: number,
  mouseTypeId: number
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE sniping_transaction_mice
       SET paid = 1, paid_at = datetime('now')
       WHERE transaction_id = ? AND mouse_type_id = ? AND paid = 0`
    )
    .run(transactionId, mouseTypeId);
  return result.changes > 0;
}

export function allCaughtMicePaid(transactionId: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as unpaid
       FROM sniping_transaction_mice
       WHERE transaction_id = ? AND caught = 1 AND paid = 0`
    )
    .get(transactionId) as { unpaid: number };
  return row.unpaid === 0;
}

export function recordSnipingPriceHistory(
  mouseTypeId: number,
  price: number
): void {
  getDb()
    .prepare(
      "INSERT INTO sniping_price_history (mouse_type_id, price) VALUES (?, ?)"
    )
    .run(mouseTypeId, price);
}

export function recordSnipingGroupPriceHistory(
  groupId: number,
  price: number
): void {
  getDb()
    .prepare(
      "INSERT INTO sniping_group_price_history (group_id, price) VALUES (?, ?)"
    )
    .run(groupId, price);
}

/**
 * On transaction completion, record all caught mice in price history.
 * Called by the orchestrator when a transaction completes.
 */
export function recordTransactionPriceHistory(transactionId: number): void {
  const mice = findSnipingTransactionMice(transactionId);
  const db = getDb();

  const insert = db.prepare(
    "INSERT INTO sniping_price_history (mouse_type_id, price) VALUES (?, ?)"
  );

  const recordAll = db.transaction(() => {
    for (const m of mice) {
      if (m.caught) {
        insert.run(m.mouse_type_id, m.price);
      }
    }
  });

  recordAll();
}

export function findSnipingTransactionsByUser(
  userId: number,
  limit = 50
): SnipingTransactionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM sniping_transactions
       WHERE (sniper_user_id = ? OR maptain_user_id = ?)
         AND state != 'failed'
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, userId, limit) as SnipingTransactionRow[];
}

export function addSnipingTransactionItem(params: {
  transactionId: number;
  buyOrderId: number;
  sellOrderId: number;
  itemTypeId: number;
  price: number;
}): SnipingTransactionItemRow {
  return getDb()
    .prepare(
      `INSERT INTO sniping_transaction_items (
         transaction_id, buy_order_id, sell_order_id, item_type_id, price
       ) VALUES (
         @transactionId, @buyOrderId, @sellOrderId, @itemTypeId, @price
       ) RETURNING *`
    )
    .get(params) as SnipingTransactionItemRow;
}

export function findSnipingTransactionItems(
  transactionId: number
): SnipingTransactionItemRow[] {
  return getDb()
    .prepare("SELECT * FROM sniping_transaction_items WHERE transaction_id = ?")
    .all(transactionId) as SnipingTransactionItemRow[];
}

export function findSnipingTransactionItemsWithInfo(
  transactionId: number
): Array<SnipingTransactionItemRow & { item_name: string; item_thumbnail: string | null }> {
  return getDb()
    .prepare(
      `SELECT sti.*, it.name as item_name, it.thumbnail as item_thumbnail
       FROM sniping_transaction_items sti
       JOIN item_types it ON it.id = sti.item_type_id
       WHERE sti.transaction_id = ?`
    )
    .all(transactionId) as Array<SnipingTransactionItemRow & { item_name: string; item_thumbnail: string | null }>;
}

export function markItemFound(
  transactionId: number,
  itemTypeId: number
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE sniping_transaction_items
       SET found = 1, found_at = datetime('now')
       WHERE transaction_id = ? AND item_type_id = ? AND found = 0`
    )
    .run(transactionId, itemTypeId);
  return result.changes > 0;
}

export function allItemsFound(transactionId: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as unfound
       FROM sniping_transaction_items
       WHERE transaction_id = ? AND found = 0`
    )
    .get(transactionId) as { unfound: number };
  return row.unfound === 0;
}

export function markItemPaid(
  transactionId: number,
  itemTypeId: number
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE sniping_transaction_items
       SET paid = 1, paid_at = datetime('now')
       WHERE transaction_id = ? AND item_type_id = ? AND paid = 0`
    )
    .run(transactionId, itemTypeId);
  return result.changes > 0;
}

export function allFoundItemsPaid(transactionId: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as unpaid
       FROM sniping_transaction_items
       WHERE transaction_id = ? AND found = 1 AND paid = 0`
    )
    .get(transactionId) as { unpaid: number };
  return row.unpaid === 0;
}

export function recordSnipingItemPriceHistory(
  itemTypeId: number,
  price: number
): void {
  getDb()
    .prepare(
      "INSERT INTO sniping_item_price_history (item_type_id, price) VALUES (?, ?)"
    )
    .run(itemTypeId, price);
}

export function recordSnipingItemGroupPriceHistory(
  itemGroupId: number,
  price: number
): void {
  getDb()
    .prepare(
      "INSERT INTO sniping_item_group_price_history (item_group_id, price) VALUES (?, ?)"
    )
    .run(itemGroupId, price);
}

/**
 * On item transaction completion, record all found items in price history.
 * Called by the orchestrator when an item sniping transaction completes.
 */
export function recordItemTransactionPriceHistory(transactionId: number): void {
  const items = findSnipingTransactionItems(transactionId);
  const db = getDb();

  const insert = db.prepare(
    "INSERT INTO sniping_item_price_history (item_type_id, price) VALUES (?, ?)"
  );

  const recordAll = db.transaction(() => {
    for (const item of items) {
      if (item.found) {
        insert.run(item.item_type_id, item.price);
      }
    }
  });

  recordAll();
}
