import { getDb } from "../connection.js";

/** Get a user's subscribed item type IDs, newest first. */
export function getItemNotifications(userId: number): number[] {
  const rows = getDb()
    .prepare(
      "SELECT item_type_id FROM item_type_notifications WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId) as Array<{ item_type_id: number }>;

  return rows.map((r) => r.item_type_id);
}

/** Subscribe a user to notifications for an item type (no-op if already subscribed). */
export function addItemNotification(userId: number, itemTypeId: number): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO item_type_notifications (user_id, item_type_id) VALUES (?, ?)"
    )
    .run(userId, itemTypeId);
}

/** Unsubscribe a user from notifications for an item type. */
export function removeItemNotification(userId: number, itemTypeId: number): void {
  getDb()
    .prepare(
      "DELETE FROM item_type_notifications WHERE user_id = ? AND item_type_id = ?"
    )
    .run(userId, itemTypeId);
}

/** Get all user IDs subscribed to an item type (for broadcasting new sell orders). */
export function getUsersNotifyingItemType(itemTypeId: number): number[] {
  const rows = getDb()
    .prepare(
      "SELECT user_id FROM item_type_notifications WHERE item_type_id = ?"
    )
    .all(itemTypeId) as Array<{ user_id: number }>;

  return rows.map((r) => r.user_id);
}
