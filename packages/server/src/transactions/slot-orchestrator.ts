// Flow: pending → risk_checking → validating → inviting → verifying_invite_sent → accepting
//   → transferring → verifying_sb_receipt → completed
// RT: ... → verifying_sb_receipt → awaiting_map_completion → claiming_chest → opening_chest
//   → transferring_rt → completed

import type {
  SlotTransaction,
  SlotTransactionState,
  SlotTransactionStepType,
  MHMapClass,
} from "@mhcm/shared";
import { TRANSACTION_STEP_TIMEOUT_MS, RT_STEP_TIMEOUT_MS, RT_MAX_TRANSFER_RETRIES } from "@mhcm/shared";
import { getMapTypeClass, findMapTypeById } from "../db/queries/map-types.js";
import {
  findTransactionById,
  findPendingTransactions,
  findPendingPaymentTransactions,
  findActiveTransactionForBuyOrder,
  updateSlotTransactionState,
  getPaymentRetryCount,
  setPaymentRetryCount,
  incrementPaymentRetryCount,
  setSlotSbTransferTs,
  type TransactionRow,
} from "../db/queries/slot-transactions.js";
import { reverseOrderFill, deprioritizeOrder, findOrderById, autoAdjustSellOrderSlots, closeSlotOrder } from "../db/queries/slot-orders.js";
import { enrichGoalData } from "./risk-check-utils.js";
import { getItemRiskConfig } from "../db/queries/item-types.js";
import {
  findSlotRiskDecision,
  upsertSlotRiskDecision,
  deleteSlotRiskDecision,
  deleteSlotRiskDecisionsForSellOrder,
} from "../db/queries/risk-decisions.js";
import {
  insertRtPendingItems,
  findNextPendingRtItem,
  countRtItemProgress,
  markRtItemTransferred,
  deleteRtPendingItems,
  findRtTransactionsAwaitingCompletion,
  findRtAwaitingCompletionByBuyer,
} from "../db/queries/rt-pending-items.js";
import { sendToUser, addUserActiveMap, isUserAfk, markPendingRtConfirmation, clearPendingRtConfirmation, getConnection } from "../ws/connections.js";
import { findUserById, createSuspension } from "../db/queries/users.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { audit } from "../audit.js";
import { startVerification, cancelVerification } from "./verify-utils.js";
import { getRiskCheckTimeoutSeconds } from "../settings.js";
import { tryMatch } from "../orders/slot-matcher.js";
import { broadcastOrderBook, rowToOrder } from "../orders/slot-book.js";
import { registerDrainableCounter } from "../drain.js";

export function rowToTransaction(row: TransactionRow): SlotTransaction {
  const txn: SlotTransaction = {
    id: row.id,
    sellOrderId: row.sell_order_id,
    buyOrderId: row.buy_order_id,
    sellerUserId: row.seller_user_id,
    buyerUserId: row.buyer_user_id,
    price: row.price,
    quantity: row.quantity,
    state: row.state,
    mhMapId: row.mh_map_id,
    buyerMhSnUserId: row.buyer_mh_sn_user_id,
    sellerMhSnUserId: row.seller_mh_sn_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    failureReason: row.failure_reason ?? undefined,
    isRt: !!row.is_rt,
  };

  // Enrich with RT item progress for RT transactions that have items
  if (row.is_rt) {
    const progress = countRtItemProgress(row.id);
    if (progress.total > 0) {
      txn.rtItemsTotal = progress.total;
      txn.rtItemsTransferred = progress.transferred;
    }
  }

  return txn;
}

const stepTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

const riskCheckTimers = new Map<number, ReturnType<typeof setTimeout>>();

/**
 * Circuit breaker: track consecutive match-fail cycles per map type.
 * Prevents tight loops when an extension's content script is unreachable.
 */
const failureTracker = new Map<number, { count: number; lastFail: number }>();
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_WINDOW_MS = 10_000; // 10 seconds

const PENDING_PAYMENT_MAX_RETRIES = 1;

interface QueuedStep {
  txnId: number;
  userId: number;
  step: SlotTransactionStepType;
  data: any;
}

/** userId → txnId of the step currently awaiting a response. */
const inflightStep = new Map<number, number>();

/** userId → FIFO queue of steps waiting to be sent. */
const stepQueue = new Map<number, QueuedStep[]>();

/**
 * Seller handles validate_map, send_invite, and cancel_invite; buyer handles the rest.
 */
function getStepUserId(step: SlotTransactionStepType, row: TransactionRow): number {
  switch (step) {
    case "validate_map":
    case "send_invite":
    case "cancel_invite":
      return row.seller_user_id;
    case "accept_invite":
    case "check_balance_and_transfer":
    case "rt_claim_chest":
    case "rt_open_chest":
    case "rt_transfer_item":
      return row.buyer_user_id;
  }
}

function getStepForState(state: SlotTransactionState): SlotTransactionStepType | null {
  switch (state) {
    case "validating":
      return "validate_map";
    case "inviting":
      return "send_invite";
    case "accepting":
      return "accept_invite";
    case "cancelling_invite":
      return "cancel_invite";
    case "transferring":
      return "check_balance_and_transfer";
    case "claiming_chest":
      return "rt_claim_chest";
    case "opening_chest":
      return "rt_open_chest";
    case "transferring_rt":
      return "rt_transfer_item";
    default:
      return null;
  }
}

function enqueueStep(
  userId: number,
  txnId: number,
  step: SlotTransactionStepType,
  data: any
): void {
  if (inflightStep.has(userId)) {
    const queue = stepQueue.get(userId) ?? [];
    queue.push({ txnId, userId, step, data });
    stepQueue.set(userId, queue);
    return;
  }

  doSendStep(userId, txnId, step, data);
}

function doSendStep(
  userId: number,
  txnId: number,
  step: SlotTransactionStepType,
  data: any
): void {
  inflightStep.set(userId, txnId);
  sendToUser(userId, {
    type: "execute_step",
    payload: { transactionId: txnId, step, data },
  });
  setStepTimeout(txnId);
}

/**
 * Process the next queued step for a user after their previous step
 * completed or timed out. Skips steps for transactions that are no
 * longer active (failed/completed while queued).
 */
function drainUserQueue(userId: number): void {
  // If the user already has a new inflight step (set by advanceState
  // during step result processing), nothing to drain.
  if (inflightStep.has(userId)) return;

  const queue = stepQueue.get(userId);
  if (!queue || queue.length === 0) return;

  const next = queue.shift()!;
  if (queue.length === 0) stepQueue.delete(userId);

  const row = findTransactionById(next.txnId);
  if (!row || row.state === "completed" || row.state === "failed") {
    drainUserQueue(userId);
    return;
  }

  doSendStep(userId, next.txnId, next.step, next.data);
}

export function startTransaction(txnId: number): void {
  const row = findTransactionById(txnId);
  if (!row || row.state !== "pending") return;

  const txn = rowToTransaction(row);

  sendToUser(txn.sellerUserId, {
    type: "order_matched",
    payload: { transaction: txn },
  });
  sendToUser(txn.buyerUserId, {
    type: "order_matched",
    payload: { transaction: txn },
  });

  advanceState(txnId, "risk_checking");
}

export function handleStepResult(payload: {
  transactionId: number;
  step: SlotTransactionStepType;
  success: boolean;
  error?: string;
  code?: "buyer_not_ready" | "no_slots_available" | "invite_not_found_exhausted";
  availableSlots?: number;
  tradableItems?: Array<{ type: string; name: string; quantity: number; thumbnail?: string }>;
  transferTimestampUtc?: string;
}): void {
  const { transactionId, step, success, error, code, availableSlots, tradableItems } = payload;

  clearStepTimeout(transactionId);

  const row = findTransactionById(transactionId);
  if (!row) return;

  // Clear inflight BEFORE processing so that advanceState can immediately
  // send the next step to the same user (e.g. validate_map → send_invite).
  const stepUserId = getStepUserId(step, row);
  inflightStep.delete(stepUserId);

  if (!success) {
    if (code === "invite_not_found_exhausted" && step === "accept_invite") {
      cancelInviteAndFail(
        transactionId,
        `Step ${step} failed: ${error || "invite not found after retries"}`
      );
    } else if (code === "buyer_not_ready") {
      failTransactionAndRequeueBuyer(
        transactionId,
        `Step ${step} failed: ${error || "buyer not ready"}`
      );
    } else if (code === "no_slots_available" && step === "validate_map") {
      failTransactionAndCancelSellOrder(
        transactionId,
        `Step ${step} failed: ${error || "no slots available"}`,
        availableSlots ?? 0
      );
    } else if (step === "check_balance_and_transfer" && row.state === "transferring") {
      // Payment failed AFTER buyer already joined the map – enter recovery
      enterPendingPayment(transactionId, error || "Transfer failed");
    } else if (step === "rt_claim_chest" || step === "rt_open_chest" || step === "rt_transfer_item") {
      const retries = (rtRetryCount.get(transactionId) ?? 0) + 1;
      rtRetryCount.set(transactionId, retries);

      if (retries < RT_MAX_TRANSFER_RETRIES) {
        console.log(`[orchestrator] RT step ${step} failed for txn ${transactionId}, retry ${retries}/${RT_MAX_TRANSFER_RETRIES}`);
        setTimeout(() => {
          const currentRow = findTransactionById(transactionId);
          if (!currentRow || currentRow.state === "failed" || currentRow.state === "completed") return;
          advanceState(transactionId, currentRow.state as SlotTransactionState);
        }, retries * 5000); // 5s, 10s backoff
      } else {
        rtRetryCount.delete(transactionId);
        failTransaction(transactionId, `Step ${step} failed after ${retries} retries: ${error || "unknown"}`);
      }
    } else {
      failTransaction(transactionId, `Step ${step} failed: ${error || "unknown"}`);
    }
    drainUserQueue(stepUserId);
    return;
  }

  // On successful validate_map, auto-adjust the sell order if the map has
  // fewer available slots than the order's remaining unfilled quantity.
  if (step === "validate_map" && availableSlots != null) {
    // availableSlots includes the slot this transaction will use.
    const slotsAfterThisTxn = availableSlots - row.quantity;
    if (slotsAfterThisTxn >= 0) {
      autoAdjustSellOrder(row.sell_order_id, slotsAfterThisTxn, row.seller_user_id);
    }
  }

  // advanceState may call enqueueStep for the same user (e.g. seller's
  // validate_map → inviting/send_invite) which sends immediately since
  // we cleared inflightStep above.
  switch (step) {
    case "validate_map":
      if (row.state === "validating") {
        advanceState(transactionId, "inviting");
      }
      break;
    case "send_invite":
      if (row.state === "inviting") {
        advanceState(transactionId, "verifying_invite_sent");
        startVerification(transactionId, row.buyer_user_id, "slots", {
          verificationType: "invite_received",
          mapId: row.mh_map_id,
        },
        () => advanceState(transactionId, "accepting"),
        () => suspendSellerAndFail(transactionId, "Invite receipt could not be verified after 3 attempts"),
        );
      }
      break;
    case "accept_invite":
      if (row.state === "accepting") {
        advanceState(transactionId, "transferring");
      }
      break;
    case "cancel_invite":
      if (row.state === "cancelling_invite") {
        failTransaction(transactionId, row.failure_reason || "Invite cancelled after accept failed");
      }
      break;
    case "check_balance_and_transfer":
      if (row.state === "transferring") {
        const isRt = !!row.is_rt;
        const buyerMhAccount = findMHAccountByUserId(row.buyer_user_id);
        const transferTimestampUtc = payload.transferTimestampUtc ?? new Date().toISOString();
        setSlotSbTransferTs(transactionId, transferTimestampUtc);
        advanceState(transactionId, "verifying_sb_receipt");
        startVerification(transactionId, row.seller_user_id, "slots", {
          verificationType: "sb_receipt",
          senderMhUserId: buyerMhAccount ? String(buyerMhAccount.mh_user_id) : "",
          itemDisplayName: "SUPER|brie+",
          quantity: row.price * row.quantity,
          transferTimestampUtc,
        },
        () => {
          if (isRt) {
            advanceState(transactionId, "awaiting_map_completion");
          } else {
            completeTransaction(transactionId);
          }
        },
        () => suspendBuyerAndFailSlot(transactionId, "SB receipt could not be verified after 3 attempts"),
        );
      }
      break;
    case "rt_claim_chest":
      if (row.state === "claiming_chest") {
        rtRetryCount.delete(transactionId);
        advanceState(transactionId, "opening_chest");
      }
      break;
    case "rt_open_chest":
      if (row.state === "opening_chest") {
        rtRetryCount.delete(transactionId);
        if (tradableItems && tradableItems.length > 0) {
          insertRtPendingItems(transactionId, tradableItems);
          advanceState(transactionId, "transferring_rt");
        } else {
          console.log(`[orchestrator] txn ${transactionId} chest had no tradable items, completing`);
          completeTransaction(transactionId);
        }
      }
      break;
    case "rt_transfer_item":
      if (row.state === "transferring_rt") {
        rtRetryCount.delete(transactionId);
        const currentItem = findNextPendingRtItem(transactionId);
        if (currentItem) {
          markRtItemTransferred(currentItem.id);
        }
        const nextItem = findNextPendingRtItem(transactionId);
        if (nextItem) {
          // Re-enter transferring_rt to send the next item
          const rtTxn = rowToTransaction({ ...row, state: "transferring_rt" });
          broadcastTransactionUpdate(rtTxn);
          enqueueStep(row.buyer_user_id, transactionId, "rt_transfer_item", {
            sellerSnUserId: row.seller_mh_sn_user_id,
            itemType: nextItem.item_type,
            itemName: nextItem.item_name,
            quantity: nextItem.quantity,
          });
          setStepTimeout(transactionId, RT_STEP_TIMEOUT_MS);
        } else {
          completeTransaction(transactionId);
        }
      }
      break;
  }

  // May be a no-op if advanceState already sent them a new step
  drainUserQueue(stepUserId);
}

function advanceState(
  txnId: number,
  newState: SlotTransactionState
): void {
  const row = findTransactionById(txnId);
  if (!row) return;

  updateSlotTransactionState(txnId, newState);

  audit("transaction_state_change", undefined, {
    transactionId: txnId,
    fromState: row.state,
    toState: newState,
  });

  const txn = rowToTransaction({ ...row, state: newState });
  broadcastTransactionUpdate(txn);

  switch (newState) {
    case "risk_checking": {
      const sellOrder = findOrderById(row.sell_order_id);
      const goalsJson = sellOrder?.remaining_goals;

      if (!goalsJson) {
        advanceState(txnId, "validating");
        return;
      }

      const goals: Array<{ uniqueId: number; type: string }> = JSON.parse(goalsJson);
      if (goals.length === 0) {
        advanceState(txnId, "validating");
        return;
      }

      const existing = findSlotRiskDecision(row.buy_order_id, row.sell_order_id);
      if (existing?.decision === "accepted") {
        advanceState(txnId, "validating");
        return;
      }

      const mapType = sellOrder.map_type_id ? findMapTypeById(sellOrder.map_type_id) : undefined;
      const goalType = mapType?.goal ?? "mouse";
      const enriched = enrichGoalData(goals, goalType);

      const timeoutSeconds = getRiskCheckTimeoutSeconds();

      const itemRiskCfg = goalType === "item"
        ? getItemRiskConfig(goals.map((g) => g.type))
        : undefined;

      // Not via step queue – this is a WS message exchange
      sendToUser(row.buyer_user_id, {
        type: "risk_check_prompt",
        payload: {
          transactionId: txnId,
          marketplace: "slot",
          mapTypeId: sellOrder.map_type_id!,
          goalType: goalType as "mouse" | "item",
          remainingGoals: enriched,
          itemRiskConfig: itemRiskCfg,
          timeoutSeconds,
        },
      });

      startRiskCheckTimer(txnId);
      break;
    }

    case "validating":
      enqueueStep(txn.sellerUserId, txnId, "validate_map", {
        mhMapId: txn.mhMapId,
        requiredSlots: txn.quantity,
      });
      break;

    case "inviting":
      enqueueStep(txn.sellerUserId, txnId, "send_invite", {
        mhMapId: txn.mhMapId,
        buyerSnUserId: txn.buyerMhSnUserId,
      });
      break;

    case "invite_sent":
      advanceState(txnId, "accepting");
      break;

    case "accepting":
      enqueueStep(txn.buyerUserId, txnId, "accept_invite", {
        mhMapId: txn.mhMapId,
        amount: txn.price * txn.quantity,
      });
      break;

    case "invite_accepted":
      advanceState(txnId, "transferring");
      break;

    case "cancelling_invite":
      enqueueStep(txn.sellerUserId, txnId, "cancel_invite", {
        mhMapId: txn.mhMapId,
        buyerSnUserId: txn.buyerMhSnUserId,
      });
      break;

    case "transferring":
      enqueueStep(txn.buyerUserId, txnId, "check_balance_and_transfer", {
        sellerSnUserId: txn.sellerMhSnUserId,
        amount: txn.price * txn.quantity,
      });
      break;

    case "awaiting_map_completion": {
      // Park – no step sent. Buyer is on the map, waiting for it to complete.
      // Track buyer's active map immediately to prevent same-class re-matching.
      const awaitMapTypeId = getMapTypeIdFromOrder(row.sell_order_id);
      if (awaitMapTypeId) {
        const mapClass = getMapTypeClass(awaitMapTypeId) as MHMapClass | null;
        if (mapClass) {
          addUserActiveMap(txn.buyerUserId, row.mh_map_id, mapClass);
        }
      }
      console.log(`[orchestrator] txn ${txnId} parked in awaiting_map_completion`);
      break;
    }

    case "claiming_chest": {
      const sellOrder = findOrderById(row.sell_order_id);
      const mapTypeRow = sellOrder ? findMapTypeById(sellOrder.map_type_id) : undefined;
      const mapTypeStr = mapTypeRow?.map_type ?? "";
      enqueueStep(txn.buyerUserId, txnId, "rt_claim_chest", {
        mhMapId: txn.mhMapId,
        mapType: mapTypeStr,
      });
      setStepTimeout(txnId, RT_STEP_TIMEOUT_MS);
      break;
    }

    case "opening_chest": {
      const sellOrder2 = findOrderById(row.sell_order_id);
      const mapTypeRow2 = sellOrder2 ? findMapTypeById(sellOrder2.map_type_id) : undefined;
      const chestItemType = mapTypeRow2?.map_type ?? "";
      enqueueStep(txn.buyerUserId, txnId, "rt_open_chest", {
        chestItemType,
      });
      setStepTimeout(txnId, RT_STEP_TIMEOUT_MS);
      break;
    }

    case "transferring_rt": {
      const nextItem = findNextPendingRtItem(txnId);
      if (nextItem) {
        enqueueStep(txn.buyerUserId, txnId, "rt_transfer_item", {
          sellerSnUserId: txn.sellerMhSnUserId,
          itemType: nextItem.item_type,
          itemName: nextItem.item_name,
          quantity: nextItem.quantity,
        });
        setStepTimeout(txnId, RT_STEP_TIMEOUT_MS);
      } else {
        completeTransaction(txnId);
      }
      break;
    }
  }
}

function completeTransaction(txnId: number): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);
  updateSlotTransactionState(txnId, "completed");

  const row = findTransactionById(txnId);
  if (!row) return;

  const txn = rowToTransaction(row);
  broadcastTransactionUpdate(txn);

  audit("transaction_completed", undefined, {
    transactionId: txnId,
    sellerUserId: txn.sellerUserId,
    buyerUserId: txn.buyerUserId,
    price: txn.price,
    quantity: txn.quantity,
  });

  // Deprioritize buy order so it goes to the back of the queue (fair 1-slot-at-a-time)
  deprioritizeOrder(txn.buyOrderId);

  const sellOrder = findOrderById(txn.sellOrderId);
  if (sellOrder && sellOrder.status === "filled") {
    deleteSlotRiskDecisionsForSellOrder(txn.sellOrderId);
  }

  // For non-RT txns: buyer just joined the seller's map. Track active map
  // immediately so the matcher blocks them for same-class orders.
  // For RT txns: map is already completed/frozen by now.
  const mapTypeId = getMapTypeIdFromOrder(row.sell_order_id);
  if (mapTypeId) {
    if (!row.is_rt) {
      const mapClass = getMapTypeClass(mapTypeId) as MHMapClass | null;
      if (mapClass) {
        addUserActiveMap(txn.buyerUserId, row.mh_map_id, mapClass);
      }
    }

    failureTracker.delete(mapTypeId);
    scheduleRematch(mapTypeId);
  }
}

function failTransaction(txnId: number, reason: string): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);
  clearRiskCheckTimer(txnId);
  updateSlotTransactionState(txnId, "failed", reason);

  const row = findTransactionById(txnId);
  if (!row) return;

  if (row.is_rt) {
    clearPendingRtConfirmation(row.buyer_user_id);
  }

  const txn = rowToTransaction(row);
  broadcastTransactionUpdate(txn);

  audit("transaction_failed", undefined, {
    transactionId: txnId,
    sellerUserId: txn.sellerUserId,
    buyerUserId: txn.buyerUserId,
    reason,
  });

  const sellOrderBefore = findOrderById(txn.sellOrderId);
  const buyOrderBefore = findOrderById(txn.buyOrderId);
  console.log(`[orchestrator] txn ${txnId} failing, reversing fills:`, {
    sellOrder: { id: txn.sellOrderId, filled: sellOrderBefore?.filled_quantity, status: sellOrderBefore?.status },
    buyOrder: { id: txn.buyOrderId, filled: buyOrderBefore?.filled_quantity, status: buyOrderBefore?.status },
    quantity: txn.quantity,
  });

  reverseOrderFill(txn.sellOrderId, txn.quantity);
  reverseOrderFill(txn.buyOrderId, txn.quantity);

  const sellOrderAfter = findOrderById(txn.sellOrderId);
  const buyOrderAfter = findOrderById(txn.buyOrderId);
  console.log(`[orchestrator] txn ${txnId} fills reversed:`, {
    sellOrder: { id: txn.sellOrderId, filled: sellOrderAfter?.filled_quantity, status: sellOrderAfter?.status },
    buyOrder: { id: txn.buyOrderId, filled: buyOrderAfter?.filled_quantity, status: buyOrderAfter?.status },
  });

  const mapTypeId = getMapTypeIdFromOrder(row.sell_order_id);
  if (mapTypeId) {
    const now = Date.now();
    const entry = failureTracker.get(mapTypeId);

    if (entry && now - entry.lastFail < FAILURE_WINDOW_MS) {
      entry.count++;
      entry.lastFail = now;
    } else {
      failureTracker.set(mapTypeId, { count: 1, lastFail: now });
    }

    const current = failureTracker.get(mapTypeId)!;
    if (current.count < MAX_CONSECUTIVE_FAILURES) {
      scheduleRematch(mapTypeId);
    } else {
      console.log(
        `[orchestrator] circuit breaker: pausing rematch for ${mapTypeId} after ${current.count} consecutive failures`
      );
      broadcastOrderBook(mapTypeId);
    }
  }
}

/**
 * Fail due to the buyer not being ready (already on a map, insufficient SB, etc).
 * Reverses fills, deprioritizes the buy order, and re-runs the matcher.
 */
function failTransactionAndRequeueBuyer(txnId: number, reason: string): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);
  updateSlotTransactionState(txnId, "failed", reason);

  const row = findTransactionById(txnId);
  if (!row) return;

  if (row.is_rt) {
    clearPendingRtConfirmation(row.buyer_user_id);
  }

  const txn = rowToTransaction(row);
  broadcastTransactionUpdate(txn);

  audit("transaction_failed", undefined, {
    transactionId: txnId,
    sellerUserId: txn.sellerUserId,
    buyerUserId: txn.buyerUserId,
    reason,
  });

  reverseOrderFill(txn.sellOrderId, txn.quantity);
  reverseOrderFill(txn.buyOrderId, txn.quantity);

  deprioritizeOrder(txn.buyOrderId);

  audit("order_deprioritized", txn.buyerUserId, {
    orderId: txn.buyOrderId,
    reason: "buyer_not_ready",
  });

  const mapTypeId = getMapTypeIdFromOrder(row.sell_order_id);
  if (mapTypeId) scheduleRematch(mapTypeId);
}

/**
 * Fail because the seller's map has no available slots.
 * Reverses fills, then cancels or reduces the sell order based on actual availability.
 */
function failTransactionAndCancelSellOrder(
  txnId: number,
  reason: string,
  availableSlots: number
): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);
  updateSlotTransactionState(txnId, "failed", reason);

  const row = findTransactionById(txnId);
  if (!row) return;

  const txn = rowToTransaction(row);
  broadcastTransactionUpdate(txn);

  audit("transaction_failed", undefined, {
    transactionId: txnId,
    sellerUserId: txn.sellerUserId,
    buyerUserId: txn.buyerUserId,
    reason,
  });

  reverseOrderFill(txn.sellOrderId, txn.quantity);
  reverseOrderFill(txn.buyOrderId, txn.quantity);

  autoAdjustSellOrder(txn.sellOrderId, availableSlots, txn.sellerUserId);

  const mapTypeId = getMapTypeIdFromOrder(row.sell_order_id);
  if (mapTypeId) scheduleRematch(mapTypeId);
}

function suspendSellerAndFail(txnId: number, reason: string): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);
  updateSlotTransactionState(txnId, "failed", reason);

  const row = findTransactionById(txnId);
  if (!row) return;

  const txn = rowToTransaction(row);
  broadcastTransactionUpdate(txn);

  audit("transaction_failed", undefined, {
    transactionId: txnId,
    sellerUserId: txn.sellerUserId,
    buyerUserId: txn.buyerUserId,
    reason,
  });
  audit("verification_failed", undefined, {
    txnId,
    marketplace: "slots",
    verificationType: "invite_received",
    failingParty: txn.sellerUserId,
    attemptCount: 3,
  });

  reverseOrderFill(txn.sellOrderId, txn.quantity);
  reverseOrderFill(txn.buyOrderId, txn.quantity);
  closeSlotOrder(txn.sellOrderId);
  createSuspension(txn.sellerUserId, null, "Map invite could not be verified (possible fraud)", null);
  getConnection(txn.sellerUserId)?.ws.close(4003, "Account suspended");

  const mapTypeId = getMapTypeIdFromOrder(row.sell_order_id);
  if (mapTypeId) scheduleRematch(mapTypeId);
}

function suspendBuyerAndFailSlot(txnId: number, reason: string): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);
  updateSlotTransactionState(txnId, "failed", reason);

  const row = findTransactionById(txnId);
  if (!row) return;

  const txn = rowToTransaction(row);
  broadcastTransactionUpdate(txn);

  audit("transaction_failed", undefined, {
    transactionId: txnId,
    sellerUserId: txn.sellerUserId,
    buyerUserId: txn.buyerUserId,
    reason,
  });
  audit("verification_failed", undefined, {
    txnId,
    marketplace: "slots",
    verificationType: "sb_receipt",
    failingParty: txn.buyerUserId,
    attemptCount: 3,
  });

  // Buyer is on the map (access granted) – do NOT reverse sell fill
  reverseOrderFill(txn.buyOrderId, txn.quantity);
  closeSlotOrder(txn.buyOrderId);
  createSuspension(txn.buyerUserId, null, "Failed to complete SB payment (possible fraud)", null);
  getConnection(txn.buyerUserId)?.ws.close(4003, "Account suspended");

  const mapTypeId = getMapTypeIdFromOrder(row.sell_order_id);
  if (mapTypeId) scheduleRematch(mapTypeId);
}

/**
 * Cancel the pending invite and then fail the transaction.
 * Called when buyer's accept_invite retries are exhausted.
 */
function cancelInviteAndFail(txnId: number, reason: string): void {
  clearStepTimeout(txnId);

  const row = findTransactionById(txnId);
  if (!row) return;

  updateSlotTransactionState(txnId, "cancelling_invite", reason);

  const txn = rowToTransaction({ ...row, state: "cancelling_invite", failure_reason: reason });
  broadcastTransactionUpdate(txn);

  audit("transaction_state_change", undefined, {
    transactionId: txnId,
    fromState: row.state,
    toState: "cancelling_invite",
  });

  console.log(`[orchestrator] txn ${txnId} entering cancelling_invite: ${reason}`);

  enqueueStep(txn.sellerUserId, txnId, "cancel_invite", {
    mhMapId: txn.mhMapId,
    buyerSnUserId: txn.buyerMhSnUserId,
  });
}

/**
 * Enter pending_payment state when transfer fails after buyer joined the map.
 * The buyer is on the map but hasn't paid – we'll retry on reconnection.
 */
function enterPendingPayment(txnId: number, reason: string): void {
  clearStepTimeout(txnId);

  const row = findTransactionById(txnId);
  if (!row) return;

  updateSlotTransactionState(txnId, "pending_payment", reason);
  setPaymentRetryCount(txnId, 0);

  const txn = rowToTransaction({ ...row, state: "pending_payment" });
  broadcastTransactionUpdate(txn);

  audit("transaction_pending_payment", undefined, {
    transactionId: txnId,
    sellerUserId: row.seller_user_id,
    buyerUserId: row.buyer_user_id,
    reason,
  });

  console.log(`[orchestrator] txn ${txnId} entered pending_payment: ${reason}`);

  // Don't reverse fills - buyer is on the map, payment may still succeed
}

export function retryPendingPayment(txnId: number): void {
  const row = findTransactionById(txnId);
  if (!row || row.state !== "pending_payment") return;

  const retryCount = getPaymentRetryCount(txnId);
  if (retryCount >= PENDING_PAYMENT_MAX_RETRIES) {
    forceLeaveAndFail(txnId, "Max payment retries exceeded");
    return;
  }

  incrementPaymentRetryCount(txnId);

  updateSlotTransactionState(txnId, "transferring");

  const txn = rowToTransaction({ ...row, state: "transferring" });
  broadcastTransactionUpdate(txn);

  enqueueStep(txn.buyerUserId, txnId, "check_balance_and_transfer", {
    sellerSnUserId: txn.sellerMhSnUserId,
    amount: txn.price * txn.quantity,
  });

  audit("payment_retry", undefined, {
    transactionId: txnId,
    attempt: retryCount + 1,
  });

  console.log(`[orchestrator] retrying payment for txn ${txnId} (attempt ${retryCount + 1})`);
}

function forceLeaveAndFail(txnId: number, reason: string): void {
  const row = findTransactionById(txnId);
  if (!row) return;

  const txn = rowToTransaction(row);

  sendToUser(txn.buyerUserId, {
    type: "leave_map",
    payload: {
      transactionId: txnId,
      mapId: txn.mhMapId,
      reason,
    },
  });

  audit("leave_map_requested", undefined, {
    transactionId: txnId,
    buyerUserId: txn.buyerUserId,
    mapId: txn.mhMapId,
    reason,
  });

  console.log(`[orchestrator] requesting buyer leave map for txn ${txnId}: ${reason}`);

  // Don't wait for leave_map result – if they can't leave, that's a MH issue
  failTransaction(txnId, reason);
}

export function checkPendingPaymentsOnConnect(userId: number): void {
  const pending = findPendingPaymentTransactions(userId);
  if (pending.length === 0) return;

  console.log(`[orchestrator] user ${userId} reconnected with ${pending.length} pending payment(s)`);

  for (const row of pending) {
    queueMicrotask(() => retryPendingPayment(row.id));
  }
}

function autoAdjustSellOrder(
  sellOrderId: number,
  availableSlots: number,
  sellerUserId: number
): void {
  const { action, order } = autoAdjustSellOrderSlots(sellOrderId, availableSlots);

  if (action === "cancelled" && order) {
    deleteSlotRiskDecisionsForSellOrder(sellOrderId);
    audit("order_cancelled", sellerUserId, {
      orderId: sellOrderId,
      reason: "no_slots_available",
    });
    sendToUser(sellerUserId, {
      type: "order_cancelled",
      payload: { orderId: sellOrderId },
    });

    const mapTypeId = order.map_type_id;
    if (mapTypeId) broadcastOrderBook(mapTypeId);

    console.log(`[orchestrator] auto-cancelled sell order ${sellOrderId} (0 slots available)`);
  } else if (action === "reduced" && order) {
    audit("order_adjusted", sellerUserId, {
      orderId: sellOrderId,
      reason: "slots_reduced",
      newQuantity: order.quantity,
    });
    sendToUser(sellerUserId, {
      type: "order_adjusted",
      payload: { order: rowToOrder(order) },
    });

    const mapTypeId = order.map_type_id;
    if (mapTypeId) broadcastOrderBook(mapTypeId);

    console.log(
      `[orchestrator] auto-reduced sell order ${sellOrderId} to ${order.quantity} (${availableSlots} slots available)`
    );
  }
}

function getMapTypeIdFromOrder(orderId: number): number | undefined {
  const order = findOrderById(orderId);
  return order?.map_type_id;
}

/**
 * Deferred to next tick to ensure all DB writes are committed.
 */
function scheduleRematch(mapTypeId: number): void {
  queueMicrotask(() => {
    tryMatch(mapTypeId);
    broadcastOrderBook(mapTypeId);
  });
}

function broadcastTransactionUpdate(txn: SlotTransaction): void {
  sendToUser(txn.sellerUserId, {
    type: "transaction_update",
    payload: { transaction: txn },
  });
  sendToUser(txn.buyerUserId, {
    type: "transaction_update",
    payload: { transaction: txn },
  });
}

function setStepTimeout(txnId: number, timeoutMs: number = TRANSACTION_STEP_TIMEOUT_MS): void {
  clearStepTimeout(txnId);
  stepTimeouts.set(
    txnId,
    setTimeout(() => {
      stepTimeouts.delete(txnId);

      const row = findTransactionById(txnId);
      const stepType = row ? getStepForState(row.state) : null;
      const userId = row && stepType ? getStepUserId(stepType, row) : null;

      if (userId != null) {
        inflightStep.delete(userId);
      }

      failTransaction(txnId, "Step timed out");

      if (userId != null) {
        drainUserQueue(userId);
      }
    }, timeoutMs)
  );
}

function clearStepTimeout(txnId: number): void {
  const timer = stepTimeouts.get(txnId);
  if (timer) {
    clearTimeout(timer);
    stepTimeouts.delete(txnId);
  }
}

/**
 * Handle stuck transactions from a previous run.
 *
 * - pending_payment: Leave alone, will retry when buyer reconnects
 * - invite_accepted, transferring: Promote to pending_payment (buyer is on map)
 * - verifying_sb_receipt: Re-start verification with stored timestamp
 * - Other states: Fail and reverse fills
 */
export function cleanupStuckTransactions(): void {
  inflightStep.clear();
  stepQueue.clear();

  const stuck = findPendingTransactions();
  if (stuck.length === 0) return;

  console.log(`[orchestrator] processing ${stuck.length} stuck transaction(s) from previous run`);

  for (const row of stuck) {
    if (row.state === "pending_payment") {
      console.log(`[orchestrator] txn ${row.id} in pending_payment - will retry on reconnect`);
      continue;
    }

    if (row.state === "awaiting_map_completion") {
      console.log(`[orchestrator] txn ${row.id} in awaiting_map_completion - will resume on map complete`);
      continue;
    }

    if (row.state === "verifying_sb_receipt") {
      // Buyer reported SB sent, verification was in progress – re-start verification
      const timeAnchor = row.sb_transfer_ts ?? row.updated_at;
      const buyerMhAccount = findMHAccountByUserId(row.buyer_user_id);
      const isRt = !!row.is_rt;
      startVerification(
        row.id,
        row.seller_user_id,
        "slots",
        {
          verificationType: "sb_receipt",
          senderMhUserId: buyerMhAccount ? String(buyerMhAccount.mh_user_id) : "",
          itemDisplayName: "SUPER|brie+",
          quantity: row.price * row.quantity,
          transferTimestampUtc: timeAnchor,
        },
        () => {
          if (isRt) {
            advanceState(row.id, "awaiting_map_completion");
          } else {
            completeTransaction(row.id);
          }
        },
        () => suspendBuyerAndFailSlot(row.id, "SB receipt could not be verified after server restart"),
      );
      console.log(`[orchestrator] txn ${row.id} in verifying_sb_receipt at restart – re-verifying with seller`);
      continue;
    }

    if (row.state === "invite_accepted" || row.state === "transferring") {
      // Buyer was on map when server crashed – enter pending_payment recovery
      updateSlotTransactionState(row.id, "pending_payment", "server restarted during payment");
      setPaymentRetryCount(row.id, 0);

      audit("transaction_pending_payment", undefined, {
        transactionId: row.id,
        sellerUserId: row.seller_user_id,
        buyerUserId: row.buyer_user_id,
        reason: "server restarted during payment",
        previousState: row.state,
      });

      console.log(`[orchestrator] promoted txn ${row.id} from ${row.state} to pending_payment`);
      continue;
    }

    if (row.state === "claiming_chest" || row.state === "opening_chest" || row.state === "transferring_rt") {
      // RT steps in progress – restart from claiming_chest (idempotent for already-claimed maps)
      deleteRtPendingItems(row.id);
      updateSlotTransactionState(row.id, "claiming_chest");

      audit("transaction_state_change", undefined, {
        transactionId: row.id,
        fromState: row.state,
        toState: "claiming_chest",
        reason: "server restarted during RT flow",
      });

      console.log(`[orchestrator] reset txn ${row.id} from ${row.state} to claiming_chest`);
      continue;
    }

    // All other states (including risk_checking) – fail and reverse fills.
    // No blocked pair for risk_checking – server restart is not the buyer's fault.
    updateSlotTransactionState(row.id, "failed", "server restarted");
    reverseOrderFill(row.sell_order_id, row.quantity);
    reverseOrderFill(row.buy_order_id, row.quantity);

    audit("transaction_failed", undefined, {
      transactionId: row.id,
      sellerUserId: row.seller_user_id,
      buyerUserId: row.buyer_user_id,
      reason: "server restarted",
      previousState: row.state,
    });

    console.log(`[orchestrator] failed txn ${row.id} (was ${row.state})`);
  }
}

function startRiskCheckTimer(txnId: number): void {
  clearRiskCheckTimer(txnId);
  const ms = getRiskCheckTimeoutSeconds() * 1000;
  const timer = setTimeout(() => handleRiskCheckTimeout(txnId), ms);
  riskCheckTimers.set(txnId, timer);
}

function clearRiskCheckTimer(txnId: number): void {
  const timer = riskCheckTimers.get(txnId);
  if (timer) {
    clearTimeout(timer);
    riskCheckTimers.delete(txnId);
  }
}

function handleRiskCheckTimeout(txnId: number): void {
  riskCheckTimers.delete(txnId);
  const row = findTransactionById(txnId);
  if (!row || row.state !== "risk_checking") return;

  upsertSlotRiskDecision(row.buy_order_id, row.sell_order_id, "blocked");

  const mapTypeId = getMapTypeIdFromOrder(row.sell_order_id);

  failTransaction(txnId, "Risk check timed out");

  sendToUser(row.buyer_user_id, {
    type: "risk_check_timed_out",
    payload: {
      transactionId: txnId,
      marketplace: "slot" as const,
      sellOrderId: row.sell_order_id,
      buyOrderId: row.buy_order_id,
      mapTypeId: mapTypeId ?? 0,
    },
  });

  if (mapTypeId) scheduleRematch(mapTypeId);
}

export function handleRiskCheckResponse(userId: number, payload: {
  transactionId: number;
  decision: "accepted" | "rejected";
  autoAccepted?: boolean;
}): void {
  const { transactionId, decision } = payload;

  clearRiskCheckTimer(transactionId);

  const row = findTransactionById(transactionId);
  if (!row || row.state !== "risk_checking") return;
  if (row.buyer_user_id !== userId) return;

  const mapTypeId = getMapTypeIdFromOrder(row.sell_order_id);

  if (decision === "accepted") {
    upsertSlotRiskDecision(row.buy_order_id, row.sell_order_id, "accepted");
    advanceState(transactionId, "validating");
  } else {
    upsertSlotRiskDecision(row.buy_order_id, row.sell_order_id, "blocked");
    failTransaction(transactionId, "Buyer rejected risk check");
    if (mapTypeId) scheduleRematch(mapTypeId);
  }
}

export function handleRiskCheckRetry(userId: number, payload: {
  marketplace: "slot" | "map";
  buyOrderId: number;
  sellOrderId: number;
  mapTypeId: number;
}): void {
  deleteSlotRiskDecision(payload.buyOrderId, payload.sellOrderId);

  queueMicrotask(() => tryMatch(payload.mapTypeId));

  setTimeout(() => {
    const order = findOrderById(payload.buyOrderId);
    if (!order || order.status === "filled" || order.status === "cancelled") return;

    const activeTxn = findActiveTransactionForBuyOrder(payload.buyOrderId);
    if (!activeTxn) {
      sendToUser(userId, { type: "risk_check_retry_no_match", payload: {} });
    }
  }, 2000);
}

/** RT step retry counter: txnId → consecutive failure count. Reset on success or state change. */
const rtRetryCount = new Map<number, number>();

/** Deferred RT advancements: buyer was AFK when map completed. txnId → true */
const deferredRtAdvancements = new Map<number, boolean>();

export function advanceRtTransactionsForMap(mhMapId: number): void {
  const rtTxns = findRtTransactionsAwaitingCompletion(mhMapId);
  if (rtTxns.length === 0) return;

  console.log(`[orchestrator] map ${mhMapId} completed, advancing ${rtTxns.length} RT txn(s)`);

  for (const { id, buyer_user_id } of rtTxns) {
    if (isUserAfk(buyer_user_id)) {
      deferredRtAdvancements.set(id, true);
      console.log(`[orchestrator] deferring RT advancement for txn ${id} (buyer ${buyer_user_id} AFK)`);
      continue;
    }
    advanceState(id, "claiming_chest");
  }
}

export function resumeDeferredRtAdvancements(userId: number): void {
  for (const [txnId] of deferredRtAdvancements) {
    const row = findTransactionById(txnId);
    if (!row || row.buyer_user_id !== userId) continue;
    if (row.state !== "awaiting_map_completion") continue;

    deferredRtAdvancements.delete(txnId);
    console.log(`[orchestrator] resuming deferred RT for txn ${txnId} (buyer ${userId} active)`);
    advanceState(txnId, "claiming_chest");
  }
}

/**
 * Resume RT steps for transactions stuck in RT flow states after server restart.
 * Also resumes deferred RT advancements (AFK buyer reconnected).
 */
export function resumeRtStepsOnConnect(userId: number): void {
  resumeDeferredRtAdvancements(userId);
  const pendingRt = findPendingTransactions().filter(
    (r) => r.buyer_user_id === userId &&
      (r.state === "claiming_chest" || r.state === "opening_chest" || r.state === "transferring_rt")
  );

  for (const row of pendingRt) {
    console.log(`[orchestrator] resuming RT steps for txn ${row.id} (state: ${row.state})`);
    queueMicrotask(() => {
      const txn = rowToTransaction(row);
      const step = getStepForState(row.state);
      if (!step) return;

      switch (row.state) {
        case "claiming_chest": {
          const sellOrder = findOrderById(row.sell_order_id);
          const mapTypeRow = sellOrder ? findMapTypeById(sellOrder.map_type_id) : undefined;
          enqueueStep(userId, row.id, "rt_claim_chest", {
            mhMapId: row.mh_map_id,
            mapType: mapTypeRow?.map_type ?? "",
          });
          setStepTimeout(row.id, RT_STEP_TIMEOUT_MS);
          break;
        }
        case "opening_chest": {
          const sellOrder2 = findOrderById(row.sell_order_id);
          const mapTypeRow2 = sellOrder2 ? findMapTypeById(sellOrder2.map_type_id) : undefined;
          enqueueStep(userId, row.id, "rt_open_chest", {
            chestItemType: mapTypeRow2?.map_type ?? "",
          });
          setStepTimeout(row.id, RT_STEP_TIMEOUT_MS);
          break;
        }
        case "transferring_rt": {
          const nextItem = findNextPendingRtItem(row.id);
          if (nextItem) {
            enqueueStep(userId, row.id, "rt_transfer_item", {
              sellerSnUserId: row.seller_mh_sn_user_id,
              itemType: nextItem.item_type,
              itemName: nextItem.item_name,
              quantity: nextItem.quantity,
            });
            setStepTimeout(row.id, RT_STEP_TIMEOUT_MS);
          } else {
            completeTransaction(row.id);
          }
          break;
        }
      }
    });
  }
}

/**
 * Handle manual RT confirmation from a buyer who claimed chest externally.
 * The buyer confirms they've returned tradables manually.
 */
export function handleRtManualConfirm(userId: number, payload: {
  transactionId: number;
}): void {
  const row = findTransactionById(payload.transactionId);
  if (!row || row.buyer_user_id !== userId) return;

  if (row.state !== "awaiting_map_completion" &&
      row.state !== "claiming_chest" &&
      row.state !== "opening_chest" &&
      row.state !== "transferring_rt") {
    return;
  }

  console.log(`[orchestrator] manual RT confirm for txn ${payload.transactionId} by user ${userId}`);

  clearStepTimeout(payload.transactionId);

  audit("rt_manual_confirm", userId, {
    transactionId: payload.transactionId,
    previousState: row.state,
  });

  clearPendingRtConfirmation(userId);

  completeTransaction(payload.transactionId);
}

/**
 * Trigger RT manual fallback for a buyer who left their map before the auto RT flow.
 * Sends rt_manual_confirm_prompt to buyer and blocks them from matching.
 */
export function triggerRtManualFallback(userId: number, txnId: number): void {
  const row = findTransactionById(txnId);
  if (!row || row.buyer_user_id !== userId) return;
  if (row.state !== "awaiting_map_completion") return;

  const sellerUser = findUserById(row.seller_user_id);
  const sellerUsername = sellerUser?.username ?? "Unknown";

  console.log(`[orchestrator] RT manual fallback for txn ${txnId}, buyer ${userId} left map`);

  markPendingRtConfirmation(userId);

  sendToUser(userId, {
    type: "rt_manual_confirm_prompt",
    payload: {
      transactionId: txnId,
      sellerSnUserId: row.seller_mh_sn_user_id,
      sellerUsername,
    },
  });

  audit("rt_manual_fallback", userId, {
    transactionId: txnId,
    sellerUserId: row.seller_user_id,
  });
}

const SLOT_FAST_STATES = new Set<SlotTransactionState>([
  "risk_checking",
  "validating",
  "inviting",
  "invite_sent",
  "accepting",
  "cancelling_invite",
  "invite_accepted",
  "transferring",
  "claiming_chest",
  "opening_chest",
  "transferring_rt",
]);

function countDrainableSlotTransactions(): number {
  return findPendingTransactions().filter((r) =>
    SLOT_FAST_STATES.has(r.state as SlotTransactionState)
  ).length;
}

registerDrainableCounter(countDrainableSlotTransactions);
