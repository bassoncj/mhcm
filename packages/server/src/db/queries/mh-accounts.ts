import { getDb } from "../connection.js";

export interface MHAccountRow {
  id: number;
  user_id: number;
  mh_user_id: number;
  mh_sn_user_id: string;
  verification_token: string | null;
  verified_at: string | null;
  created_at: string;
}

export function findMHAccountByUserId(
  userId: number
): MHAccountRow | undefined {
  return getDb()
    .prepare("SELECT * FROM mh_accounts WHERE user_id = ?")
    .get(userId) as MHAccountRow | undefined;
}

export function findMHAccountBySnUserId(
  snUserId: string
): MHAccountRow | undefined {
  return getDb()
    .prepare("SELECT * FROM mh_accounts WHERE mh_sn_user_id = ?")
    .get(snUserId) as MHAccountRow | undefined;
}

export function findMHAccountByMHUserId(
  mhUserId: number
): MHAccountRow | undefined {
  return getDb()
    .prepare("SELECT * FROM mh_accounts WHERE mh_user_id = ?")
    .get(mhUserId) as MHAccountRow | undefined;
}

/**
 * Create a pending MH account link with a corkboard verification code.
 * Not verified until the user posts the code to their corkboard.
 */
export function createMHAccountPending(
  userId: number,
  mhUserId: number,
  mhSnUserId: string,
  verificationCode: string
): MHAccountRow {
  return getDb()
    .prepare(
      `INSERT INTO mh_accounts (user_id, mh_user_id, mh_sn_user_id, verification_token)
       VALUES (?, ?, ?, ?) RETURNING *`
    )
    .get(userId, mhUserId, mhSnUserId, verificationCode) as MHAccountRow;
}

/** Mark a pending MH account as verified and clear the verification code. */
export function markVerified(userId: number): void {
  getDb()
    .prepare(
      "UPDATE mh_accounts SET verified_at = datetime('now'), verification_token = NULL WHERE user_id = ?"
    )
    .run(userId);
}

/** Delete a pending (unverified) MH account link, e.g. to allow re-linking. */
export function deletePendingMHAccount(userId: number): void {
  getDb()
    .prepare(
      "DELETE FROM mh_accounts WHERE user_id = ? AND verified_at IS NULL"
    )
    .run(userId);
}

/** Delete an MH account link (verified or not). Used by admin reset. */
export function deleteMHAccount(userId: number): void {
  getDb()
    .prepare("DELETE FROM mh_accounts WHERE user_id = ?")
    .run(userId);
}
