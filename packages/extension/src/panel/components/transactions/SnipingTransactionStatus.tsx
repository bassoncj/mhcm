import { useState } from "preact/hooks";
import type { SnipingTransaction, SnipingTransactionState } from "@mhcm/shared";
import { activeSnipingTransactions, recentlyFailedSnipingTxns } from "../../signals/sniping.js";
import { playerIdentity } from "../../signals/game-state.js";
import { IconEllipsis, IconX } from "../common/Icons.js";

function stateLabel(state: SnipingTransactionState, goalType: string): string {
  switch (state) {
    case "pending": return "Pending";
    case "inviting": return "Sending invite...";
    case "invite_sent": return "Invite sent";
    case "sniping": return "Sniping in progress...";
    case "verifying_goal_completed": return goalType === "item" ? "Verifying item found..." : "Verifying catch...";
    case "awaiting_payment": return goalType === "item" ? "All items found!" : "All mice caught!";
    case "pending_payment": return "Awaiting payment...";
    case "transferring": return "Transferring SB...";
    case "verifying_sb_receipt": return "Verifying payment...";
    case "awaiting_leave": return "Leaving map...";
    case "verifying_sniper_left": return "Verifying sniper left...";
    case "completed": return "Completed";
    case "failed": return "Failed";
    default: return state;
  }
}

/** Get unified goals list from a transaction regardless of goalType. */
function txnGoals(txn: SnipingTransaction): Array<{ id: number; name: string; thumbnail: string | null; price: number; completed: boolean; paid: boolean }> {
  if (txn.goalType === "item") {
    return (txn.items || []).map((i) => ({ id: i.itemTypeId, name: i.itemName, thumbnail: i.itemThumbnail, price: i.price, completed: i.found, paid: i.paid }));
  }
  return txn.mice.map((m) => ({ id: m.mouseTypeId, name: m.mouseName, thumbnail: m.mouseThumbnail, price: m.price, completed: m.caught, paid: m.paid }));
}

const STATE_PROGRESS: Record<SnipingTransactionState, number> = {
  pending: 0,
  inviting: 10,
  invite_sent: 20,
  sniping: 40,
  verifying_goal_completed: 45,
  awaiting_payment: 65,
  pending_payment: 65,
  transferring: 80,
  verifying_sb_receipt: 85,
  awaiting_leave: 90,
  verifying_sniper_left: 95,
  completed: 100,
  failed: 0,
};

const GOAL_PROGRESS_STATES = new Set<SnipingTransactionState>([
  "sniping", "pending_payment", "verifying_goal_completed", "verifying_sb_receipt",
]);

function getTxnProgress(txn: SnipingTransaction): number {
  let progress = STATE_PROGRESS[txn.state];
  const goals = txnGoals(txn);
  if (GOAL_PROGRESS_STATES.has(txn.state) && goals.length > 0) {
    const completedCount = goals.filter((g) => g.completed).length;
    const snipingBase = STATE_PROGRESS.sniping;
    const snipingEnd = STATE_PROGRESS.awaiting_leave;
    const isGroup = txn.mouseGroupId != null || txn.itemGroupId != null;
    if (isGroup) {
      progress = snipingBase + ((snipingEnd - snipingBase) * completedCount) / goals.length;
    } else {
      const paidCount = goals.filter((g) => g.paid).length;
      const subStepsDone = completedCount + paidCount;
      const totalSubSteps = goals.length * 2;
      progress = snipingBase + ((snipingEnd - snipingBase) * subStepsDone) / totalSubSteps;
    }
  }
  return progress;
}

function getParkedNotice(txn: SnipingTransaction): string | null {
  if (!txn.parked || !txn.parkedWaitingFor) return null;
  const mySnUserId = playerIdentity.value?.snUserId;
  if (!mySnUserId) return null;

  // In sniping: seller = sniper, buyer = maptain
  const isMaptain = txn.maptainMhSnUserId === mySnUserId;
  const isSniper = txn.sniperMhSnUserId === mySnUserId;
  const iAmActingParty =
    (txn.parkedWaitingFor === "seller" && isSniper) ||
    (txn.parkedWaitingFor === "buyer" && isMaptain);

  if (iAmActingParty) {
    return "Your connection was lost during this step. Refresh the MouseHunt page to continue.";
  }
  const waitingFor = txn.parkedWaitingFor === "seller" ? "sniper" : "maptain";
  return `Waiting for the ${waitingFor} to reconnect. No action needed on your end.`;
}

/** Compact per-transaction detail row shown inside the expanded drawer. */
function SnipingDetailCard({ txn }: { txn: SnipingTransaction }) {
  const goals = txnGoals(txn);
  const completedCount = goals.filter((g) => g.completed).length;
  const progress = getTxnProgress(txn);
  const groupName = txn.goalType === "item" ? txn.itemGroupName : txn.mouseGroupName;
  const goalLabel = txn.goalType === "item" ? "items" : "mice";
  const parkedNotice = getParkedNotice(txn);

  return (
    <div class="sniping-detail-card">
      <div class="sniping-detail-header">
        <span>#{txn.id}{groupName ? ` · ${groupName}` : ""} · {completedCount}/{goals.length} {goalLabel}</span>
        <span class="text-muted">{txn.totalPrice.toLocaleString()} SB</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p class="state-label">{stateLabel(txn.state, txn.goalType)}</p>
      {parkedNotice && (
        <div class="txn-parked-notice">
          {parkedNotice}
        </div>
      )}
      {goals.length > 0 && (
        <div class="sniping-mice-list">
          {goals.map((goal) => (
            <div key={goal.id} class="sniping-mouse-row">
              <span class={`mouse-status ${goal.paid ? "paid" : goal.completed ? "caught" : "hunting"}`}>
                {goal.paid ? "\u2713" : goal.completed ? "\u27F3" : "\u25CB"}
              </span>
              {goal.thumbnail && (
                <img class="mouse-thumb-sm" src={goal.thumbnail} alt="" />
              )}
              <span class="mouse-name">{goal.name}</span>
              <span class="mouse-price">{goal.price} SB</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FailedSnipingNotice({ txn }: { txn: SnipingTransaction }) {
  const goals = txnGoals(txn);
  const goalLabel = txn.goalType === "item" ? "items" : "mice";
  return (
    <div class="transaction-status failed-notice">
      <h3>Sniping #{txn.id} Failed</h3>
      <p class="state-label">{txn.failureReason || "Transaction failed"}</p>
      <p class="txn-details">
        <span>{goals.length} {goalLabel}</span>
        <span>Total: {txn.totalPrice.toLocaleString()} SB</span>
      </p>
    </div>
  );
}

export function SnipingTransactionStatus() {
  const [expanded, setExpanded] = useState(false);

  const activeTxns = activeSnipingTransactions.value.filter(
    (t) => t.state !== "completed" && t.state !== "failed"
  );
  const failedTxns = recentlyFailedSnipingTxns.value;

  // Reset expanded when no active txns
  if (activeTxns.length === 0 && expanded) {
    setExpanded(false);
  }

  if (activeTxns.length === 0 && failedTxns.length === 0) return null;

  // Aggregate stats across all active transactions
  const allGoals = activeTxns.map((t) => txnGoals(t));
  const totalGoals = allGoals.reduce((sum, g) => sum + g.length, 0);
  const totalCompleted = allGoals.reduce(
    (sum, g) => sum + g.filter((x) => x.completed).length,
    0
  );
  const totalSB = activeTxns.reduce((sum, t) => sum + t.totalPrice, 0);
  const sniperCount = activeTxns.length;
  const hasItems = activeTxns.some((t) => t.goalType === "item");
  const hasMice = activeTxns.some((t) => t.goalType === "mouse");
  const goalLabel = hasItems && hasMice ? "goals" : hasItems ? "items" : "mice";

  // Weighted average progress (by goal count)
  let overallProgress = 0;
  if (totalGoals > 0) {
    overallProgress = activeTxns.reduce(
      (sum, t, i) => sum + getTxnProgress(t) * allGoals[i].length,
      0
    ) / totalGoals;
  }

  return (
    <>
      {activeTxns.length > 0 && (
        <div class="sniping-summary" onClick={() => setExpanded(!expanded)}>
          <div class="sniping-summary-header">
            <h3>Sniping Active</h3>
            <button
              class="expand-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? <IconX size={14} /> : <IconEllipsis size={14} />}
            </button>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style={{ width: `${overallProgress}%` }} />
          </div>
          <p class="sniping-summary-stats">
            {sniperCount} sniper{sniperCount !== 1 ? "s" : ""} · {totalCompleted}/{totalGoals} {goalLabel} · {totalSB.toLocaleString()} SB
          </p>
          {expanded && (
            <div class="sniping-summary-drawer">
              {activeTxns.map((txn) => (
                <SnipingDetailCard key={txn.id} txn={txn} />
              ))}
            </div>
          )}
        </div>
      )}
      {failedTxns.map((txn) => (
        <FailedSnipingNotice key={`failed-${txn.id}`} txn={txn} />
      ))}
    </>
  );
}
