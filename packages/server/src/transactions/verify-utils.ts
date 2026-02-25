// Server-side cross-verification state machine.
// After a transaction step completes, the orchestrator calls startVerification()
// to challenge the non-executing party to independently confirm the outcome.
// Three attempts with exponential backoff; failure triggers onFail callback.

import type { VerificationType } from "@mhcm/shared";
import { sendToUser } from "../ws/connections.js";
import { isUserOnline } from "../ws/connections.js";
import { audit } from "../audit.js";

const RETRY_DELAYS_MS = [1_000, 3_000, 10_000] as const;

export interface VerifyChallenge {
  verificationType: VerificationType;
  /** Sender's numeric MH user ID (from p.php?id=X) – messages-API checks. */
  senderMhUserId?: string;
  /** Item display name as shown in the notification text – messages-API checks. */
  itemDisplayName?: string;
  /** Quantity – messages-API checks. */
  quantity?: number;
  /** ISO UTC timestamp when the transfer step completed – messages-API checks. */
  transferTimestampUtc?: string;
  /** Map ID – map-state checks. */
  mapId?: number;
  /** SN user ID of the hunter expected to be present/absent – map-state checks. */
  expectedHunterSnUserId?: string;
}

interface PendingVerification {
  transactionId: number;
  verifyingUserId: number;
  challenge: VerifyChallenge;
  /** Marketplace identifier for audit events. */
  marketplace: string;
  attemptNumber: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  onSuccess: () => void;
  onFail: () => void;
}

const pendingVerifications = new Map<number, PendingVerification>();

/**
 * Begin cross-verification for a completed transaction step.
 * Sends a challenge to verifyingUserId and retries up to 3 times on failure.
 * If the user is offline, the challenge is queued and sent on reconnect.
 */
export function startVerification(
  transactionId: number,
  verifyingUserId: number,
  marketplace: string,
  challenge: VerifyChallenge,
  onSuccess: () => void,
  onFail: () => void
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
    onSuccess,
    onFail,
  };
  pendingVerifications.set(transactionId, entry);

  sendChallenge(entry);
}

/**
 * Handle the result of a verify_transfer_result message.
 * verificationType is validated against the pending record as a sanity check.
 */
export function handleVerificationResult(
  transactionId: number,
  verificationType: VerificationType,
  verified: boolean
): void {
  const entry = pendingVerifications.get(transactionId);
  if (!entry) return;

  if (entry.challenge.verificationType !== verificationType) {
    console.warn(
      `[verify] txn #${transactionId}: mismatched verificationType – expected ${entry.challenge.verificationType}, got ${verificationType}`
    );
    return;
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

  // Verification failed – schedule retry or final failure
  if (entry.attemptNumber < 3) {
    const delay = RETRY_DELAYS_MS[entry.attemptNumber - 1]; // index 0=1s after attempt 1, 1=3s after attempt 2
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      entry.attemptNumber++;
      sendChallenge(entry);
    }, delay);
  } else {
    // All 3 attempts failed – wait 10s then call onFail
    entry.retryTimer = setTimeout(() => {
      pendingVerifications.delete(transactionId);
      audit("verification_failed", entry.verifyingUserId, {
        transactionId,
        marketplace: entry.marketplace,
        verificationType: entry.challenge.verificationType,
        attemptCount: 3,
      });
      entry.onFail();
    }, RETRY_DELAYS_MS[2]);
  }
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

/** Cancel and clean up any pending verification for a transaction (e.g. on txn fail). */
export function cancelVerification(transactionId: number): void {
  const entry = pendingVerifications.get(transactionId);
  if (!entry) return;
  if (entry.retryTimer) clearTimeout(entry.retryTimer);
  pendingVerifications.delete(transactionId);
}

function sendChallenge(entry: PendingVerification): void {
  if (!isUserOnline(entry.verifyingUserId)) {
    // User is offline – challenge will be re-sent when they reconnect
    console.log(
      `[verify] txn #${entry.transactionId}: verifying user ${entry.verifyingUserId} offline, queued for reconnect`
    );
    return;
  }

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
    },
  });
}