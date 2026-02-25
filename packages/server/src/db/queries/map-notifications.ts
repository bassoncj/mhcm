import type { MapOrderMode } from "@mhcm/shared";
import { getDb } from "../connection.js";

export interface MapNotificationRow {
  id: number;
  user_id: number;
  map_type_id: number;
  mode: MapOrderMode;
  created_at: string;
}

/** Get a user's subscribed (mapTypeId, mode) pairs (maps marketplace only), newest first. */
export function getMapNotifications(userId: number): MapNotificationRow[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM map_type_notifications WHERE user_id = ? AND mode IS NOT NULL ORDER BY created_at DESC"
    )
    .all(userId) as MapNotificationRow[];

  return rows;
}

/** Subscribe a user to notifications for a (map type, mode) pair (no-op if already subscribed). */
export function addMapNotification(
  userId: number,
  mapTypeId: number,
  mode: MapOrderMode
): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO map_type_notifications (user_id, map_type_id, mode) VALUES (?, ?, ?)"
    )
    .run(userId, mapTypeId, mode);
}

/** Unsubscribe a user from notifications for a (map type, mode) pair. */
export function removeMapNotification(
  userId: number,
  mapTypeId: number,
  mode: MapOrderMode
): void {
  getDb()
    .prepare(
      "DELETE FROM map_type_notifications WHERE user_id = ? AND map_type_id = ? AND mode = ?"
    )
    .run(userId, mapTypeId, mode);
}

/** Get all user IDs subscribed to a (map type, mode) pair (for broadcasting new sell orders). */
export function getUsersNotifyingMapType(
  mapTypeId: number,
  mode: MapOrderMode
): number[] {
  const rows = getDb()
    .prepare(
      "SELECT user_id FROM map_type_notifications WHERE map_type_id = ? AND mode = ?"
    )
    .all(mapTypeId, mode) as Array<{ user_id: number }>;

  return rows.map((r) => r.user_id);
}
