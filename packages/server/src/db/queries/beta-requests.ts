import { getDb } from "../connection.js";

export interface BetaRequestRow {
  id: number;
  user_id: number;
  status: "pending" | "approved" | "denied";
  reviewed_by: number | null;
  created_at: string;
  reviewed_at: string | null;
  /** Joined from users table. */
  username: string;
  /** Joined from users table. */
  discord_username: string | null;
}

const SELECT_WITH_USER = `
  SELECT br.*, u.username, u.discord_username
  FROM beta_requests br
  JOIN users u ON u.id = br.user_id
`;

/** Get all pending beta requests (joined with user info). */
export function findPendingBetaRequests(): BetaRequestRow[] {
  return getDb()
    .prepare(
      `${SELECT_WITH_USER} WHERE br.status = 'pending' ORDER BY br.created_at ASC`
    )
    .all() as BetaRequestRow[];
}

/** Get a beta request by user ID. */
export function findBetaRequestByUserId(
  userId: number
): BetaRequestRow | undefined {
  return getDb()
    .prepare(`${SELECT_WITH_USER} WHERE br.user_id = ?`)
    .get(userId) as BetaRequestRow | undefined;
}

/** Check if a user has a pending beta request. */
export function hasPendingBetaRequest(userId: number): boolean {
  const row = getDb()
    .prepare(
      "SELECT id FROM beta_requests WHERE user_id = ? AND status = 'pending'"
    )
    .get(userId);
  return row !== undefined;
}

/** Create a new beta request for a user. Returns the new row with user info. */
export function createBetaRequest(userId: number): BetaRequestRow {
  const db = getDb();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO beta_requests (user_id) VALUES (?)")
    .run(userId);
  return db
    .prepare(`${SELECT_WITH_USER} WHERE br.id = ?`)
    .get(lastInsertRowid) as BetaRequestRow;
}

/** Approve a beta request. Returns the updated row or undefined if not found. */
export function approveBetaRequest(
  requestId: number,
  reviewedBy: number
): BetaRequestRow | undefined {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE beta_requests
       SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now')
       WHERE id = ? AND status = 'pending'`
    )
    .run(reviewedBy, requestId);
  if (result.changes === 0) return undefined;
  return db
    .prepare(`${SELECT_WITH_USER} WHERE br.id = ?`)
    .get(requestId) as BetaRequestRow;
}

/** Deny a beta request. Returns the updated row or undefined if not found. */
export function denyBetaRequest(
  requestId: number,
  reviewedBy: number
): BetaRequestRow | undefined {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE beta_requests
       SET status = 'denied', reviewed_by = ?, reviewed_at = datetime('now')
       WHERE id = ? AND status = 'pending'`
    )
    .run(reviewedBy, requestId);
  if (result.changes === 0) return undefined;
  return db
    .prepare(`${SELECT_WITH_USER} WHERE br.id = ?`)
    .get(requestId) as BetaRequestRow;
}
