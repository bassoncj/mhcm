import type { SlotTransactionState } from "@mhcm/shared";
import { activeTransaction } from "../../signals/slots.js";
import { currentUser } from "../../signals/auth.js";

const STATE_LABELS: Record<SlotTransactionState, string> = {
  pending: "Pending",
  risk_checking: "Checking goal risk...",
  validating: "Validating map...",
  inviting: "Sending invite...",
  invite_sent: "Invite sent",
  verifying_invite_sent: "Verifying invite received...",
  verifying_map_valid: "Verifying map...",
  accepting: "Accepting invite...",
  cancelling_invite: "Cancelling invite...",
  invite_accepted: "Invite accepted",
  transferring: "Transferring SB...",
  verifying_sb_receipt: "Verifying payment...",
  pending_payment: "Payment pending...",
  awaiting_map_completion: "Awaiting map completion...",
  claiming_chest: "Claiming chest...",
  opening_chest: "Opening chest...",
  transferring_rt: "Transferring RT items...",
  completed: "Completed",
  failed: "Failed",
};

const STATE_PROGRESS: Record<SlotTransactionState, number> = {
  pending: 0,
  risk_checking: 5,
  validating: 10,
  inviting: 25,
  invite_sent: 40,
  verifying_invite_sent: 45,
  verifying_map_valid: 48,
  accepting: 55,
  cancelling_invite: 50,
  invite_accepted: 70,
  transferring: 80,
  verifying_sb_receipt: 85,
  pending_payment: 80,
  awaiting_map_completion: 88,
  claiming_chest: 90,
  opening_chest: 93,
  transferring_rt: 96,
  completed: 100,
  failed: 0,
};

const RT_STATES: SlotTransactionState[] = [
  "awaiting_map_completion",
  "claiming_chest",
  "opening_chest",
  "transferring_rt",
];

export function SlotTransactionStatus() {
  const txn = activeTransaction.value;

  if (!txn) return null;

  const isActive =
    txn.state !== "completed" && txn.state !== "failed";

  if (!isActive) return null;

  const isRtPhase = RT_STATES.includes(txn.state);

  const userId = currentUser.value?.id;
  const isSellerViewing = userId === txn.sellerUserId;

  let parkedNotice: string | null = null;
  if (txn.parked && txn.parkedWaitingFor) {
    const iAmActingParty =
      (txn.parkedWaitingFor === "seller" && isSellerViewing) ||
      (txn.parkedWaitingFor === "buyer" && !isSellerViewing);

    if (iAmActingParty) {
      parkedNotice = "Your connection was lost during this step. Refresh the MouseHunt page to continue.";
    } else {
      const waitingFor = txn.parkedWaitingFor === "seller" ? "seller" : "buyer";
      parkedNotice = `Waiting for the ${waitingFor} to reconnect. No action needed on your end.`;
    }
  }

  return (
    <div class="transaction-status active">
      <h3>
        {isRtPhase ? "RT Active" : "Active Transaction"} #{txn.id}
        {txn.isRt && <span class="rt-star" title="Return Tradables">★</span>}
      </h3>
      <div class="progress-bar">
        <div
          class="progress-fill"
          style={{ width: `${STATE_PROGRESS[txn.state]}%` }}
        />
      </div>
      <p class="state-label">{STATE_LABELS[txn.state]}</p>
      <div class="txn-details">
        <span>{txn.quantity} slot(s) @ {txn.price} SB each</span>
        <span>Total: {txn.price * txn.quantity} SB</span>
      </div>
      {/* RT item progress when in transferring_rt state */}
      {txn.isRt && txn.rtItemsTotal != null && txn.rtItemsTotal > 0 && isRtPhase && (
        <div class="rt-item-progress">
          <span class="rt-progress-label">
            Items: {txn.rtItemsTransferred ?? 0}/{txn.rtItemsTotal}
          </span>
        </div>
      )}
      {parkedNotice && (
        <div class="txn-parked-notice">
          {parkedNotice}
        </div>
      )}
    </div>
  );
}
