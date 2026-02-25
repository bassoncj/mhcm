// Flow: pending → inviting → invite_sent → sniping → (per-goal payments)
//   → awaiting_leave → completed
// AFK: sniping → pending_payment → (resume on active) → sniping
// Insufficient SB: pending_payment → 24h grace → final retry or suspend

import type { SnipingTransaction, SnipingStepType, SnipingTransactionState } from "@mhcm/shared";
import { registerDrainableCounter } from "../drain.js";
import { SNIPING_STEP_TIMEOUT_MS, SNIPING_HUNT_TIMEOUT_MS, SNIPING_GRACE_PERIOD_MS } from "@mhcm/shared";
import { getDb } from "../db/connection.js";
import {
  findSnipingTransactionById,
  findSnipingTransactionMiceWithInfo,
  findSnipingTransactionItemsWithInfo,
  updateSnipingTransactionState,
  markMouseCaught,
  allMiceCaught,
  markMousePaid,
  allCaughtMicePaid,
  markItemFound,
  allItemsFound,
  markItemPaid,
  allFoundItemsPaid,
  recordSnipingPriceHistory,
  recordSnipingGroupPriceHistory,
  recordSnipingItemPriceHistory,
  recordSnipingItemGroupPriceHistory,
  findPendingSnipingTransactions,
  findPendingSnipingTransactionsByMaptain,
  findSnipingTransactionMice,
  findSnipingTransactionItems,
  isSniperOnMap,
  type SnipingTransactionRow,
} from "../db/queries/sniping-transactions.js";
import {
  updateSnipingOrderStatus,
  deprioritizeSnipingOrder,
  findSnipingOrdersByUser,
} from "../db/queries/sniping-orders.js";
import { sendToUser, isUserAfk } from "../ws/connections.js";
import { audit } from "../audit.js";
import { broadcastSnipingOrderBook, rowToSnipingOrder } from "../orders/sniping-book.js";
import { findSnipingGroupById, findSnipingItemGroupById } from "../db/queries/sniping-groups.js";
import { trySnipingMatch } from "../orders/sniping-matcher.js";
import { verboseLog } from "../settings.js";
import {
  createPaymentPenalty,
  resolvePaymentPenalty,
  findUnresolvedPenaltyForTxn,
} from "../db/queries/payment-penalties.js";
import { createSuspension } from "../db/queries/users.js";

function isGroupTransaction(row: SnipingTransactionRow): boolean {
  return row.mouse_group_id != null || row.item_group_id != null;
}

interface GoalRow {
  goalId: number;
  buyOrderId: number;
  sellOrderId: number;
  price: number;
  completed: boolean; // caught (mouse) or found (item)
  paid: boolean;
}

function getGoalRows(txnId: number, goalType: string): GoalRow[] {
  if (goalType === "item") {
    return findSnipingTransactionItems(txnId).map((i) => ({
      goalId: i.item_type_id,
      buyOrderId: i.buy_order_id,
      sellOrderId: i.sell_order_id,
      price: i.price,
      completed: !!i.found,
      paid: !!i.paid,
    }));
  }
  return findSnipingTransactionMice(txnId).map((m) => ({
    goalId: m.mouse_type_id,
    buyOrderId: m.buy_order_id,
    sellOrderId: m.sell_order_id,
    price: m.price,
    completed: !!m.caught,
    paid: !!m.paid,
  }));
}

function allGoalsCompleted(txnId: number, goalType: string): boolean {
  return goalType === "item" ? allItemsFound(txnId) : allMiceCaught(txnId);
}

function allCompletedGoalsPaid(txnId: number, goalType: string): boolean {
  return goalType === "item" ? allFoundItemsPaid(txnId) : allCaughtMicePaid(txnId);
}

function broadcastGoalOrderBook(goalType: string, goalId: number): void {
  if (goalType === "item") {
    broadcastSnipingOrderBook({ itemTypeId: goalId });
  } else {
    broadcastSnipingOrderBook({ mouseTypeId: goalId });
  }
}

export function rowToSnipingTransaction(
  row: SnipingTransactionRow
): SnipingTransaction {
  const goalType = (row.goal_type ?? "mouse") as SnipingTransaction["goalType"];

  const mouseGroup = row.mouse_group_id != null
    ? findSnipingGroupById(row.mouse_group_id)
    : undefined;
  const itemGroup = row.item_group_id != null
    ? findSnipingItemGroupById(row.item_group_id)
    : undefined;

  const mice = goalType === "mouse"
    ? findSnipingTransactionMiceWithInfo(row.id).map((m) => ({
        mouseTypeId: m.mouse_type_id,
        mouseName: m.mouse_name,
        mouseThumbnail: m.mouse_thumbnail,
        price: m.price,
        caught: m.caught === 1,
        caughtAt: m.caught_at ?? undefined,
        paid: m.paid === 1,
        paidAt: m.paid_at ?? undefined,
      }))
    : [];

  const items = goalType === "item"
    ? findSnipingTransactionItemsWithInfo(row.id).map((i) => ({
        itemTypeId: i.item_type_id,
        itemName: i.item_name,
        itemThumbnail: i.item_thumbnail,
        price: i.price,
        found: i.found === 1,
        foundAt: i.found_at ?? undefined,
        paid: i.paid === 1,
        paidAt: i.paid_at ?? undefined,
      }))
    : [];

  return {
    id: row.id,
    sniperUserId: row.sniper_user_id,
    maptainUserId: row.maptain_user_id,
    goalType,
    mhMapId: row.mh_map_id,
    totalPrice: row.total_price,
    state: row.state as SnipingTransactionState,
    sniperMhSnUserId: row.sniper_mh_sn_user_id,
    maptainMhSnUserId: row.maptain_mh_sn_user_id,
    failureReason: row.failure_reason ?? undefined,
    mouseGroupId: row.mouse_group_id ?? undefined,
    mouseGroupName: mouseGroup?.name,
    itemGroupId: row.item_group_id ?? undefined,
    itemGroupName: itemGroup?.name,
    mice,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const stepTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

/**
 * Track whether the sniper has left the map for a given transaction.
 * Set when sniper_left_map is received during any active state.
 * Checked when entering awaiting_leave to skip if already gone.
 */
const sniperLeftFlags = new Set<number>();

/**
 * Track which goalId each enqueued transfer is for (FIFO per txn).
 * Needed because the step result doesn't carry custom data back.
 */
const paymentMouseQueue = new Map<number, number[]>();
const paymentItemQueue = new Map<number, number[]>();

function getPaymentQueue(goalType: string, txnId: number): number[] {
  const map = goalType === "item" ? paymentItemQueue : paymentMouseQueue;
  return map.get(txnId) ?? [];
}

function setPaymentQueue(goalType: string, txnId: number, queue: number[]): void {
  const map = goalType === "item" ? paymentItemQueue : paymentMouseQueue;
  map.set(txnId, queue);
}

function deletePaymentQueue(goalType: string, txnId: number): void {
  const map = goalType === "item" ? paymentItemQueue : paymentMouseQueue;
  map.delete(txnId);
}

/**
 * Enqueue SB transfer steps for all unpaid-but-completed goals in a transaction.
 * Populates the appropriate payment queue (mouse or item) and enqueues steps.
 * Used by resumePendingPayments, handleGraceExpired, and cleanupStuckSnipingTransactions.
 */
function enqueueGoalPaymentTransfers(row: SnipingTransactionRow, unpaid: GoalRow[]): void {
  const gt = row.goal_type ?? "mouse";
  const queue: number[] = [];
  for (const g of unpaid) {
    queue.push(g.goalId);
    enqueueStep(row.maptain_user_id, row.id, "sniping_transfer_sb", {
      targetSnUserId: row.sniper_mh_sn_user_id,
      amount: g.price,
    });
  }
  setPaymentQueue(gt, row.id, queue);
}

const pendingPaymentGoals = new Map<number, Set<number>>();

const graceTimers = new Map<number, ReturnType<typeof setTimeout>>();

/** Active grace periods: txnId → penalty row id. */
const activeGracePeriods = new Map<number, number>();

/** Txns in last-chance retry after 24h grace expired. */
const finalAttemptTxns = new Set<number>();

interface QueuedStep {
  txnId: number;
  userId: number;
  step: SnipingStepType;
  data: Record<string, unknown>;
}

const inflightStep = new Map<number, number>();
const stepQueue = new Map<number, QueuedStep[]>();

function enqueueStep(
  userId: number,
  txnId: number,
  step: SnipingStepType,
  data: Record<string, unknown>
): void {
  if (inflightStep.has(userId)) {
    verboseLog("snipe-orch", `ENQUEUE step=${step} for user ${userId}, txn #${txnId} – queued (inflight txn #${inflightStep.get(userId)})`);
    const queue = stepQueue.get(userId) ?? [];
    queue.push({ txnId, userId, step, data });
    stepQueue.set(userId, queue);
    return;
  }
  verboseLog("snipe-orch", `ENQUEUE step=${step} for user ${userId}, txn #${txnId} – sending immediately`);
  doSendStep(userId, txnId, step, data);
}

function doSendStep(
  userId: number,
  txnId: number,
  step: SnipingStepType,
  data: Record<string, unknown>
): void {
  verboseLog("snipe-orch", `SEND STEP: step=${step} → user ${userId}, txn #${txnId}, data=${JSON.stringify(data)}`);
  inflightStep.set(userId, txnId);
  sendToUser(userId, {
    type: "sniping_execute_step",
    payload: { transactionId: txnId, step, data },
  });
  setStepTimeout(txnId);
}

function drainUserQueue(userId: number): void {
  if (inflightStep.has(userId)) return;

  const queue = stepQueue.get(userId);
  if (!queue || queue.length === 0) return;

  const next = queue.shift()!;
  if (queue.length === 0) stepQueue.delete(userId);

  const row = findSnipingTransactionById(next.txnId);
  if (!row || row.state === "completed" || row.state === "failed") {
    verboseLog("snipe-orch", `DRAIN user ${userId}: skipping queued step=${next.step} for txn #${next.txnId} (state=${row?.state ?? "not found"})`);
    drainUserQueue(userId);
    return;
  }

  verboseLog("snipe-orch", `DRAIN user ${userId}: sending queued step=${next.step} for txn #${next.txnId}`);
  doSendStep(userId, next.txnId, next.step, next.data);
}

function purgeQueuedStepsForTxn(userId: number, txnId: number): void {
  const queue = stepQueue.get(userId);
  if (!queue) return;
  const filtered = queue.filter((s) => s.txnId !== txnId);
  if (filtered.length === 0) {
    stepQueue.delete(userId);
  } else {
    stepQueue.set(userId, filtered);
  }
}

function getStepUserId(step: SnipingStepType, row: SnipingTransactionRow): number {
  switch (step) {
    case "sniping_send_invite":
    case "sniping_transfer_sb":
      return row.maptain_user_id;
    case "sniping_accept_invite":
    case "sniping_leave_map":
      return row.sniper_user_id;
  }
}

export function startSnipingTransaction(txnId: number): void {
  const row = findSnipingTransactionById(txnId);
  if (!row || row.state !== "pending") return;

  verboseLog("snipe-orch", `START txn #${txnId}: sniper=user${row.sniper_user_id}, maptain=user${row.maptain_user_id}, map=${row.mh_map_id}, goalType=${row.goal_type}`);

  const txn = rowToSnipingTransaction(row);

  sendToUser(txn.sniperUserId, {
    type: "sniping_transaction_update",
    payload: { transaction: txn },
  });
  sendToUser(txn.maptainUserId, {
    type: "sniping_transaction_update",
    payload: { transaction: txn },
  });

  const activeStatuses = ["open", "paused", "matched", "in_progress"] as const;
  for (const uid of [txn.sniperUserId, txn.maptainUserId]) {
    const rows = findSnipingOrdersByUser(uid, [...activeStatuses]);
    sendToUser(uid, {
      type: "my_sniping_orders",
      payload: { orders: rows.map(rowToSnipingOrder) },
    });
  }

  // If sniper is already on this map (from another active transaction),
  // skip the invite flow entirely – go straight to sniping.
  const alreadyOnMap = isSniperOnMap(row.sniper_user_id, row.mh_map_id, txnId);
  verboseLog("snipe-orch", `  isSniperOnMap(${row.sniper_user_id}, ${row.mh_map_id}, ${txnId}) = ${alreadyOnMap}`);
  if (alreadyOnMap) {
    verboseLog("snipe-orch", `  → advancing to sniping (skip invite)`);
    advanceState(txnId, "sniping");
  } else {
    verboseLog("snipe-orch", `  → advancing to inviting`);
    advanceState(txnId, "inviting");
  }
}

export function handleSnipingStepResult(payload: {
  transactionId: number;
  step: SnipingStepType;
  success: boolean;
  error?: string;
  code?: string;
  sbBalance?: number;
}): void {
  const { transactionId, step, success, error, code } = payload;

  clearStepTimeout(transactionId);

  const row = findSnipingTransactionById(transactionId);
  if (!row) return;

  const stepUserId = getStepUserId(step, row);
  inflightStep.delete(stepUserId);

  verboseLog("snipe-orch", `STEP RESULT txn #${transactionId}: step=${step}, success=${success}${error ? `, error=${error}` : ""}${code ? `, code=${code}` : ""}, state=${row.state}, user=${stepUserId}`);

  if (!success) {
    if (step === "sniping_send_invite" && code === "map_full") {
      failSnipingTransaction(transactionId, "map_full");
    } else if (step === "sniping_transfer_sb" && code === "insufficient_sb") {
      handleInsufficientSb(transactionId, payload.sbBalance ?? null);
    } else if (step === "sniping_transfer_sb" && finalAttemptTxns.has(transactionId)) {
      // Grace period expired, final retry also failed – suspend maptain
      suspendAndFail(transactionId);
    } else {
      failSnipingTransaction(transactionId, `Step ${step} failed: ${error || "unknown"}`);
    }
    drainUserQueue(stepUserId);
    return;
  }

  switch (step) {
    case "sniping_send_invite":
      if (row.state === "inviting") {
        advanceState(transactionId, "invite_sent");
      } else {
        verboseLog("snipe-orch", `  ignoring: state is ${row.state}, expected inviting`);
      }
      break;
    case "sniping_accept_invite":
      if (row.state === "invite_sent") {
        advanceState(transactionId, "sniping");
      } else {
        verboseLog("snipe-orch", `  ignoring: state is ${row.state}, expected invite_sent`);
      }
      break;
    case "sniping_transfer_sb":
      if (row.state === "sniping" || row.state === "pending_payment") {
        handlePaymentCompleted(transactionId);
      } else if (row.state === "transferring") {
        // Group payment path
        advanceState(transactionId, "awaiting_leave");
      } else {
        verboseLog("snipe-orch", `  ignoring: state is ${row.state}, expected sniping/pending_payment or transferring`);
      }
      break;
    case "sniping_leave_map":
      if (row.state === "awaiting_leave") {
        completeSnipingTransaction(transactionId);
      } else {
        verboseLog("snipe-orch", `  ignoring: state is ${row.state}, expected awaiting_leave`);
      }
      break;
  }

  drainUserQueue(stepUserId);
}

export function handleGoalCompleted(
  transactionId: number,
  goalType: "mouse" | "item",
  goalId: number
): void {
  const row = findSnipingTransactionById(transactionId);
  if (!row || (row.state !== "sniping" && row.state !== "pending_payment")) {
    verboseLog("snipe-orch", `GOAL COMPLETED txn #${transactionId}: ${goalType}=${goalId} – ignored (state=${row?.state ?? "not found"})`);
    return;
  }

  // Mark goal as caught/found in the DB
  const marked = goalType === "mouse"
    ? markMouseCaught(transactionId, goalId)
    : markItemFound(transactionId, goalId);
  if (!marked) {
    verboseLog("snipe-orch", `GOAL COMPLETED txn #${transactionId}: ${goalType}=${goalId} – already marked or unknown`);
    return;
  }

  verboseLog("snipe-orch", `GOAL COMPLETED txn #${transactionId}: ${goalType}=${goalId} – marked!`);

  // WS messages must stay distinct per goal type (typed payloads)
  if (goalType === "mouse") {
    const msg = { type: "sniping_mouse_caught" as const, payload: { transactionId, mouseTypeId: goalId } };
    sendToUser(row.sniper_user_id, msg);
    sendToUser(row.maptain_user_id, msg);
  } else {
    const msg = { type: "sniping_item_found" as const, payload: { transactionId, itemTypeId: goalId } };
    sendToUser(row.sniper_user_id, msg);
    sendToUser(row.maptain_user_id, msg);
  }

  broadcastSnipingTransactionUpdate(transactionId);

  if (isGroupTransaction(row)) {
    if (allGoalsCompleted(transactionId, goalType)) {
      verboseLog("snipe-orch", `  [group] all goals completed – advancing to awaiting_payment`);
      clearStepTimeout(transactionId);
      advanceState(transactionId, "awaiting_payment");
    } else {
      verboseLog("snipe-orch", `  [group] more goals remain – re-arming hunt timeout`);
      if (row.state === "sniping") setHuntTimeout(transactionId);
    }
  } else {
    if (isUserAfk(row.maptain_user_id)) {
      verboseLog("snipe-orch", `  maptain AFK – deferring payment for ${goalType}=${goalId}`);
      const pending = pendingPaymentGoals.get(transactionId) ?? new Set();
      pending.add(goalId);
      pendingPaymentGoals.set(transactionId, pending);
      if (row.state === "sniping") {
        advanceState(transactionId, "pending_payment");
      }
    } else {
      const goals = getGoalRows(transactionId, goalType);
      const goal = goals.find((g) => g.goalId === goalId);
      if (goal) {
        const queue = getPaymentQueue(goalType, transactionId);
        queue.push(goalId);
        setPaymentQueue(goalType, transactionId, queue);

        verboseLog("snipe-orch", `  enqueueStep: sniping_transfer_sb for ${goalType}=${goalId}, amount=${goal.price}`);
        enqueueStep(row.maptain_user_id, transactionId, "sniping_transfer_sb", {
          targetSnUserId: row.sniper_mh_sn_user_id,
          amount: goal.price,
        });
      }
    }

    if (allGoalsCompleted(transactionId, goalType)) {
      verboseLog("snipe-orch", `  all goals completed – clearing hunt timeout, waiting for payments`);
      clearStepTimeout(transactionId);
    }
  }
}

export function handleSniperLeftMap(transactionId: number): void {
  const row = findSnipingTransactionById(transactionId);
  if (!row) return;

  const gt = row.goal_type ?? "mouse";
  verboseLog("snipe-orch", `SNIPER LEFT txn #${transactionId}: state=${row.state}, goalType=${gt}`);

  if (row.state === "sniping") {
    sniperLeftFlags.add(transactionId);
    clearStepTimeout(transactionId);

    if (isGroupTransaction(row)) {
      if (allGoalsCompleted(transactionId, gt)) {
        verboseLog("snipe-orch", `  [group] all completed – advancing to awaiting_payment`);
        advanceState(transactionId, "awaiting_payment");
      } else {
        verboseLog("snipe-orch", `  [group] not all completed – failing (all-or-nothing)`);
        failSnipingTransaction(transactionId, "sniper_abandoned");
      }
    } else {
      const goals = getGoalRows(transactionId, gt);
      const completedCount = goals.filter((g) => g.completed).length;

      if (completedCount === 0) {
        verboseLog("snipe-orch", `  no goals completed – failing as sniper_abandoned`);
        failSnipingTransaction(transactionId, "sniper_abandoned");
      } else if (allGoalsCompleted(transactionId, gt) && allCompletedGoalsPaid(transactionId, gt)) {
        verboseLog("snipe-orch", `  all completed and paid – advancing to awaiting_leave`);
        advanceState(transactionId, "awaiting_leave");
      } else {
        verboseLog("snipe-orch", `  ${completedCount} completed, waiting for pending payments to complete`);
      }
    }
  } else if (row.state === "awaiting_leave") {
    verboseLog("snipe-orch", `  sniper left during awaiting_leave – completing`);
    clearStepTimeout(transactionId);
    completeSnipingTransaction(transactionId);
  } else if (row.state === "pending_payment") {
    // Sniper leaving while parked: there are always >= 1 completed goals
    sniperLeftFlags.add(transactionId);

    if (isGroupTransaction(row)) {
      if (allGoalsCompleted(transactionId, gt)) {
        verboseLog("snipe-orch", `  [pending_payment, group] all goals completed – staying parked, sniper flagged`);
      } else {
        verboseLog("snipe-orch", `  [pending_payment, group] partial goals – failing (all-or-nothing)`);
        failSnipingTransaction(transactionId, "sniper_abandoned");
      }
    } else {
      verboseLog("snipe-orch", `  [pending_payment, individual] sniper flagged – staying parked (debt exists)`);
    }
  } else if (
    row.state === "awaiting_payment" ||
    row.state === "transferring"
  ) {
    verboseLog("snipe-orch", `  flagging sniperLeftFlags (during ${row.state})`);
    sniperLeftFlags.add(transactionId);
  }
}

function advanceState(
  txnId: number,
  newState: SnipingTransactionState
): void {
  const row = findSnipingTransactionById(txnId);
  if (!row) return;

  verboseLog("snipe-orch", `ADVANCE txn #${txnId}: ${row.state} → ${newState}`);

  updateSnipingTransactionState(txnId, newState);

  audit("sniping_transaction_state_change", undefined, {
    transactionId: txnId,
    fromState: row.state,
    toState: newState,
  });

  const txn = rowToSnipingTransaction({ ...row, state: newState } as SnipingTransactionRow);
  broadcastSnipingTransactionUpdateMsg(txn);

  switch (newState) {
    case "inviting":
      verboseLog("snipe-orch", `  enqueueStep: sniping_send_invite → maptain user${row.maptain_user_id}`);
      enqueueStep(row.maptain_user_id, txnId, "sniping_send_invite", {
        mhMapId: row.mh_map_id,
        sniperSnUserId: row.sniper_mh_sn_user_id,
      });
      break;

    case "invite_sent":
      verboseLog("snipe-orch", `  enqueueStep: sniping_accept_invite → sniper user${row.sniper_user_id}`);
      enqueueStep(row.sniper_user_id, txnId, "sniping_accept_invite", {
        mhMapId: row.mh_map_id,
      });
      break;

    case "sniping": {
      verboseLog("snipe-orch", `  hunt timeout set (${SNIPING_HUNT_TIMEOUT_MS}ms)`);
      setHuntTimeout(txnId);
      const goals = getGoalRows(txnId, row.goal_type ?? "mouse");
      const buyIds = goals.map((g) => g.buyOrderId);
      const sellIds = goals.map((g) => g.sellOrderId);
      verboseLog("snipe-orch", `  orders set to in_progress: buys=[${buyIds}], sells=[${sellIds}]`);
      for (const g of goals) {
        updateSnipingOrderStatus(g.buyOrderId, "in_progress");
        updateSnipingOrderStatus(g.sellOrderId, "in_progress");
      }
      break;
    }

    case "awaiting_payment":
      if (isUserAfk(row.maptain_user_id)) {
        verboseLog("snipe-orch", `  maptain AFK – parking as pending_payment`);
        advanceState(txnId, "pending_payment");
      } else {
        verboseLog("snipe-orch", `  immediately advancing to transferring`);
        advanceState(txnId, "transferring");
      }
      break;

    case "pending_payment":
      // Resumes via handleUserActiveFromAfk → resumePendingPayments
      verboseLog("snipe-orch", `  parked – waiting for maptain to come online`);
      break;

    case "transferring":
      verboseLog("snipe-orch", `  enqueueStep: sniping_transfer_sb → maptain user${row.maptain_user_id}, amount=${row.total_price}`);
      enqueueStep(row.maptain_user_id, txnId, "sniping_transfer_sb", {
        targetSnUserId: row.sniper_mh_sn_user_id,
        amount: row.total_price,
      });
      break;

    case "awaiting_leave": {
      const hasLeftFlag = sniperLeftFlags.has(txnId);
      const otherTxnOnMap = isSniperOnMap(row.sniper_user_id, row.mh_map_id, txnId);
      verboseLog("snipe-orch", `  sniperLeftFlags.has=${hasLeftFlag}, isSniperOnMap=${otherTxnOnMap}`);
      if (hasLeftFlag) {
        verboseLog("snipe-orch", `  → completing (sniper already left)`);
        sniperLeftFlags.delete(txnId);
        completeSnipingTransaction(txnId);
      } else if (otherTxnOnMap) {
        verboseLog("snipe-orch", `  → completing (sniper has other txns on this map)`);
        completeSnipingTransaction(txnId);
      } else {
        verboseLog("snipe-orch", `  → enqueueStep: sniping_leave_map → sniper user${row.sniper_user_id}`);
        enqueueStep(row.sniper_user_id, txnId, "sniping_leave_map", {
          mhMapId: row.mh_map_id,
        });
      }
      break;
    }
  }
}

function completeSnipingTransaction(txnId: number): void {
  verboseLog("snipe-orch", `COMPLETE txn #${txnId}`);
  clearStepTimeout(txnId);
  sniperLeftFlags.delete(txnId);
  paymentMouseQueue.delete(txnId);
  paymentItemQueue.delete(txnId);
  pendingPaymentGoals.delete(txnId);
  clearGraceTimer(txnId);
  activeGracePeriods.delete(txnId);
  finalAttemptTxns.delete(txnId);

  const preRow = findSnipingTransactionById(txnId);
  if (!preRow) return;
  const gt = preRow.goal_type ?? "mouse";

  const goals = getGoalRows(txnId, gt);

  const paidTotal = goals.filter((g) => g.paid).reduce((sum, g) => sum + g.price, 0);
  updateSnipingTransactionTotalPrice(txnId, paidTotal);

  updateSnipingTransactionState(txnId, "completed");

  const row = findSnipingTransactionById(txnId);
  if (!row) return;

  const txn = rowToSnipingTransaction(row);
  broadcastSnipingTransactionUpdateMsg(txn);

  audit("sniping_transaction_completed", undefined, {
    transactionId: txnId,
    sniperUserId: row.sniper_user_id,
    maptainUserId: row.maptain_user_id,
    totalPrice: paidTotal,
  });

  if (isGroupTransaction(row)) {
    if (gt === "item" && row.item_group_id != null) {
      recordSnipingItemGroupPriceHistory(row.item_group_id, row.total_price);
    } else if (row.mouse_group_id != null) {
      recordSnipingGroupPriceHistory(row.mouse_group_id, row.total_price);
    }

    for (const g of goals) {
      updateSnipingOrderStatus(g.buyOrderId, "completed");
      updateSnipingOrderStatus(g.sellOrderId, "completed");
    }

    if (gt === "item" && row.item_group_id != null) {
      broadcastSnipingOrderBook({ itemGroupId: row.item_group_id });
    } else if (row.mouse_group_id != null) {
      broadcastSnipingOrderBook({ mouseGroupId: row.mouse_group_id });
    }
  } else {
    const goalIds = new Set<number>();
    for (const g of goals) {
      if (g.paid) {
        updateSnipingOrderStatus(g.buyOrderId, "completed");
        updateSnipingOrderStatus(g.sellOrderId, "completed");
      } else if (g.completed) {
        // Completed but unpaid (legacy path) – complete anyway
        updateSnipingOrderStatus(g.buyOrderId, "completed");
        updateSnipingOrderStatus(g.sellOrderId, "completed");
      } else {
        // Not completed – reopen buy, cancel sell (sniper left)
        updateSnipingOrderStatus(g.buyOrderId, "open");
        updateSnipingOrderStatus(g.sellOrderId, "cancelled");
      }
      goalIds.add(g.goalId);
    }

    for (const goalId of goalIds) {
      broadcastGoalOrderBook(gt, goalId);
    }
  }
}

function failSnipingTransaction(txnId: number, reason: string): void {
  verboseLog("snipe-orch", `FAIL txn #${txnId}: reason=${reason}`);
  clearStepTimeout(txnId);
  sniperLeftFlags.delete(txnId);
  paymentMouseQueue.delete(txnId);
  paymentItemQueue.delete(txnId);
  pendingPaymentGoals.delete(txnId);
  clearGraceTimer(txnId);
  activeGracePeriods.delete(txnId);
  finalAttemptTxns.delete(txnId);

  const preRow = findSnipingTransactionById(txnId);
  if (!preRow) return;
  const gt = preRow.goal_type ?? "mouse";

  const goals = getGoalRows(txnId, gt);

  const paidTotal = goals.filter((g) => g.paid).reduce((sum, g) => sum + g.price, 0);
  updateSnipingTransactionTotalPrice(txnId, paidTotal);

  updateSnipingTransactionState(txnId, "failed", reason);

  const row = findSnipingTransactionById(txnId);
  if (!row) return;

  const txn = rowToSnipingTransaction(row);
  broadcastSnipingTransactionUpdateMsg(txn);

  audit("sniping_transaction_failed", undefined, {
    transactionId: txnId,
    sniperUserId: row.sniper_user_id,
    maptainUserId: row.maptain_user_id,
    reason,
  });

  if (isGroupTransaction(row)) {
    const firstGoal = goals[0];
    if (firstGoal) {
      if (reason === "sniper_abandoned") {
        updateSnipingOrderStatus(firstGoal.buyOrderId, "open");
        updateSnipingOrderStatus(firstGoal.sellOrderId, "cancelled");
      } else if (reason === "map_full") {
        updateSnipingOrderStatus(firstGoal.buyOrderId, "cancelled");
        updateSnipingOrderStatus(firstGoal.sellOrderId, "open");
        deprioritizeSnipingOrder(firstGoal.sellOrderId);
      } else {
        updateSnipingOrderStatus(firstGoal.buyOrderId, "open");
        updateSnipingOrderStatus(firstGoal.sellOrderId, "open");
        deprioritizeSnipingOrder(firstGoal.sellOrderId);
      }
    }

    if (gt === "item" && row.item_group_id != null) {
      queueMicrotask(() => broadcastSnipingOrderBook({ itemGroupId: row.item_group_id! }));
    } else if (row.mouse_group_id != null) {
      queueMicrotask(() => broadcastSnipingOrderBook({ mouseGroupId: row.mouse_group_id! }));
    }
  } else {
    const goalIds = new Set<number>();

    for (const g of goals) {
      if (g.paid) {
        verboseLog("snipe-orch", `  goal ${g.goalId} was paid – orders already completed`);
      } else {
        if (reason === "sniper_abandoned") {
          updateSnipingOrderStatus(g.buyOrderId, "open");
          verboseLog("snipe-orch", `  sell order #${g.sellOrderId} → cancelled (abandoned)`);
          updateSnipingOrderStatus(g.sellOrderId, "cancelled");
        } else if (reason === "map_full") {
          verboseLog("snipe-orch", `  buy order #${g.buyOrderId} → cancelled (map_full), sell order #${g.sellOrderId} → open`);
          updateSnipingOrderStatus(g.buyOrderId, "cancelled");
          updateSnipingOrderStatus(g.sellOrderId, "open");
          deprioritizeSnipingOrder(g.sellOrderId);
        } else {
          updateSnipingOrderStatus(g.buyOrderId, "open");
          verboseLog("snipe-orch", `  sell order #${g.sellOrderId} → open + deprioritized`);
          updateSnipingOrderStatus(g.sellOrderId, "open");
          deprioritizeSnipingOrder(g.sellOrderId);
        }
      }
      goalIds.add(g.goalId);
    }

    for (const goalId of goalIds) {
      queueMicrotask(() => broadcastGoalOrderBook(gt, goalId));
    }
  }
}

function handlePaymentCompleted(txnId: number): void {
  const row = findSnipingTransactionById(txnId);
  if (!row) return;
  const gt = (row.goal_type ?? "mouse") as "mouse" | "item";

  const queue = getPaymentQueue(gt, txnId);
  const goalId = queue.shift();
  if (queue.length === 0) deletePaymentQueue(gt, txnId);

  if (goalId == null) {
    verboseLog("snipe-orch", `PAYMENT COMPLETED txn #${txnId}: no ${gt} in queue – ignoring`);
    return;
  }

  // Mark goal as paid in the DB
  if (gt === "mouse") markMousePaid(txnId, goalId);
  else markItemPaid(txnId, goalId);
  verboseLog("snipe-orch", `PAYMENT COMPLETED txn #${txnId}: ${gt}=${goalId} marked paid`);

  finalAttemptTxns.delete(txnId);
  resolveGracePenaltyIfActive(txnId, "paid");

  // Record price history and complete the individual order pair
  const goals = getGoalRows(txnId, gt);
  const goal = goals.find((g) => g.goalId === goalId);
  if (goal) {
    if (gt === "mouse") {
      recordSnipingPriceHistory(goalId, goal.price);
      broadcastSnipingOrderBook({ mouseTypeId: goalId });
    } else {
      recordSnipingItemPriceHistory(goalId, goal.price);
      broadcastSnipingOrderBook({ itemTypeId: goalId });
    }
    updateSnipingOrderStatus(goal.buyOrderId, "completed");
    updateSnipingOrderStatus(goal.sellOrderId, "completed");
  }

  broadcastSnipingTransactionUpdate(txnId);

  const allDone = allGoalsCompleted(txnId, gt);
  const allPaid = allCompletedGoalsPaid(txnId, gt);

  if (allDone && allPaid) {
    verboseLog("snipe-orch", `  all completed and paid – advancing to awaiting_leave`);
    advanceState(txnId, "awaiting_leave");
  } else if (sniperLeftFlags.has(txnId) && allPaid) {
    verboseLog("snipe-orch", `  sniper left + all completed paid – completing`);
    completeSnipingTransaction(txnId);
  } else {
    if (!allDone) {
      setHuntTimeout(txnId);
    }
  }
}

function updateSnipingTransactionTotalPrice(txnId: number, totalPrice: number): void {
  getDb()
    .prepare("UPDATE sniping_transactions SET total_price = ?, updated_at = datetime('now') WHERE id = ?")
    .run(totalPrice, txnId);
}

function broadcastSnipingTransactionUpdate(txnId: number): void {
  const row = findSnipingTransactionById(txnId);
  if (!row) return;
  const txn = rowToSnipingTransaction(row);
  broadcastSnipingTransactionUpdateMsg(txn);
}

function broadcastSnipingTransactionUpdateMsg(txn: SnipingTransaction): void {
  sendToUser(txn.sniperUserId, {
    type: "sniping_transaction_update",
    payload: { transaction: txn },
  });
  sendToUser(txn.maptainUserId, {
    type: "sniping_transaction_update",
    payload: { transaction: txn },
  });
}

function setStepTimeout(txnId: number): void {
  clearStepTimeout(txnId);
  stepTimeouts.set(
    txnId,
    setTimeout(() => {
      stepTimeouts.delete(txnId);

      const row = findSnipingTransactionById(txnId);
      if (!row) return;

      const stepType = getStepForState(row.state);
      const userId = stepType ? getStepUserId(stepType, row) : null;

      verboseLog("snipe-orch", `STEP TIMEOUT txn #${txnId}: state=${row.state}, expectedStep=${stepType}, user=${userId}`);

      if (userId != null) {
        inflightStep.delete(userId);
      }

      failSnipingTransaction(txnId, "Step timed out");

      if (userId != null) {
        drainUserQueue(userId);
      }
    }, SNIPING_STEP_TIMEOUT_MS)
  );
}

function setHuntTimeout(txnId: number): void {
  clearStepTimeout(txnId);
  stepTimeouts.set(
    txnId,
    setTimeout(() => {
      stepTimeouts.delete(txnId);
      verboseLog("snipe-orch", `HUNT TIMEOUT txn #${txnId}: sniping phase timed out after ${SNIPING_HUNT_TIMEOUT_MS}ms`);
      failSnipingTransaction(txnId, "Sniping phase timed out");
    }, SNIPING_HUNT_TIMEOUT_MS)
  );
}

function clearStepTimeout(txnId: number): void {
  const timer = stepTimeouts.get(txnId);
  if (timer) {
    clearTimeout(timer);
    stepTimeouts.delete(txnId);
  }
}

function clearGraceTimer(txnId: number): void {
  const timer = graceTimers.get(txnId);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(txnId);
  }
}

function getStepForState(state: string): SnipingStepType | null {
  switch (state) {
    case "inviting":
      return "sniping_send_invite";
    case "invite_sent":
      return "sniping_accept_invite";
    case "sniping":
    case "awaiting_payment":
    case "transferring":
      return "sniping_transfer_sb";
    case "awaiting_leave":
      return "sniping_leave_map";
    default:
      return null;
  }
}

export function resumePendingPayments(maptainUserId: number): void {
  const parked = findPendingSnipingTransactionsByMaptain(maptainUserId);
  if (parked.length === 0) return;

  verboseLog("snipe-orch", `RESUME PENDING PAYMENTS: user ${maptainUserId} – ${parked.length} parked txn(s)`);

  for (const row of parked) {
    const gt = row.goal_type ?? "mouse";

    audit("sniping_payment_resumed", maptainUserId, {
      transactionId: row.id,
    });

    if (isGroupTransaction(row)) {
      verboseLog("snipe-orch", `  txn #${row.id} [group] → transferring`);
      advanceState(row.id, "transferring");
    } else {
      const goals = getGoalRows(row.id, gt);
      const unpaid = goals.filter((g) => g.completed && !g.paid);
      pendingPaymentGoals.delete(row.id);

      if (unpaid.length === 0) {
        verboseLog("snipe-orch", `  txn #${row.id} – no unpaid goals, checking completion`);
        if (allGoalsCompleted(row.id, gt)) {
          advanceState(row.id, "awaiting_leave");
        } else {
          advanceState(row.id, "sniping");
        }
        continue;
      }

      verboseLog("snipe-orch", `  txn #${row.id} – enqueuing ${unpaid.length} transfer(s)`);

      if (allGoalsCompleted(row.id, gt)) {
        // All goals done, just need to pay – stay in pending_payment state
        // until payments complete (handlePaymentCompleted will advance to awaiting_leave)
      } else {
        advanceState(row.id, "sniping");
      }

      enqueueGoalPaymentTransfers(row, unpaid);
    }
  }
}

/**
 * Creates a 24h grace period penalty and parks the transaction.
 */
function handleInsufficientSb(txnId: number, reportedBalance: number | null): void {
  const row = findSnipingTransactionById(txnId);
  if (!row) return;

  verboseLog("snipe-orch", `INSUFFICIENT SB txn #${txnId}: reported balance=${reportedBalance}`);

  // If a grace period is already active for this txn, just park – don't create a duplicate
  if (activeGracePeriods.has(txnId)) {
    verboseLog("snipe-orch", `  grace period already active – parking only`);
    if (row.state !== "pending_payment") {
      advanceState(txnId, "pending_payment");
    }
    return;
  }

  // Clear remaining queued steps so they don't fire while parked.
  // resumePendingPayments rebuilds from DB on resume.
  purgeQueuedStepsForTxn(row.maptain_user_id, txnId);
  paymentMouseQueue.delete(txnId);
  paymentItemQueue.delete(txnId);

  const gt = row.goal_type ?? "mouse";
  const goals = getGoalRows(txnId, gt);
  const requiredAmount = goals.filter((g) => g.completed && !g.paid).reduce((sum, g) => sum + g.price, 0);

  const graceExpiresAt = new Date(Date.now() + SNIPING_GRACE_PERIOD_MS).toISOString();
  const penalty = createPaymentPenalty({
    userId: row.maptain_user_id,
    transactionId: txnId,
    penaltyType: "insufficient_sb",
    reportedBalance,
    requiredAmount,
    graceExpiresAt,
  });

  activeGracePeriods.set(txnId, penalty.id);

  if (row.state !== "pending_payment") {
    advanceState(txnId, "pending_payment");
  }

  sendToUser(row.maptain_user_id, {
    type: "sniping_payment_grace",
    payload: {
      transactionId: txnId,
      requiredAmount,
      reportedBalance: reportedBalance ?? 0,
      graceExpiresAt,
    },
  });

  graceTimers.set(
    txnId,
    setTimeout(() => {
      graceTimers.delete(txnId);
      handleGraceExpired(txnId);
    }, SNIPING_GRACE_PERIOD_MS)
  );

  audit("sniping_insufficient_sb", row.maptain_user_id, {
    transactionId: txnId,
    reportedBalance,
    requiredAmount,
    graceExpiresAt,
  });
}

/**
 * If maptain is online → one final retry. Otherwise → suspend immediately.
 */
function handleGraceExpired(txnId: number): void {
  const row = findSnipingTransactionById(txnId);
  if (!row || row.state === "completed" || row.state === "failed") return;

  verboseLog("snipe-orch", `GRACE EXPIRED txn #${txnId}`);

  audit("sniping_grace_expired", row.maptain_user_id, {
    transactionId: txnId,
  });

  if (!isUserAfk(row.maptain_user_id)) {
    verboseLog("snipe-orch", `  maptain online – final attempt`);
    finalAttemptTxns.add(txnId);

    if (isGroupTransaction(row)) {
      enqueueStep(row.maptain_user_id, txnId, "sniping_transfer_sb", {
        targetSnUserId: row.sniper_mh_sn_user_id,
        amount: row.total_price,
      });
    } else {
      const gt = row.goal_type ?? "mouse";
      const goals = getGoalRows(txnId, gt);
      const unpaid = goals.filter((g) => g.completed && !g.paid);
      if (unpaid.length > 0) {
        enqueueGoalPaymentTransfers(row, unpaid);
      } else {
        suspendAndFail(txnId);
      }
    }
  } else {
    suspendAndFail(txnId);
  }
}

function suspendAndFail(txnId: number): void {
  const row = findSnipingTransactionById(txnId);
  if (!row) return;

  verboseLog("snipe-orch", `SUSPEND AND FAIL txn #${txnId}: maptain user${row.maptain_user_id}`);

  createSuspension(
    row.maptain_user_id,
    null,
    "Insufficient SB – grace period expired",
    null
  );
  audit("user_suspended", undefined, {
    userId: row.maptain_user_id,
    reason: "insufficient_sb_grace_expired",
    transactionId: txnId,
  });

  const penaltyId = activeGracePeriods.get(txnId);
  if (penaltyId != null) {
    resolvePaymentPenalty(penaltyId, "suspended");
    activeGracePeriods.delete(txnId);
  }

  sendToUser(row.maptain_user_id, {
    type: "sniping_payment_resolved",
    payload: { transactionId: txnId, resolution: "suspended" },
  });

  failSnipingTransaction(txnId, "Account suspended – insufficient SB to pay sniper");
}

function resolveGracePenaltyIfActive(txnId: number, resolution: string): void {
  const penaltyId = activeGracePeriods.get(txnId);
  if (penaltyId == null) return;

  resolvePaymentPenalty(penaltyId, resolution);
  clearGraceTimer(txnId);
  activeGracePeriods.delete(txnId);

  const row = findSnipingTransactionById(txnId);
  if (row) {
    sendToUser(row.maptain_user_id, {
      type: "sniping_payment_resolved",
      payload: { transactionId: txnId, resolution: "paid" },
    });
  }

  verboseLog("snipe-orch", `  grace penalty #${penaltyId} resolved as ${resolution}`);
}

export function cleanupStuckSnipingTransactions(): void {
  inflightStep.clear();
  stepQueue.clear();
  pendingPaymentGoals.clear();
  for (const timer of graceTimers.values()) clearTimeout(timer);
  graceTimers.clear();
  activeGracePeriods.clear();
  finalAttemptTxns.clear();

  const stuck = findPendingSnipingTransactions();
  if (stuck.length === 0) return;

  console.log(
    `[sniping-orchestrator] processing ${stuck.length} stuck sniping transaction(s)`
  );

  const reopenedTargets: Array<{ goalType: string; goalId: number }> = [];
  let resumed = 0;

  for (const row of stuck) {
    const gt = row.goal_type ?? "mouse";

    if (row.state === "sniping") {
      if (isGroupTransaction(row)) {
        if (allGoalsCompleted(row.id, gt)) {
          advanceState(row.id, "awaiting_payment");
          resumed++;
          console.log(
            `[sniping-orchestrator] resumed group txn ${row.id} (sniping → awaiting_payment, all completed)`
          );
          continue;
        }
        setHuntTimeout(row.id);
      } else {
        setHuntTimeout(row.id);
        const goals = getGoalRows(row.id, gt);
        const unpaid = goals.filter((g) => g.completed && !g.paid);
        if (unpaid.length > 0) {
          enqueueGoalPaymentTransfers(row, unpaid);
          console.log(
            `[sniping-orchestrator] resumed txn ${row.id} (sniping) – re-enqueued ${unpaid.length} unpaid transfer(s)`
          );
        }
      }

      resumed++;
      console.log(
        `[sniping-orchestrator] resumed txn ${row.id} (sniping) – hunt timeout re-set`
      );
      continue;
    }

    if (row.state === "awaiting_payment") {
      advanceState(row.id, "transferring");
      resumed++;
      console.log(
        `[sniping-orchestrator] resumed txn ${row.id} (awaiting_payment → transferring)`
      );
      continue;
    }

    if (row.state === "pending_payment") {
      // Leave parked – maptain may not be connected.
      // Check for unresolved penalties → restart grace timers with remaining time.
      const penalty = findUnresolvedPenaltyForTxn(row.id);
      if (penalty) {
        const remaining = new Date(penalty.grace_expires_at).getTime() - Date.now();
        if (remaining > 0) {
          activeGracePeriods.set(row.id, penalty.id);
          graceTimers.set(
            row.id,
            setTimeout(() => {
              graceTimers.delete(row.id);
              handleGraceExpired(row.id);
            }, remaining)
          );
          console.log(
            `[sniping-orchestrator] pending_payment txn ${row.id} – grace timer restarted (${Math.round(remaining / 60000)}min remaining)`
          );
        } else {
          // Grace already expired while server was down
          activeGracePeriods.set(row.id, penalty.id);
          console.log(
            `[sniping-orchestrator] pending_payment txn ${row.id} – grace expired during downtime, will handle on reconnect`
          );
          queueMicrotask(() => handleGraceExpired(row.id));
        }
      } else {
        console.log(
          `[sniping-orchestrator] pending_payment txn ${row.id} – left parked (AFK, no penalty)`
        );
      }
      resumed++;
      continue;
    }

    if (row.state === "transferring") {
      enqueueStep(row.maptain_user_id, row.id, "sniping_transfer_sb", {
        targetSnUserId: row.sniper_mh_sn_user_id,
        amount: row.total_price,
      });
      resumed++;
      console.log(
        `[sniping-orchestrator] resumed txn ${row.id} (transferring) – re-sent transfer step`
      );
      continue;
    }

    if (row.state === "awaiting_leave") {
      enqueueStep(row.sniper_user_id, row.id, "sniping_leave_map", {
        mhMapId: row.mh_map_id,
      });
      resumed++;
      console.log(
        `[sniping-orchestrator] resumed txn ${row.id} (awaiting_leave) – re-sent leave step`
      );
      continue;
    }

    // Non-resumable states (pending, inviting, invite_sent) – fail and reopen orders
    updateSnipingTransactionState(row.id, "failed", "server restarted");

    const goals = getGoalRows(row.id, gt);
    for (const g of goals) {
      if (g.paid) {
        updateSnipingOrderStatus(g.buyOrderId, "completed");
        updateSnipingOrderStatus(g.sellOrderId, "completed");
      } else {
        updateSnipingOrderStatus(g.buyOrderId, "open");
        updateSnipingOrderStatus(g.sellOrderId, "open");
        reopenedTargets.push({ goalType: gt, goalId: g.goalId });
      }
    }

    audit("sniping_transaction_failed", undefined, {
      transactionId: row.id,
      sniperUserId: row.sniper_user_id,
      maptainUserId: row.maptain_user_id,
      reason: "server restarted",
      previousState: row.state,
    });

    console.log(
      `[sniping-orchestrator] failed txn ${row.id} (was ${row.state})`
    );
  }

  if (resumed > 0) {
    console.log(`[sniping-orchestrator] resumed ${resumed} transaction(s)`);
  }

  if (reopenedTargets.length > 0) {
    const seen = new Set<string>();
    const unique = reopenedTargets.filter((t) => {
      const key = `${t.goalType}:${t.goalId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(
      `[sniping-orchestrator] re-matching ${unique.length} target(s) after cleanup`
    );
    for (const t of unique) {
      queueMicrotask(() => {
        const target: import("@mhcm/shared").SnipingTarget =
          t.goalType === "item"
            ? { itemTypeId: t.goalId }
            : { mouseTypeId: t.goalId };
        trySnipingMatch(target);
        broadcastGoalOrderBook(t.goalType, t.goalId);
      });
    }
  }
}

const SNIPING_FAST_STATES = new Set<SnipingTransactionState>([
  "inviting",
  "invite_sent",
]);

function countDrainableSnipingTransactions(): number {
  return findPendingSnipingTransactions().filter((r) =>
    SNIPING_FAST_STATES.has(r.state as SnipingTransactionState)
  ).length;
}

registerDrainableCounter(countDrainableSnipingTransactions);
