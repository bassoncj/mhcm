import { getDb } from "../connection.js";

/** Get a user's subscribed map type IDs (slot marketplace), newest first. */
export function getUserNotifications(userId: number): number[] {
  const rows = getDb()
    .prepare(
      "SELECT map_type_id FROM map_type_notifications WHERE user_id = ? AND mode IS NULL ORDER BY created_at DESC"
    )
    .all(userId) as Array<{ map_type_id: number }>;

  return rows.map((r) => r.map_type_id);
}

/** Subscribe a user to slot notifications for a map type (no-op if already subscribed). */
export function addNotification(userId: number, mapTypeId: number): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO map_type_notifications (user_id, map_type_id) VALUES (?, ?)"
    )
    .run(userId, mapTypeId);
}

/** Unsubscribe a user from slot notifications for a map type. */
export function removeNotification(userId: number, mapTypeId: number): void {
  getDb()
    .prepare(
      "DELETE FROM map_type_notifications WHERE user_id = ? AND map_type_id = ? AND mode IS NULL"
    )
    .run(userId, mapTypeId);
}

/** Get all user IDs subscribed to slot notifications for a map type. */
export function getUsersNotifyingMapType(mapTypeId: number): number[] {
  const rows = getDb()
    .prepare(
      "SELECT user_id FROM map_type_notifications WHERE map_type_id = ? AND mode IS NULL"
    )
    .all(mapTypeId) as Array<{ user_id: number }>;

  return rows.map((r) => r.user_id);
}
