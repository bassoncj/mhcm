import type { ItemTransactionState } from "@mhcm/shared";
import { itemSbTotal } from "@mhcm/shared";
import { activeItemTransaction } from "../../signals/items.js";
import { currentUser } from "../../signals/auth.js";

const STATE_LABELS: Record<ItemTransactionState, string> = {
  pending: "Pending",
  validating: "Validating...",
  seller_transferring: "Transferring items...",
  verifying_item_receipt: "Verifying receipt...",
  buyer_transferring: "Transferring SB...",
  verifying_sb_receipt: "Verifying payment...",
  pending_payment: "Awaiting payment...",
  completed: "Completed",
  failed: "Failed",
};

const STATE_PROGRESS: Record<ItemTransactionState, number> = {
  pending: 0,
  validating: 15,
  seller_transferring: 40,
  verifying_item_receipt: 55,
  buyer_transferring: 70,
  verifying_sb_receipt: 85,
  pending_payment: 70,
  completed: 100,
  failed: 0,
};

export function ItemTransactionStatus() {
  const txn = activeItemTransaction.value;

  if (!txn) return null;

  const isActive =
    txn.state !== "completed" && txn.state !== "failed";

  if (!isActive) return null;

  const total = itemSbTotal(txn.price, txn.quantity);

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
      <h3>Item Transaction #{txn.id}</h3>
      <div class="progress-bar">
        <div
          class="progress-fill"
          style={{ width: `${STATE_PROGRESS[txn.state]}%` }}
        />
      </div>
      <p class="state-label">{STATE_LABELS[txn.state]}</p>
      <div class="txn-details">
        <span>{txn.itemName} &times; {txn.quantity.toLocaleString()}</span>
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
