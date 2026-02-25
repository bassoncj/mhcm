import type { MapTransactionState } from "@mhcm/shared";
import { activeMapTransaction } from "../../signals/maps.js";

const STATE_LABELS: Record<MapTransactionState, string> = {
  pending: "Pending",
  risk_checking: "Checking goal risk...",
  validating_seller: "Validating seller...",
  validating_buyer: "Validating buyer...",
  transferring_sb: "Transferring SB...",
  opening_scroll: "Opening scroll...",
  inviting: "Sending invite...",
  accepting: "Accepting invite...",
  transferring_ownership: "Transferring ownership...",
  seller_leaving: "Seller leaving map...",
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
  transferring_sb: 25,
  opening_scroll: 40,
  inviting: 55,
  accepting: 70,
  transferring_ownership: 85,
  seller_leaving: 88,
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
    </div>
  );
}
