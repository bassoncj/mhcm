import type { SlotOrderSide, SlotOrderStatus } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoOrderFilter } from "../../demo/demo-mode.js";

export interface OrderRow {
  id: number;
  user_id: number;
  map_type_id: number;
  side: SlotOrderSide;
  price: number;
  quantity: number;
  filled_quantity: number;
  status: SlotOrderStatus;
  mh_map_id: number | null;
  tier: string | null;
  accepted_tiers: string | null;
  remaining_goals: string | null;
  rt_price: number | null;
  rt_only: number;
  is_rt: number;
  created_at: string;
  updated_at: string;
  priority_at: string;
}

export function createOrder(params: {
  userId: number;
  mapTypeId: number;
  side: SlotOrderSide;
  price: number;
  quantity: number;
  mhMapId: number | null;
  tier: string | null;
  acceptedTiers: string | null;
  remainingGoals: string | null;
  rtPrice: number | null;
  rtOnly: number;
  isRt: number;
}): OrderRow {
  return getDb()
    .prepare(
      `INSERT INTO orders (user_id, map_type_id, side, price, quantity, mh_map_id, tier, accepted_tiers, remaining_goals, rt_price, rt_only, is_rt)
       VALUES (@userId, @mapTypeId, @side, @price, @quantity, @mhMapId, @tier, @acceptedTiers, @remainingGoals, @rtPrice, @rtOnly, @isRt)
       RETURNING *`
    )
    .get(params) as OrderRow;
}

export function findOrderById(id: number): OrderRow | undefined {
  return getDb()
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(id) as OrderRow | undefined;
}

export function findOrdersByUser(
  userId: number,
  statuses: SlotOrderStatus[] = ["open", "partially_filled"]
): OrderRow[] {
  const placeholders = statuses.map(() => "?").join(", ");
  return getDb()
    .prepare(
      `SELECT * FROM orders o WHERE o.user_id = ? AND o.status IN (${placeholders})
       ${demoOrderFilter("o", "slots")}
       ORDER BY o.created_at DESC`
    )
    .all(userId, ...statuses) as OrderRow[];
}

export function cancelOrder(orderId: number, userId: number): boolean {
  const result = getDb()
    .prepare(
      `UPDATE orders SET status = 'cancelled', updated_at = datetime('now')
       WHERE id = ? AND user_id = ? AND status IN ('open', 'partially_filled')`
    )
    .run(orderId, userId);
  return result.changes > 0;
}

export function adjustOrder(
  orderId: number,
  userId: number,
  price?: number,
  quantity?: number
): OrderRow | undefined {
  const order = findOrderById(orderId);
  if (!order || order.user_id !== userId) return undefined;
  if (order.status !== "open" && order.status !== "partially_filled") return undefined;

  const newPrice = price ?? order.price;
  const newQuantity = quantity ?? order.quantity;
  if (newQuantity < order.filled_quantity) return undefined;

  getDb()
    .prepare(
      `UPDATE orders SET price = ?, quantity = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(newPrice, newQuantity, orderId);

  return findOrderById(orderId);
}

/** Get total sell quantity (listed slots) for a specific map instance. */
export function getActiveSellQuantityForMap(mhMapId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) as total
       FROM orders
       WHERE mh_map_id = ? AND side = 'sell' AND status IN ('open', 'partially_filled')`
    )
    .get(mhMapId) as { total: number };
  return row.total;
}

export function findBestMatch(
  mapTypeId: number,
  side: SlotOrderSide
): OrderRow | undefined {
  const oppositeSide: SlotOrderSide = side === "sell" ? "buy" : "sell";
  const priceOrder = side === "sell" ? "DESC" : "ASC";

  return getDb()
    .prepare(
      `SELECT * FROM orders
       WHERE map_type_id = ? AND side = ? AND status IN ('open', 'partially_filled')
       ORDER BY price ${priceOrder}, priority_at ASC
       LIMIT 1`
    )
    .get(mapTypeId, oppositeSide) as OrderRow | undefined;
}

export function getOrderBookLevels(
  mapTypeId: number,
  side: SlotOrderSide
): Array<{ price: number; quantity: number; order_count: number }> {
  const priceOrder = side === "sell" ? "ASC" : "DESC";
  return getDb()
    .prepare(
      `SELECT o.price,
              SUM(o.quantity - o.filled_quantity) as quantity,
              COUNT(*) as order_count
       FROM orders o
       WHERE o.map_type_id = ? AND o.side = ? AND o.status IN ('open', 'partially_filled')
         ${demoOrderFilter("o", "slots")}
       GROUP BY o.price
       ORDER BY o.price ${priceOrder}`
    )
    .all(mapTypeId, side) as Array<{
    price: number;
    quantity: number;
    order_count: number;
  }>;
}

export function getSellOrderBookLevelsWithTiers(
  mapTypeId: number
): Array<{
  price: number;
  quantity: number;
  order_count: number;
  tier_s: number;
  tier_a: number;
  tier_b: number;
  tier_none: number;
  rt_qty: number;
}> {
  return getDb()
    .prepare(
      `SELECT o.price,
              SUM(o.quantity - o.filled_quantity) as quantity,
              COUNT(*) as order_count,
              SUM(CASE WHEN o.tier = 'S' THEN o.quantity - o.filled_quantity ELSE 0 END) as tier_s,
              SUM(CASE WHEN o.tier = 'A' THEN o.quantity - o.filled_quantity ELSE 0 END) as tier_a,
              SUM(CASE WHEN o.tier = 'B' THEN o.quantity - o.filled_quantity ELSE 0 END) as tier_b,
              SUM(CASE WHEN o.tier IS NULL THEN o.quantity - o.filled_quantity ELSE 0 END) as tier_none,
              SUM(CASE WHEN o.rt_price IS NOT NULL THEN o.quantity - o.filled_quantity ELSE 0 END) as rt_qty
       FROM orders o
       WHERE o.map_type_id = ? AND o.side = 'sell' AND o.status IN ('open', 'partially_filled')
         ${demoOrderFilter("o", "slots")}
       GROUP BY o.price
       ORDER BY o.price ASC`
    )
    .all(mapTypeId) as Array<{
    price: number;
    quantity: number;
    order_count: number;
    tier_s: number;
    tier_a: number;
    tier_b: number;
    tier_none: number;
    rt_qty: number;
  }>;
}

/**
 * Get aggregated buy order levels with accepted tier breakdown for a map type.
 * For each price level, shows how many slots would accept each tier.
 * Note: A buy order with accepted_tiers = NULL accepts all tiers.
 */
export function getBuyOrderBookLevelsWithAcceptedTiers(
  mapTypeId: number
): Array<{
  price: number;
  quantity: number;
  order_count: number;
  accepts_s: number;
  accepts_a: number;
  accepts_b: number;
  accepts_all: number;
  rt_qty: number;
}> {
  return getDb()
    .prepare(
      `SELECT o.price,
              SUM(o.quantity - o.filled_quantity) as quantity,
              COUNT(*) as order_count,
              SUM(CASE WHEN o.accepted_tiers IS NULL OR o.accepted_tiers LIKE '%"S"%' THEN o.quantity - o.filled_quantity ELSE 0 END) as accepts_s,
              SUM(CASE WHEN o.accepted_tiers IS NULL OR o.accepted_tiers LIKE '%"A"%' THEN o.quantity - o.filled_quantity ELSE 0 END) as accepts_a,
              SUM(CASE WHEN o.accepted_tiers IS NULL OR o.accepted_tiers LIKE '%"B"%' OR o.accepted_tiers LIKE '%null%' THEN o.quantity - o.filled_quantity ELSE 0 END) as accepts_b,
              SUM(CASE WHEN o.accepted_tiers IS NULL THEN o.quantity - o.filled_quantity ELSE 0 END) as accepts_all,
              SUM(CASE WHEN o.is_rt = 1 THEN o.quantity - o.filled_quantity ELSE 0 END) as rt_qty
       FROM orders o
       WHERE o.map_type_id = ? AND o.side = 'buy' AND o.status IN ('open', 'partially_filled')
         ${demoOrderFilter("o", "slots")}
       GROUP BY o.price
       ORDER BY o.price DESC`
    )
    .all(mapTypeId) as Array<{
    price: number;
    quantity: number;
    order_count: number;
    accepts_s: number;
    accepts_a: number;
    accepts_b: number;
    accepts_all: number;
    rt_qty: number;
  }>;
}

export function updateOrderFill(
  orderId: number,
  additionalFilled: number
): void {
  getDb()
    .prepare(
      `UPDATE orders SET
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

export function findPendingBuyMapTypes(userId: number): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT map_type_id FROM orders
       WHERE user_id = ? AND side = 'buy' AND status IN ('open', 'partially_filled')`
    )
    .all(userId) as Array<{ map_type_id: number }>;
  return rows.map((r) => r.map_type_id);
}

export function deprioritizeOrder(orderId: number): void {
  getDb()
    .prepare(
      "UPDATE orders SET priority_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    )
    .run(orderId);
}

export function findPendingOrderMapTypes(userId: number): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT map_type_id FROM orders
       WHERE user_id = ? AND status IN ('open', 'partially_filled')`
    )
    .all(userId) as Array<{ map_type_id: number }>;
  return rows.map((r) => r.map_type_id);
}

export function getActivityCountsByMapType(): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT o.map_type_id, COUNT(*) as activity
       FROM orders o
       WHERE o.status IN ('open', 'partially_filled')
         ${demoOrderFilter("o", "slots")}
       GROUP BY o.map_type_id`
    )
    .all() as Array<{ map_type_id: number; activity: number }>;

  const result: Record<number, number> = {};
  for (const row of rows) {
    result[row.map_type_id] = row.activity;
  }
  return result;
}

export function reverseOrderFill(
  orderId: number,
  quantityToReverse: number
): void {
  getDb()
    .prepare(
      `UPDATE orders SET
         filled_quantity = MAX(0, filled_quantity - ?),
         status = CASE
           WHEN MAX(0, filled_quantity - ?) = 0 THEN 'open'
           ELSE 'partially_filled'
         END,
         updated_at = datetime('now')
       WHERE id = ? AND status IN ('partially_filled', 'filled')`
    )
    .run(quantityToReverse, quantityToReverse, orderId);
}

/**
 * Auto-adjust a sell order based on actual available slots from the game.
 * - If availableSlots = 0: cancel the order.
 * - If availableSlots < remaining unfilled: reduce quantity to match.
 * - Otherwise: no change needed.
 *
 * Returns the action taken and the updated order row (if changed).
 */
export function autoAdjustSellOrderSlots(
  orderId: number,
  availableSlots: number
): { action: "cancelled" | "reduced" | "none"; order?: OrderRow } {
  const order = findOrderById(orderId);
  if (!order) return { action: "none" };
  if (order.status !== "open" && order.status !== "partially_filled") return { action: "none" };

  const remaining = order.quantity - order.filled_quantity;

  if (availableSlots <= 0) {
    // Cancel entirely – no slots left
    getDb()
      .prepare(
        `UPDATE orders SET status = 'cancelled', updated_at = datetime('now')
         WHERE id = ? AND status IN ('open', 'partially_filled')`
      )
      .run(orderId);
    return { action: "cancelled", order };
  }

  if (availableSlots < remaining) {
    // Reduce quantity so remaining matches available slots
    const newQuantity = order.filled_quantity + availableSlots;
    getDb()
      .prepare(
        `UPDATE orders SET quantity = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(newQuantity, orderId);
    return { action: "reduced", order: findOrderById(orderId) };
  }

  return { action: "none" };
}

/**
 * Cancel all sell orders for a user whose maps have been removed.
 * Skips orders involved in active (non-terminal) transactions.
 * Returns the cancelled order rows so callers can notify and update order books.
 */
export function cancelSellOrdersByMapIds(
  userId: number,
  mapIds: number[]
): OrderRow[] {
  if (mapIds.length === 0) return [];

  const placeholders = mapIds.map(() => "?").join(", ");
  const db = getDb();

  // Find the orders we're about to cancel
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE user_id = ? AND side = 'sell'
         AND mh_map_id IN (${placeholders})
         AND status IN ('open', 'partially_filled')
         AND id NOT IN (
           SELECT sell_order_id FROM transactions
           WHERE state NOT IN ('completed', 'failed')
         )`
    )
    .all(userId, ...mapIds) as OrderRow[];

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const idPlaceholders = ids.map(() => "?").join(", ");
  db.prepare(
    `UPDATE orders SET status = 'cancelled', updated_at = datetime('now')
     WHERE id IN (${idPlaceholders})`
  ).run(...ids);

  return rows;
}

/**
 * Cancel all open slot orders for a map type (admin/mod market disable).
 * Excludes orders in active transactions and demo orders.
 * Returns cancelled rows for notification and cleanup.
 */
export function cancelOpenSlotOrdersForMapType(
  mapTypeId: number
): OrderRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE map_type_id = ?
         AND status IN ('open', 'partially_filled')
         AND is_demo = 0
         AND id NOT IN (
           SELECT sell_order_id FROM transactions WHERE state NOT IN ('completed', 'failed')
           UNION SELECT buy_order_id FROM transactions WHERE state NOT IN ('completed', 'failed')
         )`
    )
    .all(mapTypeId) as OrderRow[];

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");
  db.prepare(
    `UPDATE orders SET status = 'cancelled', updated_at = datetime('now')
     WHERE id IN (${placeholders})`
  ).run(...ids);

  return rows;
}

export function closeSlotOrder(orderId: number): void {
  getDb()
    .prepare(
      `UPDATE orders SET status = 'cancelled', updated_at = datetime('now')
       WHERE id = ? AND status IN ('open', 'partially_filled')`
    )
    .run(orderId);
}
