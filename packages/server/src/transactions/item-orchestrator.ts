// Flow: pending → validating → seller_transferring → verifying_item_receipt → buyer_transferring → verifying_sb_receipt → completed
// Recovery: buyer_transferring failure → pending_payment → retry on reconnect

import type {
  ItemTransaction,
  ItemTransactionState,
  ItemStepType,
} from "@mhcm/shared";
import {
  ITEM_TRANSACTION_STEP_TIMEOUT_MS,
  ITEM_PENDING_PAYMENT_MAX_RETRIES,
  itemSbTotal,
} from "@mhcm/shared";
import {
  findItemTransactionById,
  findPendingItemTransactions,
  findItemPendingPaymentTransactions,
  updateItemTransactionState,
  incrementItemPaymentRetryCount,
  recordItemPriceHistory,
  setItemSellerTransferTs,
  setItemBuyerTransferTs,
  type ItemTransactionRow,
} from "../db/queries/item-transactions.js";
import {
  reverseItemOrderFill,
  closeItemOrderWithReason,
  findItemOrderById,
} from "../db/queries/item-orders.js";
import { findItemTypeById } from "../db/queries/item-types.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { sendToUser, getConnection } from "../ws/connections.js";
import { audit } from "../audit.js";
import { createSuspension } from "../db/queries/users.js";
import { matchItemOrders } from "../orders/item-matcher.js";
import { broadcastItemOrderBook } from "../orders/item-book.js";
import { registerDrainableCounter } from "../drain.js";
import { startVerification, cancelVerification } from "./verify-utils.js";

export function rowToItemTransaction(row: ItemTransactionRow): ItemTransaction {
  const itemType = findItemTypeById(row.item_type_id);
  return {
    id: row.id,
    sellOrderId: row.sell_order_id,
    buyOrderId: row.buy_order_id,
    sellerUserId: row.seller_user_id,
    buyerUserId: row.buyer_user_id,
    itemTypeId: row.item_type_id,
    itemType: row.item_type,
    itemName: itemType?.name ?? "",
    itemThumbnail: itemType?.thumbnail ?? null,
    price: row.price,
    quantity: row.quantity,
    state: row.state,
    sellerMhSnUserId: row.seller_mh_sn_user_id,
    buyerMhSnUserId: row.buyer_mh_sn_user_id,
    failureReason: row.failure_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const stepTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

const failureTracker = new Map<number, { count: number; lastFail: number }>();
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_WINDOW_MS = 10_000;

interface QueuedStep {
  txnId: number;
  userId: number;
  step: ItemStepType;
  data: Record<string, unknown>;
}

const inflightStep = new Map<number, number>();
const stepQueue = new Map<number, QueuedStep[]>();

function getStepUserId(step: ItemStepType, row: ItemTransactionRow): number {
  switch (step) {
    case "item_validate_seller":
    case "item_transfer_items":
      return row.seller_user_id;
    case "item_validate_buyer":
    case "item_transfer_sb":
      return row.buyer_user_id;
  }
}

function getStepForState(state: ItemTransactionState): ItemStepType | null {
  switch (state) {
    case "validating":
      // Could be either validate_seller or validate_buyer – use seller as default
      // (timeout handler just needs a user to drain)
      return "item_validate_seller";
    case "seller_transferring":
      return "item_transfer_items";
    case "buyer_transferring":
      return "item_transfer_sb";
    default:
      return null;
  }
}

function enqueueStep(
  userId: number,
  txnId: number,
  step: ItemStepType,
  data: Record<string, unknown>
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
  step: ItemStepType,
  data: Record<string, unknown>
): void {
  inflightStep.set(userId, txnId);
  sendToUser(userId, {
    type: "item_execute_step",
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

  const row = findItemTransactionById(next.txnId);
  if (!row || row.state === "completed" || row.state === "failed") {
    drainUserQueue(userId);
    return;
  }

  doSendStep(userId, next.txnId, next.step, next.data);
}

export function startItemTransaction(txnId: number): void {
  const row = findItemTransactionById(txnId);
  if (!row || row.state !== "pending") return;

  const txn = rowToItemTransaction(row);

  sendToUser(txn.sellerUserId, {
    type: "item_transaction_update",
    payload: { transaction: txn },
  });
  sendToUser(txn.buyerUserId, {
    type: "item_transaction_update",
    payload: { transaction: txn },
  });

  advanceState(txnId, "validating");
}

export function handleItemStepResult(payload: {
  transactionId: number;
  step: ItemStepType;
  success: boolean;
  error?: string;
  quantity?: number;
  transferTimestampUtc?: string;
}): void {
  const { transactionId, step, success, error, quantity } = payload;

  clearStepTimeout(transactionId);

  const row = findItemTransactionById(transactionId);
  if (!row) return;

  const stepUserId = getStepUserId(step, row);
  inflightStep.delete(stepUserId);

  if (!success) {
    handleStepFailure(transactionId, row, step, error || "unknown");
    drainUserQueue(stepUserId);
    return;
  }

  switch (step) {
    case "item_validate_seller":
      if (row.state === "validating") {
        if (quantity != null && quantity < row.quantity) {
          closeOrderAndFail(
            transactionId,
            row,
            "seller",
            "Item(s) no longer found"
          );
        } else {
          enqueueStep(row.buyer_user_id, transactionId, "item_validate_buyer", {
            itemType: "super_brie_cheese",
            requiredAmount: itemSbTotal(row.price, row.quantity),
          });
        }
      }
      break;

    case "item_validate_buyer":
      if (row.state === "validating") {
        if (quantity != null && quantity < itemSbTotal(row.price, row.quantity)) {
          closeOrderAndFail(
            transactionId,
            row,
            "buyer",
            "Insufficient SB"
          );
        } else {
          advanceState(transactionId, "seller_transferring");
        }
      }
      break;

    case "item_transfer_items":
      if (row.state === "seller_transferring") {
        const sellerMhAccount = findMHAccountByUserId(row.seller_user_id);
        const itemType = findItemTypeById(row.item_type_id);
        const transferTimestampUtc = payload.transferTimestampUtc ?? new Date().toISOString();
        setItemSellerTransferTs(transactionId, transferTimestampUtc);
        advanceState(transactionId, "verifying_item_receipt");
        startVerification(
          transactionId,
          row.buyer_user_id,
          "items",
          {
            verificationType: "item_receipt",
            senderMhUserId: sellerMhAccount ? String(sellerMhAccount.mh_user_id) : "",
            itemDisplayName: itemType?.name ?? "",
            quantity: row.quantity,
            transferTimestampUtc,
          },
          () => advanceState(transactionId, "buyer_transferring"),
          () => {
            const currentRow = findItemTransactionById(transactionId);
            if (currentRow) {
              createSuspension(currentRow.seller_user_id, null, "Item transfer could not be verified (possible fraud)", null);
              getConnection(currentRow.seller_user_id)?.ws.close(4003, "Account suspended");
              closeOrderAndFail(transactionId, currentRow, "seller", "Item receipt could not be verified after 3 attempts");
              audit("verification_failed", undefined, {
                txnId: transactionId,
                marketplace: "items",
                verificationType: "item_receipt",
                failingParty: currentRow.seller_user_id,
                attemptCount: 3,
              });
            }
          },
        );
      }
      break;

    case "item_transfer_sb":
      if (row.state === "buyer_transferring") {
        const buyerMhAccount = findMHAccountByUserId(row.buyer_user_id);
        const transferTimestampUtc = payload.transferTimestampUtc ?? new Date().toISOString();
        setItemBuyerTransferTs(transactionId, transferTimestampUtc);
        advanceState(transactionId, "verifying_sb_receipt");
        startVerification(
          transactionId,
          row.seller_user_id,
          "items",
          {
            verificationType: "sb_receipt",
            senderMhUserId: buyerMhAccount ? String(buyerMhAccount.mh_user_id) : "",
            itemDisplayName: "SUPER|brie+",
            quantity: itemSbTotal(row.price, row.quantity),
            transferTimestampUtc,
          },
          () => completeTransaction(transactionId),
          () => suspendBuyerAndFail(transactionId, "SB receipt could not be verified after 3 attempts"),
        );
      }
      break;
  }

  drainUserQueue(stepUserId);
}

function advanceState(
  txnId: number,
  newState: ItemTransactionState
): void {
  const row = findItemTransactionById(txnId);
  if (!row) return;

  updateItemTransactionState(txnId, newState);

  audit("item_transaction_state_change", undefined, {
    transactionId: txnId,
    fromState: row.state,
    toState: newState,
  });

  const txn = rowToItemTransaction({ ...row, state: newState });
  broadcastTransactionUpdate(txn);

  switch (newState) {
    case "validating":
      enqueueStep(row.seller_user_id, txnId, "item_validate_seller", {
        itemType: row.item_type,
        requiredQuantity: row.quantity,
      });
      break;

    case "seller_transferring":
      enqueueStep(row.seller_user_id, txnId, "item_transfer_items", {
        receiverSnUserId: row.buyer_mh_sn_user_id,
        itemType: row.item_type,
        quantity: row.quantity,
      });
      break;

    case "buyer_transferring":
      enqueueStep(row.buyer_user_id, txnId, "item_transfer_sb", {
        receiverSnUserId: row.seller_mh_sn_user_id,
        amount: itemSbTotal(row.price, row.quantity),
      });
      break;
  }
}

function completeTransaction(txnId: number): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);
  updateItemTransactionState(txnId, "completed");

  const row = findItemTransactionById(txnId);
  if (!row) return;

  const txn = rowToItemTransaction(row);
  broadcastTransactionUpdate(txn);

  audit("item_transaction_completed", undefined, {
    transactionId: txnId,
    sellerUserId: txn.sellerUserId,
    buyerUserId: txn.buyerUserId,
    itemTypeId: txn.itemTypeId,
    price: txn.price,
    quantity: txn.quantity,
  });

  recordItemPriceHistory(txn.itemTypeId, txn.price, txn.quantity);

  failureTracker.delete(row.item_type_id);

  scheduleRematch(row.item_type_id);
}

function failTransaction(txnId: number, reason: string): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);
  updateItemTransactionState(txnId, "failed", reason);

  const row = findItemTransactionById(txnId);
  if (!row) return;

  const txn = rowToItemTransaction(row);
  broadcastTransactionUpdate(txn);

  audit("item_transaction_failed", undefined, {
    transactionId: txnId,
    sellerUserId: txn.sellerUserId,
    buyerUserId: txn.buyerUserId,
    itemTypeId: txn.itemTypeId,
    reason,
  });

  reverseItemOrderFill(txn.sellOrderId, txn.quantity);
  reverseItemOrderFill(txn.buyOrderId, txn.quantity);

  const now = Date.now();
  const entry = failureTracker.get(row.item_type_id);
  if (entry && now - entry.lastFail < FAILURE_WINDOW_MS) {
    entry.count++;
    entry.lastFail = now;
  } else {
    failureTracker.set(row.item_type_id, { count: 1, lastFail: now });
  }

  const current = failureTracker.get(row.item_type_id)!;
  if (current.count < MAX_CONSECUTIVE_FAILURES) {
    scheduleRematch(row.item_type_id);
  } else {
    console.log(
      `[item-orchestrator] circuit breaker: pausing rematch for item type ${row.item_type_id} after ${current.count} consecutive failures`
    );
    broadcastItemOrderBook(row.item_type_id);
  }
}

function handleStepFailure(
  txnId: number,
  row: ItemTransactionRow,
  step: ItemStepType,
  error: string
): void {
  if (
    step === "item_transfer_sb" &&
    row.state === "buyer_transferring"
  ) {
    const newCount = incrementItemPaymentRetryCount(txnId);
    if (newCount > ITEM_PENDING_PAYMENT_MAX_RETRIES) {
      suspendBuyerAndFail(txnId, `SB payment failed after ${newCount} attempts`);
    } else {
      enqueueStep(row.buyer_user_id, txnId, "item_transfer_sb", {
        receiverSnUserId: row.seller_mh_sn_user_id,
        amount: itemSbTotal(row.price, row.quantity),
      });
    }
  } else if (step === "item_validate_seller" && row.state === "validating") {
    closeOrderAndFail(txnId, row, "seller", `Validation failed: ${error}`);
  } else if (step === "item_validate_buyer" && row.state === "validating") {
    closeOrderAndFail(txnId, row, "buyer", `Validation failed: ${error}`);
  } else {
    failTransaction(txnId, `Step ${step} failed: ${error}`);
  }
}

/**
 * Close the failing party's order, reverse fills, return the other party's
 * order to the book, and re-match.
 */
function closeOrderAndFail(
  txnId: number,
  row: ItemTransactionRow,
  failingParty: "seller" | "buyer",
  reason: string
): void {
  clearStepTimeout(txnId);
  updateItemTransactionState(txnId, "failed", reason);

  const txn = rowToItemTransaction({ ...row, state: "failed" as ItemTransactionState, failure_reason: reason });
  broadcastTransactionUpdate(txn);

  audit("item_transaction_failed", undefined, {
    transactionId: txnId,
    sellerUserId: row.seller_user_id,
    buyerUserId: row.buyer_user_id,
    itemTypeId: row.item_type_id,
    reason,
    failingParty,
  });

  reverseItemOrderFill(row.sell_order_id, row.quantity);
  reverseItemOrderFill(row.buy_order_id, row.quantity);

  if (failingParty === "seller") {
    closeItemOrderWithReason(row.sell_order_id, reason);
    const sellOrder = findItemOrderById(row.sell_order_id);
    if (sellOrder) {
      sendToUser(row.seller_user_id, {
        type: "item_order_cancelled",
        payload: { orderId: row.sell_order_id },
      });
    }
  } else {
    closeItemOrderWithReason(row.buy_order_id, reason);
    const buyOrder = findItemOrderById(row.buy_order_id);
    if (buyOrder) {
      sendToUser(row.buyer_user_id, {
        type: "item_order_cancelled",
        payload: { orderId: row.buy_order_id },
      });
    }
  }

  scheduleRematch(row.item_type_id);
}

/**
 * Enter pending_payment state when SB transfer fails after seller sent items.
 * Items are gone, SB wasn't sent. Retry on buyer reconnect.
 */
function enterPendingPayment(txnId: number, reason: string): void {
  clearStepTimeout(txnId);

  const row = findItemTransactionById(txnId);
  if (!row) return;

  updateItemTransactionState(txnId, "pending_payment", reason);

  const txn = rowToItemTransaction({ ...row, state: "pending_payment" as ItemTransactionState });
  broadcastTransactionUpdate(txn);

  audit("item_transaction_state_change", undefined, {
    transactionId: txnId,
    fromState: row.state,
    toState: "pending_payment",
    reason,
  });

  console.log(`[item-orchestrator] txn ${txnId} entered pending_payment: ${reason}`);

  // Don't reverse fills – items are already sent, payment may still succeed
}

function suspendBuyerAndFail(txnId: number, reason: string): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);
  updateItemTransactionState(txnId, "failed", reason);

  const row = findItemTransactionById(txnId);
  if (!row) return;

  const txn = rowToItemTransaction(row);
  broadcastTransactionUpdate(txn);

  audit("item_transaction_failed", undefined, {
    transactionId: txnId,
    sellerUserId: row.seller_user_id,
    buyerUserId: row.buyer_user_id,
    itemTypeId: row.item_type_id,
    reason,
    failingParty: row.buyer_user_id,
  });

  // Items are physically with buyer – do NOT reverse sell fill
  reverseItemOrderFill(row.buy_order_id, row.quantity);
  closeItemOrderWithReason(row.buy_order_id, reason);
  createSuspension(row.buyer_user_id, null, "Failed to complete SB payment (possible fraud)", null);
  getConnection(row.buyer_user_id)?.ws.close(4003, "Account suspended");

  // Sell order stays in its current state (may re-match for remaining qty)
  scheduleRematch(row.item_type_id);
}

export function retryItemPendingPayment(txnId: number): void {
  const row = findItemTransactionById(txnId);
  if (!row || row.state !== "pending_payment") return;

  const newCount = incrementItemPaymentRetryCount(txnId);
  if (newCount > ITEM_PENDING_PAYMENT_MAX_RETRIES) {
    suspendBuyerAndFail(txnId, "Max payment retries exceeded");
    return;
  }

  updateItemTransactionState(txnId, "buyer_transferring");

  const txn = rowToItemTransaction({ ...row, state: "buyer_transferring" as ItemTransactionState });
  broadcastTransactionUpdate(txn);

  enqueueStep(row.buyer_user_id, txnId, "item_transfer_sb", {
    receiverSnUserId: row.seller_mh_sn_user_id,
    amount: itemSbTotal(row.price, row.quantity),
  });

  audit("item_transaction_state_change", undefined, {
    transactionId: txnId,
    fromState: "pending_payment",
    toState: "buyer_transferring",
    retryAttempt: newCount,
  });

  console.log(`[item-orchestrator] retrying payment for txn ${txnId} (attempt ${newCount})`);
}

export function checkItemPendingPaymentsOnConnect(userId: number): void {
  const pending = findItemPendingPaymentTransactions(userId);
  if (pending.length === 0) return;

  console.log(`[item-orchestrator] user ${userId} reconnected with ${pending.length} pending item payment(s)`);

  for (const row of pending) {
    queueMicrotask(() => retryItemPendingPayment(row.id));
  }
}

function broadcastTransactionUpdate(txn: ItemTransaction): void {
  sendToUser(txn.sellerUserId, {
    type: "item_transaction_update",
    payload: { transaction: txn },
  });
  sendToUser(txn.buyerUserId, {
    type: "item_transaction_update",
    payload: { transaction: txn },
  });
}

function scheduleRematch(itemTypeId: number): void {
  queueMicrotask(() => {
    matchItemOrders(itemTypeId);
    broadcastItemOrderBook(itemTypeId);
  });
}

function setStepTimeout(txnId: number): void {
  clearStepTimeout(txnId);
  stepTimeouts.set(
    txnId,
    setTimeout(() => {
      stepTimeouts.delete(txnId);

      const row = findItemTransactionById(txnId);
      const stepType = row ? getStepForState(row.state) : null;
      const userId = row && stepType ? getStepUserId(stepType, row) : null;

      if (userId != null) {
        inflightStep.delete(userId);
      }

      if (row?.state === "buyer_transferring") {
        enterPendingPayment(txnId, "Step timed out");
      } else {
        failTransaction(txnId, "Step timed out");
      }

      if (userId != null) {
        drainUserQueue(userId);
      }
    }, ITEM_TRANSACTION_STEP_TIMEOUT_MS)
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
 * Handle stuck item transactions from a previous run.
 *
 * - pending_payment: Leave alone, will retry when buyer reconnects
 * - seller_transferring: Unknown if items sent – verify with buyer; if not received, fail
 * - verifying_item_receipt: Items were sent, verification in progress – advance to buyer_transferring
 * - buyer_transferring: SB transfer in progress, no timestamp – enter pending_payment
 * - verifying_sb_receipt: SB sent, verification in progress – re-start verification
 * - Other non-terminal states: Fail and reverse fills
 */
export function cleanupStuckItemTransactions(): void {
  inflightStep.clear();
  stepQueue.clear();

  const stuck = findPendingItemTransactions();
  if (stuck.length === 0) return;

  console.log(`[item-orchestrator] processing ${stuck.length} stuck item transaction(s)`);

  for (const row of stuck) {
    if (row.state === "pending_payment") {
      console.log(`[item-orchestrator] txn ${row.id} in pending_payment – will retry on reconnect`);
      continue;
    }

    if (row.state === "seller_transferring") {
      // Unknown whether items were transferred – verify with buyer before proceeding
      const timeAnchor = row.seller_transfer_ts ?? row.updated_at;
      const sellerMhAccount = findMHAccountByUserId(row.seller_user_id);
      const itemType = findItemTypeById(row.item_type_id);
      updateItemTransactionState(row.id, "verifying_item_receipt", "server restarted during transfer");
      const restartedTxn = rowToItemTransaction({ ...row, state: "verifying_item_receipt" as ItemTransactionState });
      broadcastTransactionUpdate(restartedTxn);
      audit("item_transaction_state_change", undefined, {
        transactionId: row.id,
        fromState: row.state,
        toState: "verifying_item_receipt",
        reason: "server restarted during transfer",
      });
      startVerification(
        row.id,
        row.buyer_user_id,
        "items",
        {
          verificationType: "item_receipt",
          senderMhUserId: sellerMhAccount ? String(sellerMhAccount.mh_user_id) : "",
          itemDisplayName: itemType?.name ?? "",
          quantity: row.quantity,
          transferTimestampUtc: timeAnchor,
        },
        () => advanceState(row.id, "buyer_transferring"),
        () => failTransaction(row.id, "Item receipt could not be verified after server restart"),
      );
      console.log(`[item-orchestrator] txn ${row.id} in seller_transferring at restart – verifying with buyer`);
      continue;
    }

    if (row.state === "buyer_transferring") {
      // SB transfer was in progress with no timestamp – enter pending_payment to retry on reconnect
      updateItemTransactionState(row.id, "pending_payment", "server restarted during payment");
      audit("item_transaction_state_change", undefined, {
        transactionId: row.id,
        fromState: row.state,
        toState: "pending_payment",
        reason: "server restarted during payment",
      });
      console.log(`[item-orchestrator] promoted txn ${row.id} from buyer_transferring to pending_payment`);
      continue;
    }

    if (row.state === "verifying_sb_receipt") {
      // Buyer reported SB sent, verification was in progress – re-enter verification
      const timeAnchor = row.buyer_transfer_ts ?? row.updated_at;
      const buyerMhAccount = findMHAccountByUserId(row.buyer_user_id);
      startVerification(
        row.id,
        row.seller_user_id,
        "items",
        {
          verificationType: "sb_receipt",
          senderMhUserId: buyerMhAccount ? String(buyerMhAccount.mh_user_id) : "",
          itemDisplayName: "SUPER|brie+",
          quantity: itemSbTotal(row.price, row.quantity),
          transferTimestampUtc: timeAnchor,
        },
        () => completeTransaction(row.id),
        () => {
          updateItemTransactionState(row.id, "pending_payment", "SB verification failed after restart");
          const retryTxn = rowToItemTransaction({ ...row, state: "pending_payment" as ItemTransactionState });
          broadcastTransactionUpdate(retryTxn);
          audit("item_transaction_state_change", undefined, {
            transactionId: row.id,
            fromState: "verifying_sb_receipt",
            toState: "pending_payment",
            reason: "SB verification failed after restart",
          });
        },
      );
      console.log(`[item-orchestrator] txn ${row.id} in verifying_sb_receipt at restart – re-verifying with seller`);
      continue;
    }

    if (row.state === "verifying_item_receipt") {
      // Items were sent before restart – enter pending_payment so the buyer's SB step retries on reconnect
      updateItemTransactionState(row.id, "pending_payment", "server restarted during verification");

      audit("item_transaction_state_change", undefined, {
        transactionId: row.id,
        fromState: row.state,
        toState: "pending_payment",
        reason: "server restarted during verification",
      });

      console.log(`[item-orchestrator] promoted txn ${row.id} from verifying_item_receipt to pending_payment`);
      continue;
    }

    updateItemTransactionState(row.id, "failed", "server restarted");
    reverseItemOrderFill(row.sell_order_id, row.quantity);
    reverseItemOrderFill(row.buy_order_id, row.quantity);

    audit("item_transaction_failed", undefined, {
      transactionId: row.id,
      sellerUserId: row.seller_user_id,
      buyerUserId: row.buyer_user_id,
      itemTypeId: row.item_type_id,
      reason: "server restarted",
      previousState: row.state,
    });

    console.log(`[item-orchestrator] failed txn ${row.id} (was ${row.state})`);
  }
}

const ITEM_FAST_STATES = new Set<ItemTransactionState>([
  "validating",
  "seller_transferring",
  "buyer_transferring",
]);

function countDrainableItemTransactions(): number {
  return findPendingItemTransactions().filter((r) =>
    ITEM_FAST_STATES.has(r.state as ItemTransactionState)
  ).length;
}

registerDrainableCounter(countDrainableItemTransactions);
