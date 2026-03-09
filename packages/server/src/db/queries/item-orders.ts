import type { ItemOrderSide, ItemOrderStatus } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoOrderFilter } from "../../demo/demo-mode.js";

export interface ItemOrderRow {
  id: number;
  user_id: number;
  item_type_id: number;
  side: ItemOrderSide;
  price: number;
  quantity: number;
  filled_quantity: number;
  status: ItemOrderStatus;
  close_reason: string | null;
  created_at: string;
  updated_at: string;
  priority_at: string;
}

export function createItemOrder(params: {
  userId: number;
  itemTypeId: number;
  side: ItemOrderSide;
  price: number;
  quantity: number;
}): ItemOrderRow {
  return getDb()
    .prepare(
      `INSERT INTO item_orders (user_id, item_type_id, side, price, quantity)
       VALUES (@userId, @itemTypeId, @side, @price, @quantity)
       RETURNING *`
    )
    .get(params) as ItemOrderRow;
}

export function findItemOrderById(id: number): ItemOrderRow | undefined {
  return getDb()
    .prepare("SELECT * FROM item_orders WHERE id = ?")
    .get(id) as ItemOrderRow | undefined;
}

export function findItemOrdersByUser(
  userId: number,
  statuses: ItemOrderStatus[] = ["open", "partially_filled"]
): ItemOrderRow[] {
  const placeholders = statuses.map(() => "?").join(", ");
  return getDb()
    .prepare(
      `SELECT * FROM item_orders
       WHERE user_id = ? AND status IN (${placeholders})${demoOrderFilter("item_orders", "items")}
       ORDER BY created_at DESC`
    )
    .all(userId, ...statuses) as ItemOrderRow[];
}

export function cancelItemOrder(orderId: number, userId: number): boolean {
  const result = getDb()
    .prepare(
      `UPDATE item_orders SET status = 'cancelled', updated_at = datetime('now')
       WHERE id = ? AND user_id = ? AND status IN ('open', 'partially_filled')`
    )
    .run(orderId, userId);
  return result.changes > 0;
}

export function adjustItemOrder(
  orderId: number,
  userId: number,
  price?: number,
  quantity?: number
): ItemOrderRow | undefined {
  const order = findItemOrderById(orderId);
  if (!order || order.user_id !== userId) return undefined;
  if (order.status !== "open" && order.status !== "partially_filled") return undefined;

  const newPrice = price ?? order.price;
  const newQuantity = quantity ?? order.quantity;
  if (newQuantity < order.filled_quantity) return undefined;

  // Price change resets time priority
  const priceChanged = price != null && price !== order.price;

  if (priceChanged) {
    getDb()
      .prepare(
        `UPDATE item_orders SET price = ?, quantity = ?,
         priority_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(newPrice, newQuantity, orderId);
  } else {
    getDb()
      .prepare(
        `UPDATE item_orders SET price = ?, quantity = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(newPrice, newQuantity, orderId);
  }

  return findItemOrderById(orderId);
}

/**
 * Find best sell order: lowest price, oldest priority.
 * Excludes offline, AFK, suspended users, and disabled items.
 */
export function findBestItemSellOrder(
  itemTypeId: number,
  onlineUserIds: ReadonlySet<number>,
  afkUserIds: ReadonlySet<number>,
  invalidSettingsUserIds?: ReadonlySet<number>
): ItemOrderRow | undefined {
  // Fetch all candidate sell orders ordered by price ASC, priority ASC
  const rows = getDb()
    .prepare(
      `SELECT o.* FROM item_orders o
       JOIN item_types it ON it.id = o.item_type_id
       WHERE o.item_type_id = ? AND o.side = 'sell'
         AND o.status IN ('open', 'partially_filled')
         AND o.is_demo = 0
         AND it.enabled = 1 AND it.is_tradable = 1
         AND o.user_id NOT IN (SELECT id FROM users WHERE status = 'suspended')
       ORDER BY o.price ASC, o.priority_at ASC`
    )
    .all(itemTypeId) as ItemOrderRow[];

  // Filter to online, non-AFK, valid-settings users in JS (sets are in-memory)
  for (const row of rows) {
    if (!onlineUserIds.has(row.user_id)) continue;
    if (afkUserIds.has(row.user_id)) continue;
    if (invalidSettingsUserIds?.has(row.user_id)) continue;
    return row;
  }
  return undefined;
}

/**
 * Find candidate buy orders: highest price, oldest priority.
 * Returns list for self-trade skipping in the matcher.
 * Excludes offline, AFK, suspended users, and disabled items.
 */
export function findCandidateItemBuyOrders(
  itemTypeId: number,
  minPrice: number,
  onlineUserIds: ReadonlySet<number>,
  afkUserIds: ReadonlySet<number>,
  invalidSettingsUserIds?: ReadonlySet<number>
): ItemOrderRow[] {
  const rows = getDb()
    .prepare(
      `SELECT o.* FROM item_orders o
       JOIN item_types it ON it.id = o.item_type_id
       WHERE o.item_type_id = ? AND o.side = 'buy'
         AND o.status IN ('open', 'partially_filled')
         AND o.price >= ?
         AND o.is_demo = 0
         AND it.enabled = 1 AND it.is_tradable = 1
         AND o.user_id NOT IN (SELECT id FROM users WHERE status = 'suspended')
       ORDER BY o.price DESC, o.priority_at ASC`
    )
    .all(itemTypeId, minPrice) as ItemOrderRow[];

  return rows.filter(
    (r) => onlineUserIds.has(r.user_id) && !afkUserIds.has(r.user_id) && !invalidSettingsUserIds?.has(r.user_id)
  );
}

export function updateItemOrderFill(
  orderId: number,
  additionalFilled: number
): void {
  getDb()
    .prepare(
      `UPDATE item_orders SET
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

export function reverseItemOrderFill(
  orderId: number,
  quantityToReverse: number
): void {
  getDb()
    .prepare(
      `UPDATE item_orders SET
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

export function getItemOrderBookLevels(
  itemTypeId: number,
  side: ItemOrderSide
): Array<{ price: number; total_quantity: number; order_count: number }> {
  const priceOrder = side === "sell" ? "ASC" : "DESC";
  return getDb()
    .prepare(
      `SELECT price,
              SUM(quantity - filled_quantity) as total_quantity,
              COUNT(*) as order_count
       FROM item_orders
       WHERE item_type_id = ? AND side = ? AND status IN ('open', 'partially_filled')${demoOrderFilter("item_orders", "items")}
       GROUP BY price
       ORDER BY price ${priceOrder}`
    )
    .all(itemTypeId, side) as Array<{
    price: number;
    total_quantity: number;
    order_count: number;
  }>;
}

export function deprioritizeItemOrder(orderId: number): void {
  getDb()
    .prepare(
      "UPDATE item_orders SET priority_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    )
    .run(orderId);
}

export function closeItemOrderWithReason(orderId: number, reason: string): void {
  getDb()
    .prepare(
      `UPDATE item_orders SET status = 'cancelled', close_reason = ?,
       updated_at = datetime('now')
       WHERE id = ? AND status IN ('open', 'partially_filled')`
    )
    .run(reason, orderId);
}

export function findPendingItemOrderTypes(userId: number): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT item_type_id FROM item_orders
       WHERE user_id = ? AND status IN ('open', 'partially_filled')`
    )
    .all(userId) as Array<{ item_type_id: number }>;
  return rows.map((r) => r.item_type_id);
}

export function findAllOpenItemOrderTypes(): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT item_type_id FROM item_orders
       WHERE status IN ('open', 'partially_filled')`
    )
    .all() as Array<{ item_type_id: number }>;
  return rows.map((r) => r.item_type_id);
}

export function getItemActivityCounts(): Record<number, number> {
  const rows = getDb()
    .prepare(
      `SELECT item_type_id, COUNT(*) as activity
       FROM item_orders
       WHERE status IN ('open', 'partially_filled')${demoOrderFilter("item_orders", "items")}
       GROUP BY item_type_id`
    )
    .all() as Array<{ item_type_id: number; activity: number }>;

  const result: Record<number, number> = {};
  for (const row of rows) {
    result[row.item_type_id] = row.activity;
  }
  return result;
}
