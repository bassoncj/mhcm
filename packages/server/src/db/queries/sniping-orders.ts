import type { SnipingOrderSide, SnipingOrderStatus, SnipingTarget } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoOrderFilter, demoTxnFilter } from "../../demo/demo-mode.js";

export interface SnipingOrderRow {
  id: number;
  user_id: number;
  mouse_type_id: number | null;
  mouse_group_id: number | null;
  item_type_id: number | null;
  item_group_id: number | null;
  goal_type: string;
  side: SnipingOrderSide;
  price: number;
  status: SnipingOrderStatus;
  mh_map_id: number | null;
  map_class: string | null;
  min_rank_id: number | null;
  paused_at: string | null;
  paused_reason: string | null;
  created_at: string;
  updated_at: string;
  priority_at: string;
}

function targetWhere(target: SnipingTarget): { col: string; val: number } {
  if (target.mouseGroupId != null) return { col: "mouse_group_id", val: target.mouseGroupId };
  if (target.itemTypeId != null) return { col: "item_type_id", val: target.itemTypeId };
  if (target.itemGroupId != null) return { col: "item_group_id", val: target.itemGroupId };
  return { col: "mouse_type_id", val: target.mouseTypeId! };
}

function rowToTarget(r: {
  mouse_type_id: number | null;
  mouse_group_id: number | null;
  item_type_id: number | null;
  item_group_id: number | null;
}): SnipingTarget {
  if (r.mouse_group_id != null) return { mouseGroupId: r.mouse_group_id };
  if (r.item_type_id != null) return { itemTypeId: r.item_type_id };
  if (r.item_group_id != null) return { itemGroupId: r.item_group_id };
  return { mouseTypeId: r.mouse_type_id! };
}

export function createSnipingOrder(params: {
  userId: number;
  mouseTypeId?: number;
  mouseGroupId?: number;
  itemTypeId?: number;
  itemGroupId?: number;
  goalType: string;
  side: SnipingOrderSide;
  price: number;
  mhMapId?: number;
  mapClass?: string;
  minRankId?: number;
}): SnipingOrderRow {
  return getDb()
    .prepare(
      `INSERT INTO sniping_orders (user_id, mouse_type_id, mouse_group_id, item_type_id, item_group_id, goal_type, side, price, mh_map_id, map_class, min_rank_id)
       VALUES (@userId, @mouseTypeId, @mouseGroupId, @itemTypeId, @itemGroupId, @goalType, @side, @price, @mhMapId, @mapClass, @minRankId)
       RETURNING *`
    )
    .get({
      ...params,
      mouseTypeId: params.mouseTypeId ?? null,
      mouseGroupId: params.mouseGroupId ?? null,
      itemTypeId: params.itemTypeId ?? null,
      itemGroupId: params.itemGroupId ?? null,
      mhMapId: params.mhMapId ?? null,
      mapClass: params.mapClass ?? null,
      minRankId: params.minRankId ?? null,
    }) as SnipingOrderRow;
}

export function findSnipingOrderById(id: number): SnipingOrderRow | undefined {
  return getDb()
    .prepare("SELECT * FROM sniping_orders WHERE id = ?")
    .get(id) as SnipingOrderRow | undefined;
}

export function findSnipingOrdersByUser(
  userId: number,
  statuses: SnipingOrderStatus[] = ["open", "paused"]
): SnipingOrderRow[] {
  const placeholders = statuses.map(() => "?").join(", ");
  return getDb()
    .prepare(
      `SELECT * FROM sniping_orders
       WHERE user_id = ? AND status IN (${placeholders})${demoOrderFilter("sniping_orders", "sniping")}
       ORDER BY created_at DESC`
    )
    .all(userId, ...statuses) as SnipingOrderRow[];
}

export function cancelSnipingOrder(orderId: number, userId: number): boolean {
  const result = getDb()
    .prepare(
      `UPDATE sniping_orders SET status = 'cancelled', updated_at = datetime('now')
       WHERE id = ? AND user_id = ? AND status IN ('open', 'paused')`
    )
    .run(orderId, userId);
  return result.changes > 0;
}

export function getSnipingOrderBookLevels(
  target: SnipingTarget,
  side: SnipingOrderSide
): Array<{ price: number; quantity: number }> {
  const { col, val } = targetWhere(target);
  const priceOrder = side === "sniper_sell" ? "ASC" : "DESC";
  return getDb()
    .prepare(
      `SELECT price, COUNT(*) as quantity
       FROM sniping_orders
       WHERE ${col} = ? AND side = ? AND status = 'open'${demoOrderFilter("sniping_orders", "sniping")}
       GROUP BY price
       ORDER BY price ${priceOrder}`
    )
    .all(val, side) as Array<{ price: number; quantity: number }>;
}

export function findBestSnipingMatch(
  mouseTypeId: number,
  side: SnipingOrderSide
): SnipingOrderRow | undefined {
  // If placing a sell, find best buy (highest price); if placing a buy, find best sell (lowest price)
  const oppositeSide: SnipingOrderSide = side === "sniper_sell" ? "sniper_buy" : "sniper_sell";
  const priceOrder = side === "sniper_sell" ? "DESC" : "ASC";

  return getDb()
    .prepare(
      `SELECT * FROM sniping_orders
       WHERE mouse_type_id = ? AND side = ? AND status = 'open'
       ORDER BY price ${priceOrder}, priority_at ASC
       LIMIT 1`
    )
    .get(mouseTypeId, oppositeSide) as SnipingOrderRow | undefined;
}

export function findOpenBuyOrders(
  target: SnipingTarget,
  maxPrice?: number
): SnipingOrderRow[] {
  const { col, val } = targetWhere(target);
  if (maxPrice !== undefined) {
    return getDb()
      .prepare(
        `SELECT * FROM sniping_orders
         WHERE ${col} = ? AND side = 'sniper_buy' AND status = 'open'
           AND price >= ? AND is_demo = 0
         ORDER BY price DESC, priority_at ASC`
      )
      .all(val, maxPrice) as SnipingOrderRow[];
  }
  return getDb()
    .prepare(
      `SELECT * FROM sniping_orders
       WHERE ${col} = ? AND side = 'sniper_buy' AND status = 'open'
         AND is_demo = 0
       ORDER BY price DESC, priority_at ASC`
    )
    .all(val) as SnipingOrderRow[];
}

export function findOpenSellOrders(
  target: SnipingTarget,
  maxPrice?: number
): SnipingOrderRow[] {
  const { col, val } = targetWhere(target);
  if (maxPrice !== undefined) {
    return getDb()
      .prepare(
        `SELECT * FROM sniping_orders
         WHERE ${col} = ? AND side = 'sniper_sell' AND status = 'open'
           AND price <= ? AND is_demo = 0
         ORDER BY price ASC, priority_at ASC`
      )
      .all(val, maxPrice) as SnipingOrderRow[];
  }
  return getDb()
    .prepare(
      `SELECT * FROM sniping_orders
       WHERE ${col} = ? AND side = 'sniper_sell' AND status = 'open'
         AND is_demo = 0
       ORDER BY price ASC, priority_at ASC`
    )
    .all(val) as SnipingOrderRow[];
}

export function updateSnipingOrderStatus(
  orderId: number,
  status: SnipingOrderStatus,
  pausedReason?: string
): void {
  if (status === "paused" && pausedReason) {
    getDb()
      .prepare(
        `UPDATE sniping_orders SET status = 'paused', paused_at = datetime('now'),
         paused_reason = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(pausedReason, orderId);
  } else {
    getDb()
      .prepare(
        `UPDATE sniping_orders SET status = ?, paused_at = NULL, paused_reason = NULL,
         updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(status, orderId);
  }
}

export function findPendingSnipingOrderTargets(userId: number): SnipingTarget[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT mouse_type_id, mouse_group_id, item_type_id, item_group_id FROM sniping_orders
       WHERE user_id = ? AND status = 'open'`
    )
    .all(userId) as Array<{ mouse_type_id: number | null; mouse_group_id: number | null; item_type_id: number | null; item_group_id: number | null }>;

  return rows.map(rowToTarget);
}

export function findPendingSnipingSellTargets(userId: number): SnipingTarget[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT mouse_type_id, mouse_group_id, item_type_id, item_group_id FROM sniping_orders
       WHERE user_id = ? AND side = 'sniper_sell' AND status IN ('open', 'paused')`
    )
    .all(userId) as Array<{ mouse_type_id: number | null; mouse_group_id: number | null; item_type_id: number | null; item_group_id: number | null }>;

  return rows.map(rowToTarget);
}

export function findAllOpenSnipingOrderTargets(): SnipingTarget[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT mouse_type_id, mouse_group_id, item_type_id, item_group_id FROM sniping_orders
       WHERE status = 'open'`
    )
    .all() as Array<{ mouse_type_id: number | null; mouse_group_id: number | null; item_type_id: number | null; item_group_id: number | null }>;

  return rows.map(rowToTarget);
}

export function deprioritizeSnipingOrder(orderId: number): void {
  getDb()
    .prepare(
      "UPDATE sniping_orders SET priority_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    )
    .run(orderId);
}

/**
 * Get a price suggestion for a target from seed data + live history.
 * For mouse targets: queries sniping_price_history + sniping_price_seeds.
 * For group targets: queries sniping_group_price_history (no seeds).
 */
export function getSnipingPriceSuggestion(
  target: SnipingTarget
): { avg7d: number | null; avg30d: number | null } {
  const db = getDb();

  if (target.mouseGroupId != null) {
    // Mouse group target – query group price history only (no seed data)
    return queryAvgPriceHistory(db, "sniping_group_price_history", "group_id", target.mouseGroupId);
  }

  if (target.itemGroupId != null) {
    // Item group target – query item group price history (no seed data)
    return queryAvgPriceHistory(db, "sniping_item_group_price_history", "item_group_id", target.itemGroupId);
  }

  if (target.itemTypeId != null) {
    // Item target – query item price history (no seed data for items)
    return queryAvgPriceHistory(db, "sniping_item_price_history", "item_type_id", target.itemTypeId);
  }

  // Mouse target – try live price history first
  const mouseTypeId = target.mouseTypeId!;

  const liveResult = queryAvgPriceHistory(db, "sniping_price_history", "mouse_type_id", mouseTypeId);
  if (liveResult.avg7d || liveResult.avg30d) {
    return liveResult;
  }

  // Fall back to seed data (Discord-imported prices)
  const seedRow = db
    .prepare(
      `SELECT AVG(price) as avg_price
       FROM sniping_price_seeds
       WHERE mouse_type_id = ?`
    )
    .get(mouseTypeId) as { avg_price: number | null };

  const seedAvg = seedRow.avg_price ? Math.round(seedRow.avg_price) : null;
  return { avg7d: null, avg30d: seedAvg };
}

function queryAvgPriceHistory(
  db: ReturnType<typeof getDb>,
  table: string,
  idCol: string,
  idVal: number
): { avg7d: number | null; avg30d: number | null } {
  const row = db
    .prepare(
      `SELECT
         AVG(CASE WHEN DATE(completed_at) >= DATE('now', '-7 days') THEN price END) as avg_7d,
         AVG(CASE WHEN DATE(completed_at) >= DATE('now', '-30 days') THEN price END) as avg_30d
       FROM ${table}
       WHERE ${idCol} = ?
         AND DATE(completed_at) >= DATE('now', '-30 days')${demoTxnFilter(table, "sniping")}`
    )
    .get(idVal) as { avg_7d: number | null; avg_30d: number | null };

  return {
    avg7d: row.avg_7d ? Math.round(row.avg_7d) : null,
    avg30d: row.avg_30d ? Math.round(row.avg_30d) : null,
  };
}

/**
 * Check if a user has conflicting individual orders for any of the given mice.
 * Used when creating a group order – ensures no overlapping individual orders.
 */
export function hasConflictingIndividualOrders(
  userId: number,
  side: SnipingOrderSide,
  mouseTypeIds: number[]
): boolean {
  if (mouseTypeIds.length === 0) return false;

  const placeholders = mouseTypeIds.map(() => "?").join(",");
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as cnt FROM sniping_orders
       WHERE user_id = ? AND side = ? AND mouse_type_id IN (${placeholders})
         AND mouse_group_id IS NULL
         AND status IN ('open', 'matched', 'in_progress')`
    )
    .get(userId, side, ...mouseTypeIds) as { cnt: number };

  return row.cnt > 0;
}

/**
 * Check if a user has conflicting group orders containing a given mouse.
 * Used when creating an individual order – ensures no overlapping group orders.
 */
export function hasConflictingGroupOrders(
  userId: number,
  side: SnipingOrderSide,
  mouseTypeId: number
): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as cnt FROM sniping_orders so
       JOIN sniping_mouse_group_members gm ON gm.group_id = so.mouse_group_id
       WHERE so.user_id = ? AND so.side = ? AND gm.mouse_type_id = ?
         AND so.status IN ('open', 'matched', 'in_progress')`
    )
    .get(userId, side, mouseTypeId) as { cnt: number };

  return row.cnt > 0;
}

/**
 * Check if a user has conflicting individual item orders for any of the given items.
 * Used when creating an item group order.
 */
export function hasConflictingItemIndividualOrders(
  userId: number,
  side: SnipingOrderSide,
  itemTypeIds: number[]
): boolean {
  if (itemTypeIds.length === 0) return false;

  const placeholders = itemTypeIds.map(() => "?").join(",");
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as cnt FROM sniping_orders
       WHERE user_id = ? AND side = ? AND item_type_id IN (${placeholders})
         AND item_group_id IS NULL
         AND status IN ('open', 'matched', 'in_progress')`
    )
    .get(userId, side, ...itemTypeIds) as { cnt: number };

  return row.cnt > 0;
}

/**
 * Check if a user has conflicting item group orders containing a given item.
 * Used when creating an individual item order.
 */
export function hasConflictingItemGroupOrders(
  userId: number,
  side: SnipingOrderSide,
  itemTypeId: number
): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as cnt FROM sniping_orders so
       JOIN sniping_item_group_members gm ON gm.group_id = so.item_group_id
       WHERE so.user_id = ? AND so.side = ? AND gm.item_type_id = ?
         AND so.status IN ('open', 'matched', 'in_progress')`
    )
    .get(userId, side, itemTypeId) as { cnt: number };

  return row.cnt > 0;
}
