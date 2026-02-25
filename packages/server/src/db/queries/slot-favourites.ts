import { getDb } from "../connection.js";

/** Get a user's favourited map type IDs, newest first. */
export function getUserFavourites(userId: number): number[] {
  const rows = getDb()
    .prepare(
      "SELECT map_type_id FROM user_favourites WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId) as Array<{ map_type_id: number }>;

  return rows.map((r) => r.map_type_id);
}

/** Add a map type to a user's favourites (no-op if already exists). */
export function addFavourite(userId: number, mapTypeId: number): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO user_favourites (user_id, map_type_id) VALUES (?, ?)"
    )
    .run(userId, mapTypeId);
}

/** Remove a map type from a user's favourites. */
export function removeFavourite(userId: number, mapTypeId: number): void {
  getDb()
    .prepare(
      "DELETE FROM user_favourites WHERE user_id = ? AND map_type_id = ?"
    )
    .run(userId, mapTypeId);
}
