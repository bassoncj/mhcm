import { getDb } from "../connection.js";

export type FavouriteGoalType = "mouse" | "mouse_group" | "item" | "item_group";

export interface SnipingFavouriteRow {
  user_id: number;
  goal_type: FavouriteGoalType;
  goal_id: number;
  created_at: string;
}

/** Get a user's favourited sniping targets, newest first. */
export function getUserSnipingFavourites(userId: number): SnipingFavouriteRow[] {
  return getDb()
    .prepare(
      `SELECT user_id, goal_type, goal_id, created_at
       FROM user_sniping_favourites
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(userId) as SnipingFavouriteRow[];
}

/** Get a user's favourited sniping targets filtered by goal types. */
export function getUserSnipingFavouritesByGoalTypes(
  userId: number,
  goalTypes: FavouriteGoalType[]
): SnipingFavouriteRow[] {
  if (goalTypes.length === 0) return [];

  const placeholders = goalTypes.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT user_id, goal_type, goal_id, created_at
       FROM user_sniping_favourites
       WHERE user_id = ? AND goal_type IN (${placeholders})
       ORDER BY created_at DESC`
    )
    .all(userId, ...goalTypes) as SnipingFavouriteRow[];
}

/** Add a sniping target to a user's favourites (no-op if already exists). */
export function addSnipingFavourite(
  userId: number,
  goalType: FavouriteGoalType,
  goalId: number
): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO user_sniping_favourites (user_id, goal_type, goal_id) VALUES (?, ?, ?)"
    )
    .run(userId, goalType, goalId);
}

/** Remove a sniping target from a user's favourites. */
export function removeSnipingFavourite(
  userId: number,
  goalType: FavouriteGoalType,
  goalId: number
): void {
  getDb()
    .prepare(
      "DELETE FROM user_sniping_favourites WHERE user_id = ? AND goal_type = ? AND goal_id = ?"
    )
    .run(userId, goalType, goalId);
}
