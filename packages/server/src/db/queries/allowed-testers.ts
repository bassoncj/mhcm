import { getDb } from "../connection.js";

export interface AllowedTesterRow {
  id: number;
  discord_id: string;
  discord_username: string | null;
  added_by: number | null;
  created_at: string;
}

/** Get all allowed testers. */
export function findAllowedTesters(): AllowedTesterRow[] {
  return getDb()
    .prepare("SELECT * FROM allowed_testers ORDER BY created_at DESC")
    .all() as AllowedTesterRow[];
}

/** Check if a Discord ID is in the allowed testers list. */
export function isDiscordIdAllowed(discordId: string): boolean {
  const row = getDb()
    .prepare("SELECT id FROM allowed_testers WHERE discord_id = ?")
    .get(discordId);
  return row !== undefined;
}

/** Add a Discord ID to the allowed testers list. */
export function addAllowedTester(
  discordId: string,
  discordUsername: string | null,
  addedBy: number
): AllowedTesterRow {
  const stmt = getDb().prepare(
    "INSERT INTO allowed_testers (discord_id, discord_username, added_by) VALUES (?, ?, ?) RETURNING *"
  );
  return stmt.get(discordId, discordUsername, addedBy) as AllowedTesterRow;
}

/** Remove a Discord ID from the allowed testers list. */
export function removeAllowedTester(discordId: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM allowed_testers WHERE discord_id = ?")
    .run(discordId);
  return result.changes > 0;
}
