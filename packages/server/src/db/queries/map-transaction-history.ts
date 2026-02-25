import type { MapOrderHistoryGroup, MapTransactionLine } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoTxnFilter } from "../../demo/demo-mode.js";

interface MapTxnHistoryRow {
  order_id: number;
  map_type_id: number;
  map_display_name: string;
  map_thumbnail: string | null;
  mode: "unopened" | "completed";
  side: "sell" | "buy";
  order_price: number;
  order_quantity: number;
  order_filled_quantity: number;
  order_status: "open" | "partially_filled" | "filled" | "cancelled";
  order_tier: "S" | "A" | "B" | null;
  order_created_at: string;
  txn_id: number;
  txn_price: number;
  txn_quantity: number;
  txn_state: string;
  txn_failure_reason: string | null;
  txn_completed_at: string | null;
  counterparty_sn_user_id: string;
}

/** Get paginated map transaction history for a user, grouped by order. */
export function getMapTransactionHistory(
  userId: number,
  opts: { page: number; perPage: number } = { page: 1, perPage: 20 }
): { groups: MapOrderHistoryGroup[]; page: number; totalPages: number; totalOrders: number } {
  const db = getDb();
  const { page, perPage } = opts;
  const offset = (page - 1) * perPage;

  // Count total distinct orders with transactions (completed or failed)
  const countRow = db
    .prepare(
      `SELECT COUNT(DISTINCT o.id) as total
       FROM map_orders o
       JOIN map_transactions t ON (
         (o.side = 'sell' AND t.sell_order_id = o.id)
         OR (o.side = 'buy' AND t.buy_order_id = o.id)
       )
       WHERE o.user_id = ?
         AND t.state IN ('completed', 'failed')
         AND o.filled_quantity > 0
         ${demoTxnFilter("t", "maps")}`
    )
    .get(userId) as { total: number };

  const totalOrders = countRow.total;
  const totalPages = Math.ceil(totalOrders / perPage);

  // Get order IDs for current page (sorted by most recent activity)
  const orderIds = db
    .prepare(
      `SELECT o.id, MAX(t.updated_at) as last_activity
       FROM map_orders o
       JOIN map_transactions t ON (
         (o.side = 'sell' AND t.sell_order_id = o.id)
         OR (o.side = 'buy' AND t.buy_order_id = o.id)
       )
       WHERE o.user_id = ?
         AND t.state IN ('completed', 'failed')
         AND o.filled_quantity > 0
         ${demoTxnFilter("t", "maps")}
       GROUP BY o.id
       ORDER BY last_activity DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, perPage, offset) as Array<{ id: number; last_activity: string }>;

  if (orderIds.length === 0) {
    return { groups: [], page, totalPages, totalOrders };
  }

  // Fetch all transaction details for these orders
  const placeholders = orderIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT
         o.id                AS order_id,
         o.map_type_id       AS map_type_id,
         mt.display_name     AS map_display_name,
         mt.thumbnail        AS map_thumbnail,
         o.mode              AS mode,
         o.side              AS side,
         o.price             AS order_price,
         o.quantity          AS order_quantity,
         o.filled_quantity   AS order_filled_quantity,
         o.status            AS order_status,
         o.tier              AS order_tier,
         o.created_at        AS order_created_at,
         t.id                AS txn_id,
         t.price             AS txn_price,
         t.quantity          AS txn_quantity,
         t.state             AS txn_state,
         t.failure_reason    AS txn_failure_reason,
         t.updated_at        AS txn_completed_at,
         CASE o.side
           WHEN 'sell' THEN t.buyer_mh_sn_user_id
           ELSE t.seller_mh_sn_user_id
         END                 AS counterparty_sn_user_id
       FROM map_orders o
       JOIN map_types mt ON mt.id = o.map_type_id
       JOIN map_transactions t ON (
         (o.side = 'sell' AND t.sell_order_id = o.id)
         OR (o.side = 'buy' AND t.buy_order_id = o.id)
       )
       WHERE o.id IN (${placeholders})
         AND t.state IN ('completed', 'failed')
         ${demoTxnFilter("t", "maps")}
       ORDER BY t.updated_at DESC`
    )
    .all(...orderIds.map((r) => r.id)) as MapTxnHistoryRow[];

  // Group by order
  const groupMap = new Map<number, MapOrderHistoryGroup>();

  for (const row of rows) {
    let group = groupMap.get(row.order_id);
    if (!group) {
      group = {
        orderId: row.order_id,
        mapTypeId: row.map_type_id,
        mapDisplayName: row.map_display_name,
        mapThumbnail: row.map_thumbnail,
        mode: row.mode,
        side: row.side,
        price: row.order_price,
        quantity: row.order_quantity,
        filledQuantity: row.order_filled_quantity,
        status: row.order_status,
        tier: row.order_tier,
        createdAt: row.order_created_at,
        transactions: [],
      };
      groupMap.set(row.order_id, group);
    }

    group.transactions.push({
      transactionId: row.txn_id,
      counterpartySnUserId: row.counterparty_sn_user_id,
      price: row.txn_price,
      quantity: row.txn_quantity,
      completedAt: row.txn_completed_at,
      state: row.txn_state as any, // Cast to MapTransactionState
      failureReason: row.txn_failure_reason,
    });
  }

  // Return in the same page order as orderIds
  const groups = orderIds
    .map((o) => groupMap.get(o.id))
    .filter((g): g is MapOrderHistoryGroup => g != null);

  return { groups, page, totalPages, totalOrders };
}
