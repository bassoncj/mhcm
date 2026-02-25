import type { MapOrderMode } from "@mhcm/shared";
import { getDb } from "../connection.js";

/** Get a user's favourited map type IDs for a specific mode, newest first. */
export function getMapFavourites(userId: number, mode: MapOrderMode): number[] {
  const rows = getDb()
    .prepare(
      "SELECT map_type_id FROM user_map_favourites WHERE user_id = ? AND mode = ? ORDER BY created_at DESC"
    )
    .all(userId, mode) as Array<{ map_type_id: number }>;

  return rows.map((r) => r.map_type_id);
}

/** Add a map type to a user's favourites for a specific mode (no-op if already exists). */
export function addMapFavourite(userId: number, mapTypeId: number, mode: MapOrderMode): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO user_map_favourites (user_id, map_type_id, mode) VALUES (?, ?, ?)"
    )
    .run(userId, mapTypeId, mode);
}

/** Remove a map type from a user's favourites for a specific mode. */
export function removeMapFavourite(userId: number, mapTypeId: number, mode: MapOrderMode): void {
  getDb()
    .prepare(
      "DELETE FROM user_map_favourites WHERE user_id = ? AND map_type_id = ? AND mode = ?"
    )
    .run(userId, mapTypeId, mode);
}