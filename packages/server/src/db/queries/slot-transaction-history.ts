import type { SlotOrderHistoryGroup } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoTxnFilter } from "../../demo/demo-mode.js";

export interface TransactionHistoryRow {
  order_id: number;
  side: "sell" | "buy";
  map_type_id: number;
  map_display_name: string;
  map_thumbnail: string | null;
  order_price: number;
  order_quantity: number;
  order_filled_quantity: number;
  order_status: string;
  txn_id: number;
  txn_price: number;
  counterparty_sn_user_id: string;
  txn_completed_at: string;
  txn_is_rt: number;
}

export interface TransactionHistoryPaginationOptions {
  /** 1-indexed page number. */
  page?: number;
  /** Orders per page. */
  perPage?: number;
}

export interface TransactionHistoryResult {
  rows: TransactionHistoryRow[];
  totalOrders: number;
}

/**
 * Fetch paginated transaction history rows for a user.
 * Pagination is by order (not transaction) - all transactions for an order are returned together.
 */
export function findTransactionHistoryByUser(
  userId: number,
  options: TransactionHistoryPaginationOptions = {}
): TransactionHistoryResult {
  const db = getDb();
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.max(1, Math.min(100, options.perPage ?? 25));
  const offset = (page - 1) * perPage;

  // Count total distinct orders with completed transactions
  const countRow = db
    .prepare(
      `SELECT COUNT(DISTINCT o.id) as total
       FROM orders o
       JOIN transactions t ON (
         (o.side = 'sell' AND t.sell_order_id = o.id)
         OR (o.side = 'buy' AND t.buy_order_id = o.id)
       )
       WHERE o.user_id = ?
         AND t.state = 'completed'
         AND o.filled_quantity > 0
         ${demoTxnFilter("t", "slots")}`
    )
    .get(userId) as { total: number };

  // Get order IDs for current page (sorted by most recent activity)
  const orderIds = db
    .prepare(
      `SELECT o.id, MAX(t.updated_at) as last_activity
       FROM orders o
       JOIN transactions t ON (
         (o.side = 'sell' AND t.sell_order_id = o.id)
         OR (o.side = 'buy' AND t.buy_order_id = o.id)
       )
       WHERE o.user_id = ?
         AND t.state = 'completed'
         AND o.filled_quantity > 0
         ${demoTxnFilter("t", "slots")}
       GROUP BY o.id
       ORDER BY last_activity DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, perPage, offset) as Array<{ id: number; last_activity: string }>;

  if (orderIds.length === 0) {
    return { rows: [], totalOrders: countRow.total };
  }

  // Fetch all transaction details for these orders
  const placeholders = orderIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT
         o.id              AS order_id,
         o.side            AS side,
         o.map_type_id     AS map_type_id,
         mt.display_name   AS map_display_name,
         mt.thumbnail      AS map_thumbnail,
         o.price           AS order_price,
         o.quantity         AS order_quantity,
         o.filled_quantity  AS order_filled_quantity,
         o.status           AS order_status,
         t.id              AS txn_id,
         t.price           AS txn_price,
         CASE o.side
           WHEN 'sell' THEN t.buyer_mh_sn_user_id
           ELSE t.seller_mh_sn_user_id
         END               AS counterparty_sn_user_id,
         t.updated_at      AS txn_completed_at,
         t.is_rt           AS txn_is_rt
       FROM orders o
       JOIN map_types mt ON mt.id = o.map_type_id
       JOIN transactions t ON (
         (o.side = 'sell' AND t.sell_order_id = o.id)
         OR (o.side = 'buy' AND t.buy_order_id = o.id)
       )
       WHERE o.id IN (${placeholders})
         AND t.state = 'completed'
       ORDER BY t.updated_at DESC`
    )
    .all(...orderIds.map((r) => r.id)) as TransactionHistoryRow[];

  return { rows, totalOrders: countRow.total };
}

export function groupTransactionHistory(
  rows: TransactionHistoryRow[]
): SlotOrderHistoryGroup[] {
  const groupMap = new Map<number, SlotOrderHistoryGroup>();

  // Collect RT transaction IDs to batch-query rt_pending_items
  const rtTxnIds: number[] = [];

  for (const row of rows) {
    let group = groupMap.get(row.order_id);
    if (!group) {
      group = {
        orderId: row.order_id,
        side: row.side,
        mapTypeId: row.map_type_id,
        mapDisplayName: row.map_display_name,
        mapThumbnail: row.map_thumbnail,
        price: row.order_price,
        quantity: row.order_quantity,
        filledQuantity: row.order_filled_quantity,
        orderStatus: row.order_status as SlotOrderHistoryGroup["orderStatus"],
        lastActivityAt: row.txn_completed_at,
        transactions: [],
      };
      groupMap.set(row.order_id, group);
    }

    const isRt = !!row.txn_is_rt;
    if (isRt) rtTxnIds.push(row.txn_id);

    group.transactions.push({
      id: row.txn_id,
      counterpartySnUserId: row.counterparty_sn_user_id,
      price: row.txn_price,
      completedAt: row.txn_completed_at,
      isRt,
    });
  }

  // Batch-fetch RT items for all RT transactions
  if (rtTxnIds.length > 0) {
    const placeholders = rtTxnIds.map(() => "?").join(", ");
    const rtItems = getDb()
      .prepare(
        `SELECT transaction_id, item_name, quantity
         FROM rt_pending_items
         WHERE transaction_id IN (${placeholders}) AND transferred = 1
         ORDER BY id ASC`
      )
      .all(...rtTxnIds) as Array<{ transaction_id: number; item_name: string; quantity: number }>;

    // Build a map of txnId -> items
    const itemsByTxn = new Map<number, Array<{ name: string; quantity: number }>>();
    for (const item of rtItems) {
      let list = itemsByTxn.get(item.transaction_id);
      if (!list) {
        list = [];
        itemsByTxn.set(item.transaction_id, list);
      }
      list.push({ name: item.item_name, quantity: item.quantity });
    }

    // Attach to transaction lines
    for (const group of groupMap.values()) {
      for (const txn of group.transactions) {
        if (txn.isRt) {
          txn.rtItems = itemsByTxn.get(txn.id);
        }
      }
    }
  }

  // Sort groups by most recent activity (first row per group is already newest)
  const groups = Array.from(groupMap.values());
  groups.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  return groups;
}
