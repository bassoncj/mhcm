import type { UserRole, UserStatus, NotificationPrefs } from "@mhcm/shared";
import { DEFAULT_NOTIFICATION_PREFS } from "@mhcm/shared";
import { getDb } from "../connection.js";

export interface UserRow {
  id: number;
  username: string;
  password_hash: string | null;
  role: UserRole;
  status: UserStatus;
  is_demo: number;
  discord_id: string | null;
  discord_username: string | null;
  notification_prefs: string | null;
  rank_id: number | null;
  last_connected_at: string | null;
  created_at: string;
}

export interface SuspensionRow {
  id: number;
  user_id: number;
  suspended_by: number | null;
  suspended_by_username: string | null;
  reason: string | null;
  suspended_at: string;
  expires_at: string | null;
  lifted_at: string | null;
  lifted_by: number | null;
  lifted_by_username: string | null;
  lift_note: string | null;
}

export function findUserByUsername(username: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as UserRow | undefined;
}

export function createUser(username: string, passwordHash: string): UserRow {
  const stmt = getDb().prepare(
    "INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING *"
  );
  return stmt.get(username, passwordHash) as UserRow;
}

export function createUserFromDiscord(
  discordId: string,
  discordUsername: string,
  role: UserRole = "user"
): UserRow {
  const stmt = getDb().prepare(
    "INSERT INTO users (username, password_hash, discord_id, discord_username, role) VALUES (?, NULL, ?, ?, ?) RETURNING *"
  );
  // Use Discord username as the marketplace username
  return stmt.get(discordUsername, discordId, discordUsername, role) as UserRow;
}

export function findAllUsers(): UserRow[] {
  return getDb()
    .prepare("SELECT * FROM users ORDER BY created_at DESC")
    .all() as UserRow[];
}

export function setUserRole(userId: number, role: UserRole): void {
  getDb()
    .prepare("UPDATE users SET role = ? WHERE id = ?")
    .run(role, userId);
}

export function setUserStatus(userId: number, status: UserStatus): void {
  getDb()
    .prepare("UPDATE users SET status = ? WHERE id = ?")
    .run(status, userId);
}

export function updateUserDiscord(userId: number, discordId: string, discordUsername: string): void {
  getDb()
    .prepare("UPDATE users SET discord_id = ?, discord_username = ? WHERE id = ?")
    .run(discordId, discordUsername, userId);
}

export function findUserByDiscordId(discordId: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE discord_id = ?")
    .get(discordId) as UserRow | undefined;
}

export function getNotificationPrefs(userId: number): NotificationPrefs {
  const row = getDb()
    .prepare("SELECT notification_prefs FROM users WHERE id = ?")
    .get(userId) as { notification_prefs: string | null } | undefined;

  if (!row || !row.notification_prefs) {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }

  try {
    const parsed = JSON.parse(row.notification_prefs) as Partial<NotificationPrefs>;
    // Merge with defaults to ensure all keys exist
    return { ...DEFAULT_NOTIFICATION_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export function updateNotificationPrefs(
  userId: number,
  prefs: Partial<NotificationPrefs>
): NotificationPrefs {
  // Get current prefs, merge with new ones
  const current = getNotificationPrefs(userId);
  const merged = { ...current, ...prefs };

  getDb()
    .prepare("UPDATE users SET notification_prefs = ? WHERE id = ?")
    .run(JSON.stringify(merged), userId);

  return merged;
}

export function getUserRankId(userId: number): number | null {
  const row = getDb()
    .prepare("SELECT rank_id FROM users WHERE id = ?")
    .get(userId) as { rank_id: number | null } | undefined;
  return row?.rank_id ?? null;
}

export function setUserRankId(userId: number, rankId: number): void {
  getDb()
    .prepare("UPDATE users SET rank_id = ? WHERE id = ?")
    .run(rankId, userId);
}

export function createSuspension(
  userId: number,
  suspendedBy: number | null,
  reason: string | null,
  expiresAt: string | null
): number {
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO suspensions (user_id, suspended_by, reason, expires_at) VALUES (?, ?, ?, ?)"
    )
    .run(userId, suspendedBy, reason, expiresAt);
  setUserStatus(userId, "suspended");
  return Number(result.lastInsertRowid);
}

export function liftSuspension(
  suspensionId: number,
  liftedBy: number | null,
  liftNote: string | null
): void {
  const db = getDb();
  const row = db
    .prepare("SELECT user_id FROM suspensions WHERE id = ?")
    .get(suspensionId) as { user_id: number } | undefined;
  if (!row) return;

  db.prepare(
    "UPDATE suspensions SET lifted_at = datetime('now'), lifted_by = ?, lift_note = ? WHERE id = ?"
  ).run(liftedBy, liftNote, suspensionId);
  setUserStatus(row.user_id, "active");
}

export function getActiveSuspension(userId: number): SuspensionRow | undefined {
  return getDb()
    .prepare(
      `SELECT s.*, sb.username AS suspended_by_username, lb.username AS lifted_by_username
       FROM suspensions s
       LEFT JOIN users sb ON sb.id = s.suspended_by
       LEFT JOIN users lb ON lb.id = s.lifted_by
       WHERE s.user_id = ? AND s.lifted_at IS NULL
       ORDER BY s.id DESC LIMIT 1`
    )
    .get(userId) as SuspensionRow | undefined;
}

export function getSuspensionHistory(userId: number): SuspensionRow[] {
  return getDb()
    .prepare(
      `SELECT s.*, sb.username AS suspended_by_username, lb.username AS lifted_by_username
       FROM suspensions s
       LEFT JOIN users sb ON sb.id = s.suspended_by
       LEFT JOIN users lb ON lb.id = s.lifted_by
       WHERE s.user_id = ?
       ORDER BY s.id DESC`
    )
    .all(userId) as SuspensionRow[];
}

export function updateLastConnectedAt(userId: number): void {
  getDb()
    .prepare("UPDATE users SET last_connected_at = datetime('now') WHERE id = ?")
    .run(userId);
}

export function setUserUtcOffset(userId: number, utcOffset: number): void {
  getDb()
    .prepare("UPDATE users SET utc_offset = ? WHERE id = ?")
    .run(utcOffset, userId);
}

export function getUserUtcOffset(userId: number): number {
  const row = getDb()
    .prepare("SELECT utc_offset FROM users WHERE id = ?")
    .get(userId) as { utc_offset: number } | undefined;
  return row?.utc_offset ?? 0;
}
