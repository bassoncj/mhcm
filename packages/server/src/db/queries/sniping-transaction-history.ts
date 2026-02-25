import type { SnipingMapHistoryGroup, SnipingHistoryMouse, SnipingHistoryItem, GoalType } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoTxnFilter } from "../../demo/demo-mode.js";

interface MapRow {
  mh_map_id: number;
  role: "sniper" | "maptain";
  goal_type: string;
  last_activity: string;
}

interface TxnRow {
  mh_map_id: number;
  txn_id: number;
  total_price: number;
  state: string;
  counterparty_sn_user_id: string;
  failure_reason: string | null;
  completed_at: string;
}

interface MouseRow {
  txn_id: number;
  mouse_type_id: number;
  price: number;
  caught: number;
  caught_at: string | null;
  mouse_name: string;
  mouse_thumbnail: string | null;
}

interface ItemRow {
  txn_id: number;
  item_type_id: number;
  price: number;
  found: number;
  found_at: string | null;
  item_name: string;
  item_thumbnail: string | null;
}

/** Get paginated sniping transaction history for a user, grouped by map. */
export function findSnipingTransactionHistory(
  userId: number,
  options: { page?: number; perPage?: number } = {}
): { groups: SnipingMapHistoryGroup[]; totalMaps: number } {
  const db = getDb();
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.max(1, Math.min(100, options.perPage ?? 20));
  const offset = (page - 1) * perPage;

  // Count total distinct maps with completed/failed transactions for this user
  const countRow = db
    .prepare(
      `SELECT COUNT(DISTINCT st.mh_map_id) as total
       FROM sniping_transactions st
       WHERE (st.sniper_user_id = ? OR st.maptain_user_id = ?)
         AND st.state IN ('completed', 'failed')
         ${demoTxnFilter("st", "sniping")}`
    )
    .get(userId, userId) as { total: number };

  // Get map IDs for current page, sorted by most recent activity
  const mapRows = db
    .prepare(
      `SELECT
         st.mh_map_id,
         CASE WHEN st.sniper_user_id = ? THEN 'sniper' ELSE 'maptain' END AS role,
         MAX(st.goal_type) AS goal_type,
         MAX(st.updated_at) AS last_activity
       FROM sniping_transactions st
       WHERE (st.sniper_user_id = ? OR st.maptain_user_id = ?)
         AND st.state IN ('completed', 'failed')
         ${demoTxnFilter("st", "sniping")}
       GROUP BY st.mh_map_id
       ORDER BY last_activity DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, userId, userId, perPage, offset) as MapRow[];

  if (mapRows.length === 0) {
    return { groups: [], totalMaps: countRow.total };
  }

  // Fetch all transactions for these maps
  const mapIds = mapRows.map((r) => r.mh_map_id);
  const ph = mapIds.map(() => "?").join(", ");

  const txnRows = db
    .prepare(
      `SELECT
         st.mh_map_id,
         st.id AS txn_id,
         st.total_price,
         st.state,
         st.failure_reason,
         st.updated_at AS completed_at,
         CASE
           WHEN st.sniper_user_id = ? THEN st.maptain_mh_sn_user_id
           ELSE st.sniper_mh_sn_user_id
         END AS counterparty_sn_user_id
       FROM sniping_transactions st
       WHERE st.mh_map_id IN (${ph})
         AND (st.sniper_user_id = ? OR st.maptain_user_id = ?)
         AND st.state IN ('completed', 'failed')
         ${demoTxnFilter("st", "sniping")}
       ORDER BY st.updated_at DESC`
    )
    .all(userId, ...mapIds, userId, userId) as TxnRow[];

  // Fetch all mice and items for these transactions
  const txnIds = [...new Set(txnRows.map((r) => r.txn_id))];
  const miceByTxn = new Map<number, SnipingHistoryMouse[]>();
  const itemsByTxn = new Map<number, SnipingHistoryItem[]>();

  if (txnIds.length > 0) {
    const txnPh = txnIds.map(() => "?").join(", ");

    // Fetch mice
    const mouseRows = db
      .prepare(
        `SELECT stm.transaction_id AS txn_id,
                stm.mouse_type_id, stm.price, stm.caught, stm.caught_at,
                mt.name AS mouse_name, mt.thumbnail AS mouse_thumbnail
         FROM sniping_transaction_mice stm
         JOIN mouse_types mt ON mt.id = stm.mouse_type_id
         WHERE stm.transaction_id IN (${txnPh})`
      )
      .all(...txnIds) as MouseRow[];

    for (const row of mouseRows) {
      const mice = miceByTxn.get(row.txn_id) ?? [];
      mice.push({
        mouseTypeId: row.mouse_type_id,
        mouseName: row.mouse_name,
        mouseThumbnail: row.mouse_thumbnail,
        price: row.price,
        caught: row.caught === 1,
        ...(row.caught_at ? { caughtAt: row.caught_at } : {}),
      });
      miceByTxn.set(row.txn_id, mice);
    }

    // Fetch items
    const itemRows = db
      .prepare(
        `SELECT sti.transaction_id AS txn_id,
                sti.item_type_id, sti.price, sti.found, sti.found_at,
                it.name AS item_name, it.thumbnail AS item_thumbnail
         FROM sniping_transaction_items sti
         JOIN item_types it ON it.id = sti.item_type_id
         WHERE sti.transaction_id IN (${txnPh})`
      )
      .all(...txnIds) as ItemRow[];

    for (const row of itemRows) {
      const items = itemsByTxn.get(row.txn_id) ?? [];
      items.push({
        itemTypeId: row.item_type_id,
        itemName: row.item_name,
        itemThumbnail: row.item_thumbnail,
        price: row.price,
        found: row.found === 1,
        ...(row.found_at ? { foundAt: row.found_at } : {}),
      });
      itemsByTxn.set(row.txn_id, items);
    }
  }

  // Build map groups
  const groupMap = new Map<number, SnipingMapHistoryGroup>();

  for (const row of mapRows) {
    groupMap.set(row.mh_map_id, {
      mhMapId: row.mh_map_id,
      role: row.role,
      goalType: (row.goal_type ?? "mouse") as GoalType,
      totalGoals: 0,
      completedGoals: 0,
      totalSb: 0,
      lastActivityAt: row.last_activity,
      transactions: [],
    });
  }

  // Add transactions to their map groups
  for (const row of txnRows) {
    const group = groupMap.get(row.mh_map_id);
    if (!group) continue;

    const mice = miceByTxn.get(row.txn_id) ?? [];
    const items = itemsByTxn.get(row.txn_id) ?? [];

    group.transactions.push({
      id: row.txn_id,
      counterpartySnUserId: row.counterparty_sn_user_id,
      totalPrice: row.total_price,
      state: row.state as "completed" | "failed",
      ...(row.failure_reason ? { failureReason: row.failure_reason } : {}),
      mice,
      items,
      completedAt: row.completed_at,
    });

    // Accumulate totals from goals (mice or items)
    for (const mouse of mice) {
      group.totalGoals++;
      if (mouse.caught) group.completedGoals++;
    }
    for (const item of items) {
      group.totalGoals++;
      if (item.found) group.completedGoals++;
    }
    if (row.state === "completed") {
      group.totalSb += row.total_price;
    }
  }

  // Return in the same page order as mapRows
  const groups = mapIds
    .map((id) => groupMap.get(id))
    .filter((g): g is SnipingMapHistoryGroup => g != null);

  return { groups, totalMaps: countRow.total };
}
