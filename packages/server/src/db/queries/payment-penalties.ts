import { getDb } from "../connection.js";

export interface PaymentPenaltyRow {
  id: number;
  user_id: number;
  transaction_id: number;
  penalty_type: string;
  reported_balance: number | null;
  required_amount: number;
  grace_expires_at: string;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
}

export function createPaymentPenalty(params: {
  userId: number;
  transactionId: number;
  penaltyType: string;
  reportedBalance: number | null;
  requiredAmount: number;
  graceExpiresAt: string;
}): PaymentPenaltyRow {
  const result = getDb()
    .prepare(
      `INSERT INTO payment_penalties
        (user_id, transaction_id, penalty_type, reported_balance, required_amount, grace_expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.userId,
      params.transactionId,
      params.penaltyType,
      params.reportedBalance,
      params.requiredAmount,
      params.graceExpiresAt
    );

  return getDb()
    .prepare("SELECT * FROM payment_penalties WHERE id = ?")
    .get(result.lastInsertRowid) as PaymentPenaltyRow;
}

export function resolvePaymentPenalty(penaltyId: number, resolution: string): void {
  getDb()
    .prepare(
      "UPDATE payment_penalties SET resolved_at = datetime('now'), resolution = ? WHERE id = ?"
    )
    .run(resolution, penaltyId);
}

export function findUnresolvedPenaltyForTxn(transactionId: number): PaymentPenaltyRow | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM payment_penalties WHERE transaction_id = ? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1"
    )
    .get(transactionId) as PaymentPenaltyRow | undefined;
}

export function findUnresolvedPenaltiesForUser(userId: number): PaymentPenaltyRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM payment_penalties WHERE user_id = ? AND resolved_at IS NULL ORDER BY created_at ASC"
    )
    .all(userId) as PaymentPenaltyRow[];
}
