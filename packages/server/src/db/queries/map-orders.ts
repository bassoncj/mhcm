import type { MapOrderMode, MapOrderSide, MapOrderStatus, MHMapClass } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoOrderFilter } from "../../demo/demo-mode.js";
import { getUserActiveMaps, isMapsUnreported, isUserOnMapClass } from "../../ws/connections.js";

export interface MapOrderRow {
  id: number;
  user_id: number;
  map_type_id: number;
  mode: MapOrderMode;
  side: MapOrderSide;
  price: number;
  quantity: number;
  filled_quantity: number;
  status: MapOrderStatus;
  close_reason: string | null;
  mh_map_id: number | null;
  tier: "S" | "A" | "B" | null;
  accepted_tiers: string | null; // JSON-encoded array
  remaining_goals: string | null;
  priority_at: string;
  created_at: string;
  updated_at: string;
}

export function findMapOrderById(id: number): MapOrderRow | undefined {
  return getDb()
    .prepare("SELECT * FROM map_orders WHERE id = ?")
    .get(id) as MapOrderRow | undefined;
}

export function createMapOrder(params: {
  userId: number;
  mapTypeId: number;
  mode: MapOrderMode;
  side: MapOrderSide;
  price: number;
  quantity: number;
  mhMapId?: number;
  tier?: "S" | "A" | "B";
  acceptedTiers?: string; // JSON string
  remainingGoals?: string; // JSON string
}): MapOrderRow {
  const { userId, mapTypeId, mode, side, price, quantity, mhMapId, tier, acceptedTiers, remainingGoals } = params;

  return getDb()
    .prepare(
      `INSERT INTO map_orders
       (user_id, map_type_id, mode, side, price, quantity, mh_map_id, tier, accepted_tiers, remaining_goals)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .get(userId, mapTypeId, mode, side, price, quantity, mhMapId ?? null, tier ?? null, acceptedTiers ?? null, remainingGoals ?? null) as MapOrderRow;
}

export function cancelMapOrder(orderId: number, userId: number): MapOrderRow | undefined {
  const result = getDb()
    .prepare(
      `UPDATE map_orders SET status = 'cancelled', updated_at = datetime('now')
       WHERE id = ? AND user_id = ? AND status IN ('open', 'partially_filled')
       RETURNING *`
    )
    .get(orderId, userId);

  return result as MapOrderRow | undefined;
}

export function adjustMapOrder(
  orderId: number,
  userId: number,
  newPrice?: number,
  newQuantity?: number
): MapOrderRow | undefined {
  const order = getDb()
    .prepare("SELECT * FROM map_orders WHERE id = ?")
    .get(orderId) as MapOrderRow | undefined;

  if (!order || order.user_id !== userId) return undefined;
  if (order.status !== "open" && order.status !== "partially_filled") return undefined;

  const price = newPrice ?? order.price;
  const quantity = newQuantity ?? order.quantity;

  // Validate new quantity
  if (quantity < order.filled_quantity) return undefined;

  // Price change resets time priority
  const priceChanged = newPrice != null && newPrice !== order.price;

  if (priceChanged) {
    return getDb()
      .prepare(
        `UPDATE map_orders SET price = ?, quantity = ?,
         priority_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?
         RETURNING *`
      )
      .get(price, quantity, orderId) as MapOrderRow;
  } else {
    return getDb()
      .prepare(
        `UPDATE map_orders SET price = ?, quantity = ?, updated_at = datetime('now')
         WHERE id = ?
         RETURNING *`
      )
      .get(price, quantity, orderId) as MapOrderRow;
  }
}

export function closeMapOrderWithReason(orderId: number, reason: string): void {
  getDb()
    .prepare(
      `UPDATE map_orders SET status = 'cancelled', close_reason = ?,
       updated_at = datetime('now')
       WHERE id = ? AND status IN ('open', 'partially_filled')`
    )
    .run(reason, orderId);
}

/**
 * Find best sell order: lowest price, oldest priority.
 * Excludes offline, AFK, suspended users, and disabled map types.
 * COMPLETED MODE ONLY: excludes busyBuyerIds to prevent self-match on same map.
 */
export function findBestMapSellOrder(
  mapTypeId: number,
  mode: MapOrderMode,
  onlineUserIds: ReadonlySet<number>,
  afkUserIds: ReadonlySet<number>,
  busyBuyerIds?: ReadonlySet<number>,
  invalidSettingsUserIds?: ReadonlySet<number>,
  mapClass?: MHMapClass | null
): MapOrderRow | undefined {
  const enabledCol = mode === "unopened" ? "mt.enabled_unopened" : "mt.enabled_complete";
  const rows = getDb()
    .prepare(
      `SELECT o.* FROM map_orders o
       JOIN map_types mt ON mt.id = o.map_type_id
       WHERE o.map_type_id = ? AND o.mode = ? AND o.side = 'sell'
         AND o.status IN ('open', 'partially_filled')
         AND o.is_demo = 0
         AND ${enabledCol} = 1
         AND o.user_id NOT IN (SELECT id FROM users WHERE status = 'suspended')
       ORDER BY o.price ASC, o.priority_at ASC`
    )
    .all(mapTypeId, mode) as MapOrderRow[];

  // Filter to online, non-AFK, non-busy, valid-settings, and (for unopened) not-on-a-map users
  for (const row of rows) {
    if (!onlineUserIds.has(row.user_id)) continue;
    if (afkUserIds.has(row.user_id)) continue;
    if (invalidSettingsUserIds?.has(row.user_id)) continue;
    // Completed mode: exclude busyBuyerIds (seller who's already a buyer in another txn)
    if (busyBuyerIds && busyBuyerIds.has(row.user_id)) continue;
    // Unopened: seller must not be on a map of the same class (can't open scroll while on that class)
    // Also skip if map state unknown (just connected, haven't reported yet)
    if (mode === "unopened") {
      if (isMapsUnreported(row.user_id)) continue;
      if (getUserActiveMaps(row.user_id).size > 0) {
        if (!mapClass) continue;                                    // NULL class → block-all (no regression)
        if (isUserOnMapClass(row.user_id, mapClass)) continue;     // known class → same-class only
      }
    }
    return row;
  }
  return undefined;
}

/**
 * Find candidate buy orders: highest price, oldest priority.
 * COMPLETED MODE: tier matching via SQL `(accepted_tiers IS NULL OR accepted_tiers LIKE '%"tier"%')`.
 * Excludes busyBuyerIds and users on active maps (can't accept invite while on a map).
 * Returns list for self-trade skipping in the matcher.
 */
export function findCandidateMapBuyOrders(
  mapTypeId: number,
  mode: MapOrderMode,
  maxPrice: number,
  sellTier: "S" | "A" | "B" | null,
  onlineUserIds: ReadonlySet<number>,
  afkUserIds: ReadonlySet<number>,
  busyBuyerIds?: ReadonlySet<number>,
  invalidSettingsUserIds?: ReadonlySet<number>,
  mapClass?: MHMapClass | null
): MapOrderRow[] {
  // Build tier matching SQL for completed mode
  const hasTierFilter = mode === "completed" && sellTier;
  const tierSql = hasTierFilter
    ? ` AND (o.accepted_tiers IS NULL OR o.accepted_tiers LIKE ?)`
    : "";

  const params: (number | string)[] = [mapTypeId, mode, maxPrice];
  if (hasTierFilter) params.push(`%"${sellTier}"%`);

  const enabledColBuy = mode === "unopened" ? "mt.enabled_unopened" : "mt.enabled_complete";
  const rows = getDb()
    .prepare(
      `SELECT o.* FROM map_orders o
       JOIN map_types mt ON mt.id = o.map_type_id
       WHERE o.map_type_id = ? AND o.mode = ? AND o.side = 'buy'
         AND o.status IN ('open', 'partially_filled')
         AND o.price >= ?
         AND o.is_demo = 0
         AND ${enabledColBuy} = 1
         AND o.user_id NOT IN (SELECT id FROM users WHERE status = 'suspended')
         ${tierSql}
       ORDER BY o.price DESC, o.priority_at ASC`
    )
    .all(...params) as MapOrderRow[];

  // Filter to online, non-AFK, non-busy, valid-settings, and not-on-a-map buyers
  return rows.filter((r) => {
    if (!onlineUserIds.has(r.user_id)) return false;
    if (afkUserIds.has(r.user_id)) return false;
    if (invalidSettingsUserIds?.has(r.user_id)) return false;
    if (busyBuyerIds && busyBuyerIds.has(r.user_id)) return false;
    // Buyer must not be on a map of the same class (can't accept invite while on that class)
    // Also skip if map state unknown (just connected, haven't reported yet)
    if (isMapsUnreported(r.user_id)) return false;
    if (getUserActiveMaps(r.user_id).size > 0) {
      if (!mapClass) return false;                                  // NULL class → block-all (no regression)
      if (isUserOnMapClass(r.user_id, mapClass)) return false;     // known class → same-class only
    }
    return true;
  });
}

export function updateMapOrderFill(
  orderId: number,
  additionalFilled: number
): void {
  getDb()
    .prepare(
      `UPDATE map_orders SET
         filled_quantity = filled_quantity + ?,
         status = CASE
           WHEN filled_quantity + ? >= quantity THEN 'filled'
           ELSE 'partially_filled'
         END,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(additionalFilled, additionalFilled, orderId);
}

export function reverseMapOrderFill(
  orderId: number,
  reversedQty: number
): void {
  getDb()
    .prepare(
      `UPDATE map_orders SET
         filled_quantity = MAX(0, filled_quantity - ?),
         status = CASE
           WHEN MAX(0, filled_quantity - ?) = 0 THEN 'open'
           ELSE 'partially_filled'
         END,
         updated_at = datetime('now')
       WHERE id = ? AND status IN ('partially_filled', 'filled')`
    )
    .run(reversedQty, reversedQty, orderId);
}

export function deprioritizeMapOrder(orderId: number): void {
  getDb()
    .prepare(
      "UPDATE map_orders SET priority_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    )
    .run(orderId);
}

export function findMapOrdersByUser(userId: number): MapOrderRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM map_orders
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(userId) as MapOrderRow[];
}

export function getMapOrderBookLevels(
  mapTypeId: number,
  mode: MapOrderMode,
  side: MapOrderSide
): Array<{ price: number; total_quantity: number; order_count: number }> {
  const priceOrder = side === "sell" ? "ASC" : "DESC";
  return getDb()
    .prepare(
      `SELECT price,
              SUM(quantity - filled_quantity) as total_quantity,
              COUNT(*) as order_count
       FROM map_orders
       WHERE map_type_id = ? AND mode = ? AND side = ?
         AND status IN ('open', 'partially_filled')${demoOrderFilter("map_orders", "maps")}
       GROUP BY price
       ORDER BY price ${priceOrder}`
    )
    .all(mapTypeId, mode, side) as Array<{
    price: number;
    total_quantity: number;
    order_count: number;
  }>;
}

/**
 * Get sell order book levels WITH tier breakdown (completed mode only).
 * Returns price levels with per-tier quantities (S/A/B).
 */
export function getMapSellOrderBookLevelsWithTiers(
  mapTypeId: number,
  mode: MapOrderMode
): Array<{
  price: number;
  total_quantity: number;
  order_count: number;
  tier_s: number;
  tier_a: number;
  tier_b: number;
}> {
  return getDb()
    .prepare(
      `SELECT price,
              SUM(quantity - filled_quantity) as total_quantity,
              COUNT(*) as order_count,
              SUM(CASE WHEN tier = 'S' THEN (quantity - filled_quantity) ELSE 0 END) as tier_s,
              SUM(CASE WHEN tier = 'A' THEN (quantity - filled_quantity) ELSE 0 END) as tier_a,
              SUM(CASE WHEN tier = 'B' THEN (quantity - filled_quantity) ELSE 0 END) as tier_b
       FROM map_orders
       WHERE map_type_id = ? AND mode = ? AND side = 'sell'
         AND status IN ('open', 'partially_filled')${demoOrderFilter("map_orders", "maps")}
       GROUP BY price
       ORDER BY price ASC`
    )
    .all(mapTypeId, mode) as Array<{
    price: number;
    total_quantity: number;
    order_count: number;
    tier_s: number;
    tier_a: number;
    tier_b: number;
  }>;
}

/**
 * Cancel all open map orders for a map type + mode (admin/mod market disable).
 * Excludes orders in active transactions.
 * Returns cancelled rows for notification and cleanup.
 */
export function cancelOpenMapOrdersForMarket(
  mapTypeId: number,
  mode: MapOrderMode,
  reason: string
): MapOrderRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM map_orders
       WHERE map_type_id = ? AND mode = ?
         AND status IN ('open', 'partially_filled')
         AND is_demo = 0
         AND id NOT IN (
           SELECT sell_order_id FROM map_transactions WHERE state NOT IN ('completed', 'failed')
           UNION SELECT buy_order_id FROM map_transactions WHERE state NOT IN ('completed', 'failed')
         )`
    )
    .all(mapTypeId, mode) as MapOrderRow[];

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");
  db.prepare(
    `UPDATE map_orders SET status = 'cancelled', close_reason = ?, updated_at = datetime('now')
     WHERE id IN (${placeholders})`
  ).run(reason, ...ids);

  return rows;
}

export function findPendingMapOrderTypes(
  userId: number
): Array<{ map_type_id: number; mode: MapOrderMode }> {
  return getDb()
    .prepare(
      `SELECT DISTINCT map_type_id, mode
       FROM map_orders
       WHERE user_id = ? AND status IN ('open', 'partially_filled')`
    )
    .all(userId) as Array<{ map_type_id: number; mode: MapOrderMode }>;
}

/**
 * Get all distinct (mapTypeId, mode) pairs with open/partially_filled orders.
 * Used for sweep-all matching on server restart.
 */
export function findAllOpenMapOrderTypes(): Array<{
  map_type_id: number;
  mode: MapOrderMode;
}> {
  return getDb()
    .prepare(
      `SELECT DISTINCT map_type_id, mode
       FROM map_orders
       WHERE status IN ('open', 'partially_filled')`
    )
    .all() as Array<{ map_type_id: number; mode: MapOrderMode }>;
}
