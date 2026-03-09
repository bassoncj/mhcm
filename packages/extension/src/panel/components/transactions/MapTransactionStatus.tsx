import type { MapTransactionState } from "@mhcm/shared";
import { activeMapTransaction } from "../../signals/maps.js";
import { currentUser } from "../../signals/auth.js";

const STATE_LABELS: Record<MapTransactionState, string> = {
  pending: "Pending",
  risk_checking: "Checking goal risk...",
  validating_seller: "Validating seller...",
  validating_buyer: "Validating buyer...",
  inviting: "Sending invite...",
  verifying_invite_sent: "Verifying invite...",
  verifying_map_valid: "Verifying map...",
  transferring_sb: "Transferring SB...",
  verifying_sb_receipt: "Verifying SB receipt...",
  verifying_map_free: "Verifying map availability...",
  opening_scroll: "Opening scroll...",
  verifying_scroll_opened: "Verifying scroll opened...",
  accepting: "Accepting invite...",
  transferring_ownership: "Transferring ownership...",
  verifying_ownership: "Verifying ownership...",
  seller_leaving: "Seller leaving map...",
  verifying_seller_left: "Verifying seller left...",
  reversing_sb: "Reversing SB...",
  cancelling_invite: "Cancelling invite...",
  pending_completion: "Awaiting completion...",
  completed: "Completed",
  failed: "Failed",
};

const STATE_PROGRESS: Record<MapTransactionState, number> = {
  pending: 0,
  risk_checking: 5,
  validating_seller: 10,
  validating_buyer: 15,
  inviting: 25,
  verifying_invite_sent: 30,
  verifying_map_valid: 33,
  transferring_sb: 40,
  verifying_sb_receipt: 45,
  verifying_map_free: 48,
  opening_scroll: 50,
  verifying_scroll_opened: 55,
  accepting: 60,
  transferring_ownership: 70,
  verifying_ownership: 80,
  seller_leaving: 85,
  verifying_seller_left: 88,
  reversing_sb: 50,
  cancelling_invite: 50,
  pending_completion: 90,
  completed: 100,
  failed: 0,
};

export function MapTransactionStatus() {
  const txn = activeMapTransaction.value;

  if (!txn) return null;

  const isActive = txn.state !== "completed" && txn.state !== "failed";

  if (!isActive) return null;

  const total = txn.price * txn.quantity;
  const modeLabel = txn.mode === "unopened" ? "Unopened" : "Completed";

  const userId = currentUser.value?.id;
  const isSellerViewing = userId === txn.sellerUserId;

  let parkedNotice: string | null = null;
  if (txn.parked && txn.parkedWaitingFor) {
    const iAmActingParty =
      (txn.parkedWaitingFor === "seller" && isSellerViewing) ||
      (txn.parkedWaitingFor === "buyer" && !isSellerViewing);

    if (iAmActingParty) {
      parkedNotice = "Your connection was lost during this step. Refresh the MouseHunt page to continue.";
    } else if (txn.state === "seller_leaving" && !isSellerViewing) {
      parkedNotice = "The seller hasn't left the map yet. If this continues, contact the mods on Discord for assistance.";
    } else {
      const waitingFor = txn.parkedWaitingFor === "seller" ? "seller" : "buyer";
      parkedNotice = `Waiting for the ${waitingFor} to reconnect. No action needed on your end.`;
    }
  }

  return (
    <div class="transaction-status active">
      <h3>
        Map Transaction #{txn.id} ({modeLabel})
      </h3>
      <div class="progress-bar">
        <div
          class="progress-fill"
          style={{ width: `${STATE_PROGRESS[txn.state]}%` }}
        />
      </div>
      <p class="state-label">{STATE_LABELS[txn.state]}</p>
      <div class="txn-details">
        <span>
          {txn.mapDisplayName} &times; {txn.quantity}
        </span>
        <span>Total: {total.toLocaleString()} SB</span>
      </div>
      {parkedNotice && (
        <div class="txn-parked-notice">
          {parkedNotice}
        </div>
      )}
    </div>
  );
}
