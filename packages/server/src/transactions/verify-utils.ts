// Server-side cross-verification state machine.
// After a transaction step completes, the orchestrator calls startVerification()
// to challenge the non-executing party to independently confirm the outcome.
// Three attempts with exponential backoff; failure triggers onFail callback.
// If all three attempts soft-fail (timeout or infra error), onTimeout is called
// instead, allowing the orchestrator to park rather than suspend.

import type { VerificationType } from "@mhcm/shared";
import { sendToUser } from "../ws/connections.js";
import { isUserOnline } from "../ws/connections.js";
import { getUserUtcOffset } from "../db/queries/users.js";

const RETRY_DELAYS_MS = [1_000, 3_000, 10_000] as const;
const ATTEMPT_TIMEOUT_MS = 30_000; // 30s per attempt

export interface VerifyChallenge {
  verificationType: VerificationType;
  /** Sender's numeric MH user ID (from p.php?id=X) -- messages-API checks. */
  senderMhUserId?: string;
  /** Item display name as shown in the notification text -- messages-API checks. */
  itemDisplayName?: string;
  /** Quantity -- messages-API checks. */
  quantity?: number;
  /** ISO UTC timestamp when the transfer step completed -- messages-API checks. */
  transferTimestampUtc?: string;
  /** Map ID -- map-state checks. */
  mapId?: number;
  /** SN user ID of the hunter expected to be present/absent -- map-state checks. */
  expectedHunterSnUserId?: string;
  /** Map class to check for map_free verification (e.g. "treasure", "event", "poster"). */
  mapClass?: string;
  /** Expected map reward type (e.g. "rift_valour_treasure_chest"). For map_valid and scroll_opened checks. */
  expectedMapType?: string;
  /** Goal type ("mouse" or "item"). For map_valid completed-mode goal verification. */
  goal?: string;
  /** MH type key string for goal_completed verification (e.g. "desert_nomad"). */
  goalKey?: string;
}

interface PendingVerification {
  transactionId: number;
  verifyingUserId: number;
  challenge: VerifyChallenge;
  /** Marketplace identifier for audit events. */
  marketplace: string;
  attemptNumber: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  /** Per-attempt timeout timer. Fires if no response within ATTEMPT_TIMEOUT_MS. */
  attemptTimer: ReturnType<typeof setTimeout> | null;
  /** Number of attempts that soft-failed (timeout or infra error -- not definitive fraud). */
  softFailCount: number;
  onSuccess: () => void;
  onFail: () => void;
  /** Called when all 3 attempts soft-fail (no definitive fraud detected). Parks the transaction. */
  onTimeout: (() => void) | null;
}

const pendingVerifications = new Map<number, PendingVerification>();

/**
 * Begin cross-verification for a completed transaction step.
 * Sends a challenge to verifyingUserId and retries up to 3 times on failure.
 * If the user is offline, the challenge is queued and sent on reconnect.
 *
 * onTimeout (optional): called when all 3 attempts soft-fail (timeout or infra error).
 * If not provided, falls back to onFail. Orchestrators use this to park the
 * transaction and retry on reconnect instead of suspending.
 */
export function startVerification(
  transactionId: number,
  verifyingUserId: number,
  marketplace: string,
  challenge: VerifyChallenge,
  onSuccess: () => void,
  onFail: () => void,
  onTimeout?: () => void
): void {
  // Cancel any existing verification for this transaction (defensive)
  cancelVerification(transactionId);

  const entry: PendingVerification = {
    transactionId,
    verifyingUserId,
    challenge,
    marketplace,
    attemptNumber: 1,
    retryTimer: null,
    attemptTimer: null,
    softFailCount: 0,
    onSuccess,
    onFail,
    onTimeout: onTimeout ?? null,
  };
  pendingVerifications.set(transactionId, entry);

  sendChallenge(entry);
}

/**
 * Handle the result of a verify_transfer_result message.
 * verificationType is validated against the pending record as a sanity check.
 * error (optional): set by extension when verified=false due to infrastructure, not fraud.
 */
export function handleVerificationResult(
  transactionId: number,
  verificationType: VerificationType,
  verified: boolean,
  error?: string
): void {
  const entry = pendingVerifications.get(transactionId);
  if (!entry) return;

  if (entry.challenge.verificationType !== verificationType) {
    console.warn(
      `[verify] txn #${transactionId}: mismatched verificationType -- expected ${entry.challenge.verificationType}, got ${verificationType}`
    );
    return;
  }

  // Cancel attempt timeout (real response arrived)
  if (entry.attemptTimer) {
    clearTimeout(entry.attemptTimer);
    entry.attemptTimer = null;
  }

  if (entry.retryTimer) {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  }

  if (verified) {
    pendingVerifications.delete(transactionId);
    entry.onSuccess();
    return;
  }

  // verified=false: distinguish infra error (soft) from definitive fraud (hard).
  // error present = soft failure (like timeout); no error = hard failure (fraud).
  handleAttemptFailure(entry, !!error);
}

/**
 * Re-send any pending verification challenge for a user who just reconnected.
 * Called from the report_version handler.
 */
export function resendPendingVerificationsForUser(userId: number): void {
  for (const entry of pendingVerifications.values()) {
    if (entry.verifyingUserId === userId) {
      sendChallenge(entry);
    }
  }
}

/** Returns true if a verification is currently pending for this transaction. */
export function isVerificationPending(transactionId: number): boolean {
  return pendingVerifications.has(transactionId);
}

/** Cancel and clean up any pending verification for a transaction (e.g. on txn fail). */
export function cancelVerification(transactionId: number): void {
  const entry = pendingVerifications.get(transactionId);
  if (!entry) return;
  if (entry.retryTimer) clearTimeout(entry.retryTimer);
  if (entry.attemptTimer) clearTimeout(entry.attemptTimer);
  pendingVerifications.delete(transactionId);
}

/**
 * Common failure path for both definitive verified=false, infra errors, and timeouts.
 * wasSoft = true for timeouts and infra errors; false for definitive fraud.
 * Schedules a retry or calls the appropriate end callback.
 */
function handleAttemptFailure(entry: PendingVerification, wasSoft: boolean): void {
  if (entry.retryTimer) {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  }

  if (wasSoft) {
    entry.softFailCount++;
    console.log(
      `[verify] txn #${entry.transactionId}: attempt ${entry.attemptNumber} soft-failed (${entry.softFailCount}/3)`
    );
  }

  if (entry.attemptNumber < 3) {
    const delay = RETRY_DELAYS_MS[entry.attemptNumber - 1]; // index 0=1s after attempt 1, 1=3s after attempt 2
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      entry.attemptNumber++;
      sendChallenge(entry);
    }, delay);
  } else {
    // All 3 attempts exhausted. If every failure was soft (timeout or infra error),
    // call onTimeout to park. If any was a hard verified=false, call onFail (suspend).
    const allSoft = entry.softFailCount >= 3;
    pendingVerifications.delete(entry.transactionId);
    if (allSoft && entry.onTimeout) {
      console.log(
        `[verify] txn #${entry.transactionId}: all 3 attempts soft-failed, calling onTimeout (park)`
      );
      entry.onTimeout();
    } else {
      entry.onFail();
    }
  }
}

function sendChallenge(entry: PendingVerification): void {
  // Clear any existing timers (e.g. from a previous sendChallenge on reconnect).
  // retryTimer must be cleared too: if a reconnect triggers resendPendingVerificationsForUser
  // while a retry delay is running, the old timer would fire and send a duplicate attempt.
  if (entry.attemptTimer) {
    clearTimeout(entry.attemptTimer);
    entry.attemptTimer = null;
  }
  if (entry.retryTimer) {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  }

  if (!isUserOnline(entry.verifyingUserId)) {
    // User is offline -- challenge will be re-sent when they reconnect.
    // No attempt timer: the reconnect handler will call resendPendingVerificationsForUser
    // which re-enters sendChallenge and starts the timer then.
    console.log(
      `[verify] txn #${entry.transactionId}: verifying user ${entry.verifyingUserId} offline, queued for reconnect`
    );
    return;
  }

  // Start per-attempt timeout
  entry.attemptTimer = setTimeout(() => {
    entry.attemptTimer = null;
    handleAttemptFailure(entry, true);
  }, ATTEMPT_TIMEOUT_MS);

  // Look up verifying user's UTC offset from DB for message timestamp checks
  const utcOffset = getUserUtcOffset(entry.verifyingUserId);

  sendToUser(entry.verifyingUserId, {
    type: "verify_transfer",
    payload: {
      transactionId: entry.transactionId,
      verificationType: entry.challenge.verificationType,
      attemptNumber: entry.attemptNumber,
      senderMhUserId: entry.challenge.senderMhUserId,
      itemDisplayName: entry.challenge.itemDisplayName,
      quantity: entry.challenge.quantity,
      transferTimestampUtc: entry.challenge.transferTimestampUtc,
      mapId: entry.challenge.mapId,
      expectedHunterSnUserId: entry.challenge.expectedHunterSnUserId,
      mapClass: entry.challenge.mapClass,
      expectedMapType: entry.challenge.expectedMapType,
      goal: entry.challenge.goal,
      goalKey: entry.challenge.goalKey,
      utcOffset,
    },
  });
}
