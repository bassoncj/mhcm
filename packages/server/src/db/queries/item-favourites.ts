import { getDb } from "../connection.js";

/** Get a user's favourited item type IDs, newest first. */
export function getItemFavourites(userId: number): number[] {
  const rows = getDb()
    .prepare(
      "SELECT item_type_id FROM user_item_favourites WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId) as Array<{ item_type_id: number }>;

  return rows.map((r) => r.item_type_id);
}

/** Add an item type to a user's favourites (no-op if already exists). */
export function addItemFavourite(userId: number, itemTypeId: number): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO user_item_favourites (user_id, item_type_id) VALUES (?, ?)"
    )
    .run(userId, itemTypeId);
}

/** Remove an item type from a user's favourites. */
export function removeItemFavourite(userId: number, itemTypeId: number): void {
  getDb()
    .prepare(
      "DELETE FROM user_item_favourites WHERE user_id = ? AND item_type_id = ?"
    )
    .run(userId, itemTypeId);
}
