import { getDb } from "../connection.js";

/**
 * Calculate total SB committed across all open buy orders for a user.
 *
 * IMPORTANT: Always excludes demo orders (hardcoded is_demo = 0).
 * Demo SB is not real – it must never affect the user's available balance,
 * regardless of whether demo data is visible in the UI.
 */
export function getTotalCommittedSb(userId: number): number {
  const db = getDb();

  // Slots marketplace: sum of (price * remaining quantity)
  const slotsCommitted = db
    .prepare(
      `SELECT COALESCE(SUM(price * (quantity - filled_quantity)), 0) as total
       FROM orders
       WHERE user_id = ?
         AND side = 'buy'
         AND status IN ('open', 'partially_filled')
         AND is_demo = 0`
    )
    .get(userId) as { total: number };

  // Sniping marketplace: sum of prices (quantity is always 1)
  const snipingCommitted = db
    .prepare(
      `SELECT COALESCE(SUM(price), 0) as total
       FROM sniping_orders
       WHERE user_id = ?
         AND side = 'sniper_buy'
         AND status IN ('open', 'matched', 'in_progress')
         AND is_demo = 0`
    )
    .get(userId) as { total: number };

  // Items marketplace: sum of (price * remaining quantity)
  // ROUND() guards against IEEE 754 drift on fractional prices (each product is
  // whole by MOQ guarantee, but SUM of floats can accumulate tiny errors)
  const itemsCommitted = db
    .prepare(
      `SELECT COALESCE(ROUND(SUM(price * (quantity - filled_quantity))), 0) as total
       FROM item_orders
       WHERE user_id = ?
         AND side = 'buy'
         AND status IN ('open', 'partially_filled')
         AND is_demo = 0`
    )
    .get(userId) as { total: number };

  // Maps marketplace: sum of (price * remaining quantity)
  const mapsCommitted = db
    .prepare(
      `SELECT COALESCE(SUM(price * (quantity - filled_quantity)), 0) as total
       FROM map_orders
       WHERE user_id = ?
         AND side = 'buy'
         AND status IN ('open', 'partially_filled')
         AND is_demo = 0`
    )
    .get(userId) as { total: number };

  return (
    slotsCommitted.total +
    snipingCommitted.total +
    itemsCommitted.total +
    mapsCommitted.total
  );
}
