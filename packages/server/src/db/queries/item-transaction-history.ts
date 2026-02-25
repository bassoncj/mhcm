import type { ItemOrderHistoryGroup } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoTxnFilter } from "../../demo/demo-mode.js";

interface ItemTxnHistoryRow {
  order_id: number;
  side: "sell" | "buy";
  item_type_id: number;
  item_name: string;
  item_thumbnail: string | null;
  order_price: number;
  order_quantity: number;
  order_filled_quantity: number;
  order_status: "open" | "partially_filled" | "filled" | "cancelled";
  txn_id: number;
  txn_price: number;
  txn_quantity: number;
  counterparty_sn_user_id: string;
  txn_completed_at: string;
}

/** Get paginated item transaction history for a user, grouped by order. */
export function getItemTransactionHistory(
  userId: number,
  opts: { page: number; perPage: number } = { page: 1, perPage: 20 }
): { groups: ItemOrderHistoryGroup[]; totalOrders: number } {
  const db = getDb();
  const { page, perPage } = opts;
  const offset = (page - 1) * perPage;

  // Count total distinct orders with completed transactions
  const countRow = db
    .prepare(
      `SELECT COUNT(DISTINCT o.id) as total
       FROM item_orders o
       JOIN item_transactions t ON (
         (o.side = 'sell' AND t.sell_order_id = o.id)
         OR (o.side = 'buy' AND t.buy_order_id = o.id)
       )
       WHERE o.user_id = ?
         AND t.state = 'completed'
         AND o.filled_quantity > 0
         ${demoTxnFilter("t", "items")}`
    )
    .get(userId) as { total: number };

  // Get order IDs for current page (sorted by most recent activity)
  const orderIds = db
    .prepare(
      `SELECT o.id, MAX(t.updated_at) as last_activity
       FROM item_orders o
       JOIN item_transactions t ON (
         (o.side = 'sell' AND t.sell_order_id = o.id)
         OR (o.side = 'buy' AND t.buy_order_id = o.id)
       )
       WHERE o.user_id = ?
         AND t.state = 'completed'
         AND o.filled_quantity > 0
         ${demoTxnFilter("t", "items")}
       GROUP BY o.id
       ORDER BY last_activity DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, perPage, offset) as Array<{ id: number; last_activity: string }>;

  if (orderIds.length === 0) {
    return { groups: [], totalOrders: countRow.total };
  }

  // Fetch all transaction details for these orders
  const placeholders = orderIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT
         o.id              AS order_id,
         o.side            AS side,
         o.item_type_id    AS item_type_id,
         it.name           AS item_name,
         it.thumbnail      AS item_thumbnail,
         o.price           AS order_price,
         o.quantity         AS order_quantity,
         o.filled_quantity  AS order_filled_quantity,
         o.status           AS order_status,
         t.id              AS txn_id,
         t.price           AS txn_price,
         t.quantity         AS txn_quantity,
         CASE o.side
           WHEN 'sell' THEN t.buyer_mh_sn_user_id
           ELSE t.seller_mh_sn_user_id
         END               AS counterparty_sn_user_id,
         t.updated_at      AS txn_completed_at
       FROM item_orders o
       JOIN item_types it ON it.id = o.item_type_id
       JOIN item_transactions t ON (
         (o.side = 'sell' AND t.sell_order_id = o.id)
         OR (o.side = 'buy' AND t.buy_order_id = o.id)
       )
       WHERE o.id IN (${placeholders})
         AND t.state = 'completed'
         ${demoTxnFilter("t", "items")}
       ORDER BY t.updated_at DESC`
    )
    .all(...orderIds.map((r) => r.id)) as ItemTxnHistoryRow[];

  // Group by order
  const groupMap = new Map<number, ItemOrderHistoryGroup>();

  for (const row of rows) {
    let group = groupMap.get(row.order_id);
    if (!group) {
      group = {
        orderId: row.order_id,
        side: row.side,
        itemTypeId: row.item_type_id,
        itemName: row.item_name,
        itemThumbnail: row.item_thumbnail,
        price: row.order_price,
        quantity: row.order_quantity,
        filledQuantity: row.order_filled_quantity,
        orderStatus: row.order_status,
        lastActivityAt: row.txn_completed_at,
        transactions: [],
      };
      groupMap.set(row.order_id, group);
    }

    group.transactions.push({
      id: row.txn_id,
      counterpartySnUserId: row.counterparty_sn_user_id,
      price: row.txn_price,
      quantity: row.txn_quantity,
      completedAt: row.txn_completed_at,
    });
  }

  // Return in the same page order as orderIds
  const groups = orderIds
    .map((o) => groupMap.get(o.id))
    .filter((g): g is ItemOrderHistoryGroup => g != null);

  return { groups, totalOrders: countRow.total };
}
