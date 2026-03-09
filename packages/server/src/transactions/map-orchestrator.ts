// UNOPENED FLOW (with cross-verification):
//   pending → validating_seller → validating_buyer → transferring_sb
//   → verifying_sb_receipt → verifying_map_free → opening_scroll
//   → verifying_scroll_opened → [PONR] → inviting → verifying_invite_sent
//   → accepting → transferring_ownership
//   → verifying_ownership → seller_leaving → verifying_seller_left
//   → pending_completion → completed
//
// COMPLETED FLOW (with cross-verification):
//   pending → risk_checking → validating_seller → validating_buyer → inviting
//   → verifying_invite_sent → transferring_sb → verifying_sb_receipt → [PONR]
//   → accepting → transferring_ownership → verifying_ownership
//   → seller_leaving → verifying_seller_left → pending_completion → completed
//
// Recovery:
//   - Pre-PONR failures → rollback + fail
//   - Post-PONR failures → pending_completion → retry on reconnect (max 1 retry)
//   - Unopened: scroll open failed after SB paid → reversing_sb → refund + fail
//   - Completed: SB transfer failed after invite → cancelling_invite → fail
//   - Completed: verifying_sb_receipt fraud → suspend buyer, cancelling_invite (fraud path)

import type {
  MapTransaction,
  MapTransactionState,
  MapStepType,
  MapOrderMode,
  MHMapClass,
} from "@mhcm/shared";
import { registerDrainableCounter } from "../drain.js";
import {
  MAP_TRANSACTION_STEP_TIMEOUT_MS,
  MAP_PENDING_COMPLETION_MAX_RETRIES,
} from "@mhcm/shared";
import {
  findMapTransactionById,
  findPendingMapTransactions,
  findMapPendingCompletionTransactions,
  findActiveMapTransactionForBuyOrder,
  updateMapTransactionState,
  getMapRetryCount,
  incrementMapRetryCount,
  recordMapPriceHistory,
  setMapSbTransferTs,
  type MapTransactionRow,
} from "../db/queries/map-transactions.js";
import {
  reverseMapOrderFill,
  closeMapOrderWithReason,
  findMapOrderById,
} from "../db/queries/map-orders.js";
import { findMapTypeById, getMapTypeClass } from "../db/queries/map-types.js";
import { getDb } from "../db/connection.js";
import {
  sendToUser,
  isUserOnline,
  markBuyerBusy,
  markBuyerAvailable,
  addUserActiveMap,
  getUserActiveMaps,
  getUserActiveMapsFull,
  getConnection,
} from "../ws/connections.js";
import { audit } from "../audit.js";
import { matchMapOrders } from "../orders/map-matcher.js";
import { broadcastMapOrderBook } from "../orders/map-book.js";
import { enrichGoalData } from "./risk-check-utils.js";
import { startVerification, cancelVerification, isVerificationPending } from "./verify-utils.js";
import { createSuspension } from "../db/queries/users.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { getItemRiskConfig } from "../db/queries/item-types.js";
import { getRiskCheckTimeoutSeconds } from "../settings.js";
import {
  findMapRiskDecision,
  upsertMapRiskDecision,
  deleteMapRiskDecision,
  deleteMapRiskDecisionsForSellOrder,
} from "../db/queries/risk-decisions.js";

export function rowToMapTransaction(row: MapTransactionRow): MapTransaction {
  const mapType = findMapTypeById(row.map_type_id);
  return {
    id: row.id,
    sellOrderId: row.sell_order_id,
    buyOrderId: row.buy_order_id,
    sellerUserId: row.seller_user_id,
    buyerUserId: row.buyer_user_id,
    mapTypeId: row.map_type_id,
    mode: row.mode,
    price: row.price,
    quantity: row.quantity,
    state: row.state,
    mhMapId: row.mh_map_id,
    scrollItemType: row.scroll_item_type,
    sellerMhSnUserId: row.seller_mh_sn_user_id,
    buyerMhSnUserId: row.buyer_mh_sn_user_id,
    failureReason: row.failure_reason,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const stepTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

function setStepTimeout(txnId: number): void {
  clearStepTimeout(txnId);
  const timeoutId = setTimeout(() => {
    handleTimeout(txnId);
  }, MAP_TRANSACTION_STEP_TIMEOUT_MS);
  stepTimeouts.set(txnId, timeoutId);
}

function clearStepTimeout(txnId: number): void {
  const timeoutId = stepTimeouts.get(txnId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    stepTimeouts.delete(txnId);
  }
}

const STEP_TIMEOUT_MAX_RETRIES = 3;

function handleTimeout(txnId: number): void {
  const row = findMapTransactionById(txnId);
  if (!row || row.state === "completed" || row.state === "failed") return;

  const userId = getTimeoutUserId(row);
  if (userId != null) {
    inflightStep.delete(userId);
  }

  const retryCount = row.retry_count;
  if (retryCount < STEP_TIMEOUT_MAX_RETRIES) {
    console.warn(
      `[map-orchestrator] transaction ${txnId} timed out in state ${row.state}, retrying (attempt ${retryCount + 1}/${STEP_TIMEOUT_MAX_RETRIES})`
    );
    incrementMapRetryCount(txnId);

    if (row.mode === "unopened") {
      advanceUnopenedState(row, row.state);
    } else {
      advanceCompletedState(row, row.state);
    }
  } else {
    if (row.mode === "unopened" && UNOPENED_POST_PONR_STEP_STATES.has(row.state as MapTransactionState)) {
      // Post-PONR step timed out after max retries in unopened flow -- advance to pending_completion.
      console.warn(
        `[map-orchestrator] txn ${txnId} post-PONR step ${row.state} timed out (max retries) -- advancing to pending_completion`
      );
      advanceState(txnId, "pending_completion");
    } else if (row.state === "cancelling_invite") {
      // cancelling_invite is a recovery state, not truly post-PONR.
      // Timeout should fail the txn (same as step failure), not complete it.
      reverseMapOrderFill(row.sell_order_id, row.quantity);
      reverseMapOrderFill(row.buy_order_id, row.quantity);
      failTransaction(txnId, row, "Step timeout (max retries exceeded)", true);
    } else if (row.mode === "completed" && !COMPLETED_PRE_PONR_STEP_STATES.has(row.state as MapTransactionState)) {
      // Post-PONR step timed out after max retries in completed flow – advance to pending_completion.
      // SB has been paid; reversing fills is incorrect.
      console.warn(
        `[map-orchestrator] txn ${txnId} post-PONR step ${row.state} timed out (max retries) – advancing to pending_completion`
      );
      advanceState(txnId, "pending_completion");
    } else if (row.mode === "unopened" && row.state === "opening_scroll") {
      // Scroll open timed out after SB paid -- refund buyer via reversing_sb
      console.warn(
        `[map-orchestrator] txn ${txnId} opening_scroll timed out (max retries) – reversing SB`
      );
      advanceState(txnId, "reversing_sb");
    } else if (row.mode === "unopened" && row.state === "reversing_sb") {
      // SB refund timed out -- park and retry on seller reconnect
      console.warn(
        `[map-orchestrator] txn ${txnId} reversing_sb timed out (max retries) – parking for seller reconnect`
      );
      parkedTransactions.set(txnId, "seller");
      broadcastTransactionUpdate(rowToMapTransaction(row));
    } else {
      console.error(
        `[map-orchestrator] transaction ${txnId} timed out in state ${row.state}, max retries (${STEP_TIMEOUT_MAX_RETRIES}) exhausted`
      );
      failTransaction(txnId, row, "Step timeout (max retries exceeded)", false);
    }
  }

  if (userId != null) {
    drainUserQueue(userId);
  }
}

function getTimeoutUserId(row: MapTransactionRow): number | null {
  switch (row.state) {
    case "validating_seller":
    case "opening_scroll":
    case "inviting":
    case "transferring_ownership":
    case "seller_leaving":
    case "reversing_sb":
    case "cancelling_invite":
      return row.seller_user_id;
    case "validating_buyer":
    case "transferring_sb":
    case "accepting":
      return row.buyer_user_id;
    // Verifying states have no active step – no timeout user
    case "verifying_invite_sent":
    case "verifying_sb_receipt":
    case "verifying_ownership":
    case "verifying_seller_left":
    default:
      return null;
  }
}

const failureTracker = new Map<string, { count: number; firstAt: number }>();
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function trackFailure(mapTypeId: number, mode: MapOrderMode): void {
  const key = `${mapTypeId}:${mode}`;
  const now = Date.now();
  const existing = failureTracker.get(key);

  if (existing && now - existing.firstAt < FAILURE_WINDOW_MS) {
    existing.count++;
    if (existing.count >= MAX_CONSECUTIVE_FAILURES) {
      console.warn(
        `[map-orchestrator] circuit breaker: ${existing.count} failures for ${key} in ${FAILURE_WINDOW_MS}ms, pausing matching for 30min`
      );
      // TODO: Implement matcher pause mechanism
    }
  } else {
    failureTracker.set(key, { count: 1, firstAt: now });
  }
}

function resetFailureTracker(mapTypeId: number, mode: MapOrderMode): void {
  const key = `${mapTypeId}:${mode}`;
  failureTracker.delete(key);
}

/**
 * Txn IDs whose cancelling_invite was triggered by buyer SB fraud
 * (verifying_sb_receipt failure). In fraud path: buy order is closed permanently
 * and sell order re-matches; in the normal path both orders re-open.
 */
const buyerFraudCancellations = new Set<number>();

/**
 * Tracks completed-map txns where `inviting` state was found at server restart.
 * "first" = initial verification after restart (invite may not have been sent).
 * "retry" = invite was retried once after first failure.
 * Failure handling: first → retry invite without suspension; retry → closeOrderAndFail without suspension.
 */
const inviteRestartRecovery = new Map<number, "first" | "retry">();

/**
 * Tracks completed-map txns where `transferring_sb` state was found at server restart.
 * SB transfer status is unknown – if verification fails, enter cancelling_invite without
 * buyer suspension (not fraud, genuine uncertainty from restart).
 */
const sbTransferRestartTxns = new Set<number>();

/**
 * Tracks unopened-map txns where `transferring_sb` was found at server restart.
 * SB transfer status unknown – if verifying_sb_receipt fails, close without buyer suspension.
 */
const unopenedSbTransferRestartTxns = new Set<number>();

/**
 * Tracks unopened-map txns where `opening_scroll` was found at server restart with a
 * known mh_map_id (scroll was opened before crash). These txns advance directly to
 * verifying_scroll_opened; if verification fails, treat as fraud (seller fabricated map).
 */
const openScrollRestartTxns = new Set<number>();

/**
 * Tracks post-PONR unopened txns that are parked waiting for a party to reconnect.
 * Value = which party must reconnect and retry.
 * Cleared when the step is successfully re-enqueued on reconnect.
 */
const parkedTransactions = new Map<number, "seller" | "buyer">();

/** Txn IDs awaiting active maps from seller to probe for opened scroll. */
const pendingMapIdRecovery = new Set<number>();

/** Txn IDs that have already sent request_active_maps (prevent infinite loop). */
const activeMapRequested = new Set<number>();

/** txnId → remaining active map IDs left to probe. */
const recoveryProbeQueue = new Map<number, number[]>();

/**
 * Probes seller's active maps to find the map opened from a scroll when
 * the mh_map_id was lost (e.g., server crash during opening_scroll state).
 * Called from update_active_maps handler after active maps are populated.
 */
export function probeForOpenedMap(userId: number): void {
  if (pendingMapIdRecovery.size === 0) return;

  const pendingTxns = findPendingMapTransactions();
  for (const row of pendingTxns) {
    if (!pendingMapIdRecovery.has(row.id)) continue;
    if (row.state !== "opening_scroll" || row.mh_map_id != null) {
      pendingMapIdRecovery.delete(row.id);
      continue;
    }

    if (row.seller_user_id !== userId && row.buyer_user_id !== userId) continue;

    if (!isUserOnline(row.seller_user_id) || !isUserOnline(row.buyer_user_id)) continue;

    // Always probe the SELLER's active maps (scroll was opened by seller)
    const sellerActiveMapsFull = getUserActiveMapsFull(row.seller_user_id);
    if (sellerActiveMapsFull.size === 0) {
      if (!activeMapRequested.has(row.id)) {
        activeMapRequested.add(row.id);
        console.log(
          `[map-orchestrator] txn ${row.id}: seller (user ${row.seller_user_id}) has no active maps – requesting from extension`
        );
        sendToUser(row.seller_user_id, { type: "request_active_maps" });
      }
      continue;
    }

    // Filter candidates to maps of the expected class (if known)
    const mapType = findMapTypeById(row.map_type_id);
    const expectedClass = mapType?.map_class ?? null;
    let candidates: number[];
    if (expectedClass) {
      candidates = [];
      for (const [mapId, mapClass] of sellerActiveMapsFull) {
        if (mapClass === expectedClass) candidates.push(mapId);
      }
    } else {
      candidates = Array.from(sellerActiveMapsFull.keys());
    }
    console.log(
      `[map-orchestrator] txn ${row.id}: probing ${candidates.length} active maps for recovery`
    );

    pendingMapIdRecovery.delete(row.id);
    activeMapRequested.delete(row.id);
    recoveryProbeQueue.set(row.id, candidates.slice(1));

    markBuyerBusy(row.buyer_user_id);
    inflightStep.delete(row.seller_user_id);
    enqueueStep(row.seller_user_id, row.id, "map_validate_map", {
      mhMapId: candidates[0],
    });
  }
}

/**
 * Checks if the probed map matches the expected type; if not, tries the next candidate.
 */
function handleRecoveryProbeResult(
  row: MapTransactionRow,
  mapInfo: any
): void {
  const txnId = row.id;
  const mapType = findMapTypeById(row.map_type_id);

  const probeRewardType = mapInfo?.reward?.type;
  if (probeRewardType === mapType?.map_type) {
    const mapId = Number(mapInfo.map_id);
    console.log(
      `[map-orchestrator] txn ${txnId}: recovery found matching map ${mapId} (reward type: ${probeRewardType})`
    );
    getDb()
      .prepare("UPDATE map_transactions SET mh_map_id = ? WHERE id = ?")
      .run(mapId, txnId);
    recoveryProbeQueue.delete(txnId);
    openScrollRestartTxns.add(txnId);
    advanceState(txnId, "verifying_scroll_opened");
    return;
  }

  const remaining = recoveryProbeQueue.get(txnId);
  if (remaining && remaining.length > 0) {
    const next = remaining.shift()!;
    console.log(
      `[map-orchestrator] txn ${txnId}: probed map didn't match (got reward ${probeRewardType}, expected ${mapType?.map_type}), trying next (${remaining.length} remaining)`
    );
    enqueueStep(row.seller_user_id, txnId, "map_validate_map", {
      mhMapId: next,
    });
  } else {
    recoveryProbeQueue.delete(txnId);
    console.error(
      `[map-orchestrator] txn ${txnId}: no active map matched expected reward type ${mapType?.map_type} – ` +
        `manual recovery needed: UPDATE map_transactions SET mh_map_id = <id> WHERE id = ${txnId}`
    );
  }
}

interface QueuedStep {
  txnId: number;
  userId: number;
  step: MapStepType;
  data: Record<string, unknown>;
}

const inflightStep = new Map<number, number>();
const stepQueue = new Map<number, QueuedStep[]>();

function getStepUserId(step: MapStepType, row: MapTransactionRow): number {
  switch (step) {
    case "map_validate_scroll":
    case "map_validate_map":
    case "map_open_scroll":
    case "map_send_invite":
    case "map_cancel_invite":
    case "map_transfer_ownership":
    case "map_leave_map":
    case "map_reverse_sb":
      return row.seller_user_id;
    case "map_validate_sb":
    case "map_transfer_sb":
    case "map_accept_invite":
      return row.buyer_user_id;
  }
}

function enqueueStep(
  userId: number,
  txnId: number,
  step: MapStepType,
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
  step: MapStepType,
  data: Record<string, unknown>
): void {
  inflightStep.set(userId, txnId);
  sendToUser(userId, {
    type: "map_execute_step",
    payload: { transactionId: txnId, step, data: data as any },
  });
  setStepTimeout(txnId);
}

function drainUserQueue(userId: number): void {
  if (inflightStep.has(userId)) return;

  const queue = stepQueue.get(userId);
  if (!queue || queue.length === 0) return;

  const next = queue.shift()!;
  if (queue.length === 0) stepQueue.delete(userId);

  const row = findMapTransactionById(next.txnId);
  if (!row || row.state === "completed" || row.state === "failed") {
    drainUserQueue(userId);
    return;
  }

  doSendStep(userId, next.txnId, next.step, next.data);
}

export function startMapTransaction(txnId: number): void {
  const row = findMapTransactionById(txnId);
  if (!row || row.state !== "pending") return;

  const txn = rowToMapTransaction(row);

  markBuyerBusy(txn.buyerUserId);

  sendToUser(txn.sellerUserId, {
    type: "map_transaction_update",
    payload: { transaction: txn },
  });
  sendToUser(txn.buyerUserId, {
    type: "map_transaction_update",
    payload: { transaction: txn },
  });

  if (row.mode === "unopened") {
    startUnopenedFlow(txnId);
  } else {
    startCompletedFlow(txnId);
  }
}

export function handleMapStepResult(payload: {
  transactionId: number;
  step: MapStepType;
  success: boolean;
  error?: string;
  code?: string;
  quantity?: number;
  mapId?: number;
  mapType?: string;
  mapInfo?: unknown;
  transferTimestampUtc?: string;
}): void {
  const { transactionId, step, success, error, code, quantity, mapId, mapType, mapInfo, transferTimestampUtc } = payload;

  clearStepTimeout(transactionId);

  const row = findMapTransactionById(transactionId);
  if (!row) return;

  const stepUserId = getStepUserId(step, row);
  inflightStep.delete(stepUserId);

  // Recovery probe: map_validate_map during opening_scroll = probing for lost mh_map_id
  if (row.state === "opening_scroll" && step === "map_validate_map") {
    handleRecoveryProbeResult(row, mapInfo);
    drainUserQueue(stepUserId);
    return;
  }

  if (!success) {
    if (step === "map_validate_map" && row.state === "validating_seller"
        && code === "no_slots_available") {
      closeOrderAndFail(row.id, row, "seller", error || "Map is full");
    } else {
      handleStepFailure(transactionId, row, step, error || "unknown");
    }
    drainUserQueue(stepUserId);
    return;
  }

  if (row.mode === "unopened") {
    handleUnopenedStepSuccess(row, step, { quantity, mapId, mapType, transferTimestampUtc });
  } else {
    handleCompletedStepSuccess(row, step, { quantity, mapInfo, transferTimestampUtc });
  }

  drainUserQueue(stepUserId);
}

function startUnopenedFlow(txnId: number): void {
  advanceState(txnId, "validating_seller");
}

function handleUnopenedStepSuccess(
  row: MapTransactionRow,
  step: MapStepType,
  data: { quantity?: number; mapId?: number; mapType?: string; transferTimestampUtc?: string }
): void {
  const txnId = row.id;

  switch (step) {
    case "map_validate_scroll":
      if (row.state === "validating_seller") {
        if (data.quantity != null && data.quantity < 1) {
          closeOrderAndFail(txnId, row, "seller", "Scroll no longer found");
        } else {
          advanceState(txnId, "validating_buyer");
        }
      }
      break;

    case "map_validate_sb":
      if (row.state === "validating_buyer") {
        const requiredAmount = row.price * row.quantity;
        if (data.quantity != null && data.quantity < requiredAmount) {
          closeOrderAndFail(txnId, row, "buyer", "Insufficient SB");
        } else {
          advanceState(txnId, "transferring_sb");
        }
      }
      break;

    case "map_transfer_sb":
      if (row.state === "transferring_sb") {
        if (data.transferTimestampUtc) {
          setMapSbTransferTs(txnId, data.transferTimestampUtc);
        }
        advanceState(txnId, "verifying_sb_receipt");
      }
      break;

    case "map_open_scroll":
      if (row.state === "opening_scroll") {
        if (!data.mapId) {
          advanceState(txnId, "reversing_sb");
          return;
        }
        getDb().prepare("UPDATE map_transactions SET mh_map_id = ? WHERE id = ?").run(
          data.mapId,
          txnId
        );
        // PONR is crossed when verifying_scroll_opened passes (in advanceUnopenedState)
        advanceState(txnId, "verifying_scroll_opened");
      }
      break;

    case "map_send_invite":
      if (row.state === "inviting") {
        advanceState(txnId, "verifying_invite_sent");
      }
      break;

    case "map_accept_invite":
      if (row.state === "accepting") {
        advanceState(txnId, "transferring_ownership");
      }
      break;

    case "map_transfer_ownership":
      if (row.state === "transferring_ownership") {
        advanceState(txnId, "verifying_ownership");
      }
      break;

    case "map_leave_map":
      if (row.state === "seller_leaving") {
        advanceState(txnId, "verifying_seller_left");
      }
      break;

    case "map_reverse_sb":
      if (row.state === "reversing_sb") {
        failTransaction(txnId, row, "Scroll opening failed, SB refunded", true);
      }
      break;
  }
}

function startCompletedFlow(txnId: number): void {
  advanceState(txnId, "risk_checking");
}

function handleCompletedStepSuccess(
  row: MapTransactionRow,
  step: MapStepType,
  data: { quantity?: number; mapInfo?: any; transferTimestampUtc?: string }
): void {
  const txnId = row.id;

  switch (step) {
    case "map_validate_map":
      if (row.state === "validating_seller") {
        if (!data.mapInfo) {
          closeOrderAndFail(txnId, row, "seller", "Map validation failed");
          return;
        }

        if (!data.mapInfo.is_owner) {
          closeOrderAndFail(txnId, row, "seller", "Seller does not own this map");
          return;
        }

        // is_complete = true means the map is frozen – can't sell
        if (data.mapInfo.is_complete) {
          closeOrderAndFail(txnId, row, "seller", "Map is already completed – cannot sell");
          return;
        }

        const mapType = findMapTypeById(row.map_type_id);
        if (mapType && data.mapInfo.reward?.type !== mapType.map_type) {
          closeOrderAndFail(txnId, row, "seller", "Map type does not match order");
          return;
        }

        // LM/LL condition: remaining goals within lastGoalCount
        const goalKey = mapType?.goal === "item" ? "item" : "mouse";
        const goals = data.mapInfo.goals?.[goalKey];
        if (!Array.isArray(goals)) {
          closeOrderAndFail(txnId, row, "seller", "Map goals not available");
          return;
        }
        const allCompletedIds = new Set<number>();
        if (Array.isArray(data.mapInfo.hunters)) {
          for (const hunter of data.mapInfo.hunters) {
            const completed = hunter.completed_goal_ids?.[goalKey];
            if (Array.isArray(completed)) {
              for (const id of completed) allCompletedIds.add(id);
            }
          }
        }
        const remainingCount = goals.filter((g: any) => !allCompletedIds.has(g.unique_id)).length;
        const mapLastGoalCount = mapType?.last_goal_count ?? 1;
        if (remainingCount === 0 || remainingCount > mapLastGoalCount) {
          const needStr = mapLastGoalCount === 1 ? "need 1" : `need 1-${mapLastGoalCount}`;
          closeOrderAndFail(txnId, row, "seller",
            `Map does not meet LM/LL condition (${remainingCount} remaining, ${needStr})`);
          return;
        }

        // Seller must be sole active hunter – owner can't remove other hunters,
        // so a map with anyone besides the owner is unsellable. Pending invites
        // are fine – they auto-cancel on ownership transfer.
        const activeHunters = Array.isArray(data.mapInfo.hunters)
          ? data.mapInfo.hunters.filter((h: any) => h.is_active !== false)
          : [];
        if (activeHunters.length > 1) {
          closeOrderAndFail(txnId, row, "seller",
            "Map has other active hunters – seller must be sole occupant to sell");
          return;
        }

        advanceState(txnId, "validating_buyer");
      }
      break;

    case "map_validate_sb":
      if (row.state === "validating_buyer") {
        const requiredAmount = row.price * row.quantity;
        if (data.quantity != null && data.quantity < requiredAmount) {
          closeOrderAndFail(txnId, row, "buyer", "Insufficient SB");
        } else {
          advanceState(txnId, "inviting");
        }
      }
      break;

    case "map_send_invite":
      if (row.state === "inviting") {
        advanceState(txnId, "verifying_invite_sent");
      }
      break;

    case "map_transfer_sb":
      if (row.state === "transferring_sb") {
        const ts = data.transferTimestampUtc ?? new Date().toISOString();
        setMapSbTransferTs(txnId, ts);
        advanceState(txnId, "verifying_sb_receipt");
      }
      break;

    case "map_accept_invite":
      if (row.state === "accepting") {
        advanceState(txnId, "transferring_ownership");
      }
      break;

    case "map_transfer_ownership":
      if (row.state === "transferring_ownership") {
        advanceState(txnId, "verifying_ownership");
      }
      break;

    case "map_leave_map":
      if (row.state === "seller_leaving") {
        advanceState(txnId, "verifying_seller_left");
      }
      break;

    case "map_cancel_invite":
      if (row.state === "cancelling_invite") {
        reverseMapOrderFill(row.sell_order_id, row.quantity);
        reverseMapOrderFill(row.buy_order_id, row.quantity);
        if (buyerFraudCancellations.has(txnId)) {
          // Buyer committed SB fraud: close buy order permanently, re-match sell order
          buyerFraudCancellations.delete(txnId);
          closeMapOrderWithReason(row.buy_order_id, "Buyer suspended for SB transfer fraud");
          deleteMapRiskDecisionsForSellOrder(row.sell_order_id);
          failTransaction(txnId, row, "SB receipt verification failed, buyer suspended", true);
          queueMicrotask(() => matchMapOrders(row.map_type_id, row.mode));
        } else {
          // Normal SB transfer failure: both fills reversed, both orders can re-match
          failTransaction(txnId, row, "SB transfer failed, invite cancelled", true);
        }
      }
      break;
  }
}

function advanceState(
  txnId: number,
  newState: MapTransactionState
): void {
  const row = findMapTransactionById(txnId);
  if (!row) return;

  updateMapTransactionState(txnId, newState);

  audit("map_transaction_state_change", undefined, {
    transactionId: txnId,
    fromState: row.state,
    toState: newState,
  });

  const txn = rowToMapTransaction({ ...row, state: newState });
  broadcastTransactionUpdate(txn);

  if (row.mode === "unopened") {
    advanceUnopenedState(row, newState);
  } else {
    advanceCompletedState(row, newState);
  }
}

function getVerificationParty(row: MapTransactionRow): number {
  // States where seller's extension is the verifier
  const sellerVerifies: MapTransactionState[] = [
    "verifying_sb_receipt",
  ];
  return sellerVerifies.includes(row.state as MapTransactionState)
    ? row.seller_user_id
    : row.buyer_user_id;
}

function parkVerificationTimeout(txnId: number, verifier: "seller" | "buyer"): void {
  const row = findMapTransactionById(txnId);
  if (!row || row.state === "completed" || row.state === "failed") return;
  parkedTransactions.set(txnId, verifier);
  console.warn(
    `[map-orchestrator] txn ${txnId} verification timed out in ${row.state} -- parked waiting for ${verifier} to reconnect`
  );
  broadcastTransactionUpdate(rowToMapTransaction(row));
}

function advanceUnopenedState(row: MapTransactionRow, state: MapTransactionState): void {
  const txnId = row.id;

  switch (state) {
    case "validating_seller":
      enqueueStep(row.seller_user_id, txnId, "map_validate_scroll", {
        scrollItemType: row.scroll_item_type!,
        requiredQuantity: 1,
      });
      break;

    case "validating_buyer":
      enqueueStep(row.buyer_user_id, txnId, "map_validate_sb", {
        requiredAmount: row.price * row.quantity,
      });
      break;

    case "transferring_sb":
      enqueueStep(row.buyer_user_id, txnId, "map_transfer_sb", {
        receiverSnUserId: row.seller_mh_sn_user_id,
        amount: row.price * row.quantity,
      });
      break;

    case "opening_scroll":
      enqueueStep(row.seller_user_id, txnId, "map_open_scroll", {
        scrollItemType: row.scroll_item_type!,
      });
      break;

    case "inviting":
      enqueueStep(row.seller_user_id, txnId, "map_send_invite", {
        mhMapId: row.mh_map_id!,
        buyerSnUserId: row.buyer_mh_sn_user_id,
      });
      break;

    case "accepting":
      enqueueStep(row.buyer_user_id, txnId, "map_accept_invite", {
        mhMapId: row.mh_map_id!,
      });
      break;

    case "transferring_ownership":
      enqueueStep(row.seller_user_id, txnId, "map_transfer_ownership", {
        mhMapId: row.mh_map_id!,
        buyerSnUserId: row.buyer_mh_sn_user_id,
      });
      break;

    case "seller_leaving":
      enqueueStep(row.seller_user_id, txnId, "map_leave_map", {
        mhMapId: row.mh_map_id!,
      });
      break;

    case "reversing_sb":
      enqueueStep(row.seller_user_id, txnId, "map_reverse_sb", {
        receiverSnUserId: row.buyer_mh_sn_user_id,
        amount: row.price * row.quantity,
      });
      break;

    case "verifying_sb_receipt": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const buyerMhAccount = findMHAccountByUserId(freshRow.buyer_user_id);
      if (!buyerMhAccount) {
        console.error(
          `[map-orchestrator] txn ${txnId}: buyer (user ${freshRow.buyer_user_id}) has no linked MH account – cannot verify SB receipt`
        );
        failTransaction(txnId, freshRow, "Buyer MH account not found – cannot verify SB receipt", false);
        break;
      }
      const timeAnchor = freshRow.sb_transfer_ts ?? freshRow.updated_at;
      const onUnopenedSbFail = () => {
        const fr = findMapTransactionById(txnId);
        if (!fr) return;
        const wasRestart = unopenedSbTransferRestartTxns.has(txnId);
        unopenedSbTransferRestartTxns.delete(txnId);
        if (wasRestart) {
          console.log(
            `[map-orchestrator] txn ${txnId}: restart SB verification failed – closing both orders (not fraud)`
          );
          audit("verification_failed", undefined, {
            txnId,
            marketplace: "maps:unopened",
            verificationType: "sb_receipt",
            failingParty: fr.buyer_user_id,
            attemptCount: 3,
          });
          reverseMapOrderFill(fr.sell_order_id, fr.quantity);
          reverseMapOrderFill(fr.buy_order_id, fr.quantity);
          closeMapOrderWithReason(fr.sell_order_id, "SB transfer status unknown after server restart");
          closeMapOrderWithReason(fr.buy_order_id, "SB transfer status unknown after server restart");
          deleteMapRiskDecisionsForSellOrder(fr.sell_order_id);
          failTransaction(txnId, fr, "SB receipt verification failed after restart recovery", true);
        } else {
          createSuspension(fr.buyer_user_id, null, "SB transfer verification failed (possible fraud)", null);
          getConnection(fr.buyer_user_id)?.ws.close(4003, "Account suspended");
          audit("verification_failed", undefined, {
            txnId,
            marketplace: "maps:unopened",
            verificationType: "sb_receipt",
            failingParty: fr.buyer_user_id,
            attemptCount: 3,
          });
          reverseMapOrderFill(fr.sell_order_id, fr.quantity);
          reverseMapOrderFill(fr.buy_order_id, fr.quantity);
          closeMapOrderWithReason(fr.buy_order_id, "SB transfer verification failed after 3 attempts");
          deleteMapRiskDecisionsForSellOrder(fr.sell_order_id);
          failTransaction(txnId, fr, "SB receipt verification failed after 3 attempts", true);
        }
      };
      startVerification(
        txnId,
        freshRow.seller_user_id,
        "maps:unopened",
        {
          verificationType: "sb_receipt",
          senderMhUserId: String(buyerMhAccount.mh_user_id),
          itemDisplayName: "SUPER|brie+",
          quantity: freshRow.price * freshRow.quantity,
          transferTimestampUtc: timeAnchor,
        },
        () => {
          unopenedSbTransferRestartTxns.delete(txnId);
          advanceState(txnId, "verifying_map_free");
        },
        onUnopenedSbFail,
        () => parkVerificationTimeout(txnId, "seller"),
      );
      break;
    }

    case "verifying_map_free": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const mapClass = getMapTypeClass(freshRow.map_type_id);
      if (!mapClass) {
        console.warn(
          `[map-orchestrator] txn ${txnId}: map type ${freshRow.map_type_id} has no class – skipping verifying_map_free`
        );
        advanceState(txnId, "opening_scroll");
        break;
      }
      const onMapFreeFail = () => {
        const fr = findMapTransactionById(txnId);
        if (!fr) return;
        suspendSellerAndCloseAll(txnId, fr, "Seller map status verification failed (possible fraud)", "map_free", "maps:unopened");
      };
      startVerification(
        txnId,
        freshRow.buyer_user_id,
        "maps:unopened",
        {
          verificationType: "map_free",
          expectedHunterSnUserId: freshRow.seller_mh_sn_user_id,
          mapClass,
        },
        () => advanceState(txnId, "opening_scroll"),
        onMapFreeFail,
        () => parkVerificationTimeout(txnId, "buyer"),
      );
      break;
    }

    case "verifying_scroll_opened": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const onScrollFail = () => {
        const fr = findMapTransactionById(txnId);
        if (!fr) return;
        suspendSellerAndCloseAll(txnId, fr, "Scroll open verification failed (possible fraud)", "scroll_opened", "maps:unopened");
      };
      const scrollMapType = findMapTypeById(freshRow.map_type_id);
      startVerification(
        txnId,
        freshRow.buyer_user_id,
        "maps:unopened",
        {
          verificationType: "scroll_opened",
          mapId: freshRow.mh_map_id!,
          expectedHunterSnUserId: freshRow.seller_mh_sn_user_id,
          expectedMapType: scrollMapType?.map_type,
        },
        // === POINT OF NO RETURN ===
        () => { openScrollRestartTxns.delete(txnId); advanceState(txnId, "inviting"); },
        onScrollFail,
        () => parkVerificationTimeout(txnId, "buyer"),
      );
      break;
    }

    case "verifying_invite_sent": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const onUnopenedInviteFail = () => {
        const fr = findMapTransactionById(txnId);
        if (!fr) return;
        suspendSellerAndCloseAll(txnId, fr, "Invite receipt verification failed (possible fraud)", "invite_received", "maps:unopened");
      };
      startVerification(
        txnId,
        freshRow.buyer_user_id,
        "maps:unopened",
        {
          verificationType: "invite_received",
          mapId: freshRow.mh_map_id!,
        },
        () => advanceState(txnId, "accepting"),
        onUnopenedInviteFail,
        () => parkVerificationTimeout(txnId, "buyer"),
      );
      break;
    }

    case "verifying_ownership": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const onUnopenedOwnershipFail = () => {
        // Post-PONR: scroll consumed, SB paid. Do NOT reverse fills -- buyer would re-match
        // and lose SB again. Suspend seller, fail, flag for admin review.
        const fr = findMapTransactionById(txnId);
        if (!fr) return;
        const suspendReason = "Ownership transfer could not be verified after 3 attempts";
        updateMapTransactionState(txnId, "failed", suspendReason);
        markBuyerAvailable(fr.buyer_user_id);
        trackFailure(fr.map_type_id, fr.mode);
        audit("map_transaction_failed", undefined, {
          transactionId: txnId,
          mapTypeId: fr.map_type_id,
          mode: fr.mode,
          reason: suspendReason,
        });
        audit("verification_failed", undefined, {
          txnId,
          marketplace: "maps:unopened",
          verificationType: "ownership_transferred",
          failingParty: fr.seller_user_id,
          attemptCount: 3,
        });
        createSuspension(fr.seller_user_id, null, suspendReason, null);
        getConnection(fr.seller_user_id)?.ws.close(4003, "Account suspended");
        const txn2 = rowToMapTransaction({ ...fr, failure_reason: suspendReason, state: "failed" });
        broadcastTransactionUpdate(txn2);
        broadcastMapOrderBook(fr.map_type_id, fr.mode);
      };
      startVerification(
        txnId,
        freshRow.buyer_user_id,
        "maps:unopened",
        {
          verificationType: "ownership_transferred",
          mapId: freshRow.mh_map_id!,
          expectedHunterSnUserId: freshRow.buyer_mh_sn_user_id,
        },
        () => advanceState(txnId, "seller_leaving"),
        onUnopenedOwnershipFail,
        () => parkVerificationTimeout(txnId, "buyer"),
      );
      break;
    }

    case "verifying_seller_left": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const onUnopenedLeftFail = () => {
        // Seller is blocking a slot on buyer's map -- suspend and notify buyer
        const fr = findMapTransactionById(txnId);
        if (!fr) return;
        const suspendReason = "Seller did not leave the map after 3 verification attempts";
        audit("verification_failed", undefined, {
          txnId,
          marketplace: "maps:unopened",
          verificationType: "party_left",
          failingParty: fr.seller_user_id,
          attemptCount: 3,
        });
        createSuspension(fr.seller_user_id, null, suspendReason, null);
        getConnection(fr.seller_user_id)?.ws.close(4003, "Account suspended");
        sendToUser(fr.buyer_user_id, {
          type: "market_disabled_notice",
          payload: { message: "The seller has been suspended for not leaving your map. Please contact admins for assistance." },
        });
        advanceState(txnId, "pending_completion");
      };
      startVerification(
        txnId,
        freshRow.buyer_user_id,
        "maps:unopened",
        {
          verificationType: "party_left",
          mapId: freshRow.mh_map_id!,
          expectedHunterSnUserId: freshRow.seller_mh_sn_user_id,
        },
        () => advanceState(txnId, "pending_completion"),
        onUnopenedLeftFail,
        () => parkVerificationTimeout(txnId, "buyer"),
      );
      break;
    }

    case "pending_completion":
      completeTransaction(txnId);
      break;
  }
}

function advanceCompletedState(row: MapTransactionRow, state: MapTransactionState): void {
  const txnId = row.id;

  switch (state) {
    case "risk_checking": {
      const sellOrder = findMapOrderById(row.sell_order_id);
      const goalsJson = sellOrder?.remaining_goals;

      if (!goalsJson) {
        advanceState(txnId, "validating_seller");
        return;
      }

      const goals: Array<{ uniqueId: number; type: string }> = JSON.parse(goalsJson);
      if (goals.length === 0) {
        advanceState(txnId, "validating_seller");
        return;
      }

      const existing = findMapRiskDecision(row.buy_order_id, row.sell_order_id);
      if (existing?.decision === "accepted") {
        advanceState(txnId, "validating_seller");
        return;
      }

      const mapType = findMapTypeById(row.map_type_id);
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
          marketplace: "map",
          mapTypeId: row.map_type_id,
          goalType: goalType as "mouse" | "item",
          remainingGoals: enriched,
          itemRiskConfig: itemRiskCfg,
          timeoutSeconds,
        },
      });

      startRiskCheckTimer(txnId);
      break;
    }

    case "validating_seller":
      enqueueStep(row.seller_user_id, txnId, "map_validate_map", {
        mhMapId: row.mh_map_id!,
      });
      break;

    case "validating_buyer":
      enqueueStep(row.buyer_user_id, txnId, "map_validate_sb", {
        requiredAmount: row.price * row.quantity,
      });
      break;

    case "inviting":
      enqueueStep(row.seller_user_id, txnId, "map_send_invite", {
        mhMapId: row.mh_map_id!,
        buyerSnUserId: row.buyer_mh_sn_user_id,
      });
      break;

    case "transferring_sb":
      enqueueStep(row.buyer_user_id, txnId, "map_transfer_sb", {
        receiverSnUserId: row.seller_mh_sn_user_id,
        amount: row.price * row.quantity,
      });
      break;

    case "accepting":
      enqueueStep(row.buyer_user_id, txnId, "map_accept_invite", {
        mhMapId: row.mh_map_id!,
      });
      break;

    case "transferring_ownership":
      enqueueStep(row.seller_user_id, txnId, "map_transfer_ownership", {
        mhMapId: row.mh_map_id!,
        buyerSnUserId: row.buyer_mh_sn_user_id,
      });
      break;

    case "seller_leaving":
      enqueueStep(row.seller_user_id, txnId, "map_leave_map", {
        mhMapId: row.mh_map_id!,
      });
      break;

    case "cancelling_invite":
      enqueueStep(row.seller_user_id, txnId, "map_cancel_invite", {
        mhMapId: row.mh_map_id!,
        buyerSnUserId: row.buyer_mh_sn_user_id,
      });
      break;

    case "verifying_invite_sent": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const restartPhase = inviteRestartRecovery.get(txnId);
      const onInviteFail =
        restartPhase !== undefined
          ? restartPhase === "first"
            ? () => {
                inviteRestartRecovery.set(txnId, "retry");
                console.log(
                  `[map-orchestrator] txn ${txnId}: restart invite verification failed – retrying invite once (no suspension)`
                );
                advanceState(txnId, "inviting");
              }
            : () => {
                inviteRestartRecovery.delete(txnId);
                const fr = findMapTransactionById(txnId);
                if (!fr) return;
                audit("verification_failed", undefined, {
                  txnId,
                  marketplace: "maps:completed",
                  verificationType: "invite_received",
                  failingParty: fr.seller_user_id,
                  attemptCount: 3,
                });
                closeOrderAndFail(txnId, fr, "seller", "Invite could not be verified after restart recovery");
              }
          : () => suspendSellerAndFailMap(txnId, "Invite receipt could not be verified after 3 attempts", "invite_received");
      startVerification(
        txnId,
        freshRow.buyer_user_id,
        "maps:completed",
        { verificationType: "invite_received", mapId: freshRow.mh_map_id! },
        () => {
          inviteRestartRecovery.delete(txnId);
          advanceState(txnId, "verifying_map_valid");
        },
        onInviteFail,
        () => parkVerificationTimeout(txnId, "buyer"),
      );
      break;
    }

    case "verifying_map_valid": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const mapType = findMapTypeById(freshRow.map_type_id);
      startVerification(
        txnId,
        freshRow.buyer_user_id,
        "maps:completed",
        {
          verificationType: "map_valid",
          mapId: freshRow.mh_map_id!,
          expectedHunterSnUserId: freshRow.seller_mh_sn_user_id,
          expectedMapType: mapType?.map_type,
          goal: mapType?.goal,
        },
        () => advanceState(txnId, "transferring_sb"),
        () => suspendSellerAndFailMap(txnId, "Map type could not be verified after 3 attempts", "map_valid"),
        () => parkVerificationTimeout(txnId, "buyer"),
      );
      break;
    }

    case "verifying_sb_receipt": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const buyerMhAccount = findMHAccountByUserId(freshRow.buyer_user_id);
      if (!buyerMhAccount) {
        console.error(
          `[map-orchestrator] txn ${txnId}: buyer (user ${freshRow.buyer_user_id}) has no linked MH account – cannot verify SB receipt`
        );
        failTransaction(txnId, freshRow, "Buyer MH account not found – cannot verify SB receipt", false);
        break;
      }
      const timeAnchor = freshRow.sb_transfer_ts ?? freshRow.updated_at;
      const onSbFail = () => {
        const fr = findMapTransactionById(txnId);
        if (!fr) return;
        const isRestart = sbTransferRestartTxns.has(txnId);
        sbTransferRestartTxns.delete(txnId);
        if (isRestart) {
          console.log(
            `[map-orchestrator] txn ${txnId}: restart SB verification failed – cancelling invite without buyer suspension`
          );
          audit("verification_failed", undefined, {
            txnId,
            marketplace: "maps:completed",
            verificationType: "sb_receipt",
            failingParty: fr.buyer_user_id,
            attemptCount: 3,
          });
          advanceState(txnId, "cancelling_invite");
        } else {
          buyerFraudCancellations.add(txnId);
          createSuspension(fr.buyer_user_id, null, "Failed to complete SB payment (possible fraud)", null);
          getConnection(fr.buyer_user_id)?.ws.close(4003, "Account suspended");
          audit("verification_failed", undefined, {
            txnId,
            marketplace: "maps:completed",
            verificationType: "sb_receipt",
            failingParty: fr.buyer_user_id,
            attemptCount: 3,
          });
          advanceState(txnId, "cancelling_invite");
        }
      };
      startVerification(
        txnId,
        freshRow.seller_user_id,
        "maps:completed",
        {
          verificationType: "sb_receipt",
          senderMhUserId: buyerMhAccount ? String(buyerMhAccount.mh_user_id) : "",
          itemDisplayName: "SUPER|brie+",
          quantity: freshRow.price * freshRow.quantity,
          transferTimestampUtc: timeAnchor,
        },
        // === POINT OF NO RETURN ===
        () => {
          sbTransferRestartTxns.delete(txnId);
          advanceState(txnId, "accepting");
        },
        onSbFail,
        () => parkVerificationTimeout(txnId, "seller"),
      );
      break;
    }

    case "verifying_ownership": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const onOwnershipFail = () => {
        // Post-PONR: SB already paid. Do NOT reverse fills – buyer would re-match
        // and lose SB again. Suspend seller, fail, flag for admin review.
        const fr = findMapTransactionById(txnId);
        if (!fr) return;
        const suspendReason = "Ownership transfer could not be verified after 3 attempts";
        updateMapTransactionState(txnId, "failed", suspendReason);
        markBuyerAvailable(fr.buyer_user_id);
        trackFailure(fr.map_type_id, fr.mode);
        audit("map_transaction_failed", undefined, {
          transactionId: txnId,
          mapTypeId: fr.map_type_id,
          mode: fr.mode,
          reason: suspendReason,
        });
        audit("verification_failed", undefined, {
          txnId,
          marketplace: "maps:completed",
          verificationType: "ownership_transferred",
          failingParty: fr.seller_user_id,
          attemptCount: 3,
        });
        createSuspension(fr.seller_user_id, null, suspendReason, null);
        getConnection(fr.seller_user_id)?.ws.close(4003, "Account suspended");
        const txn2 = rowToMapTransaction({ ...fr, failure_reason: suspendReason, state: "failed" });
        broadcastTransactionUpdate(txn2);
        broadcastMapOrderBook(fr.map_type_id, fr.mode);
      };
      startVerification(
        txnId,
        freshRow.buyer_user_id,
        "maps:completed",
        { verificationType: "ownership_transferred", mapId: freshRow.mh_map_id! },
        () => advanceState(txnId, "seller_leaving"),
        onOwnershipFail,
        () => parkVerificationTimeout(txnId, "buyer"),
      );
      break;
    }

    case "verifying_seller_left": {
      const freshRow = findMapTransactionById(txnId);
      if (!freshRow) break;
      const onLeftFail = () => {
        // Seller is blocking a slot on buyer's map -- suspend and notify buyer
        const fr = findMapTransactionById(txnId);
        if (!fr) return;
        const suspendReason = "Seller did not leave the map after 3 verification attempts";
        audit("verification_failed", undefined, {
          txnId,
          marketplace: "maps:completed",
          verificationType: "party_left",
          failingParty: fr.seller_user_id,
          attemptCount: 3,
        });
        createSuspension(fr.seller_user_id, null, suspendReason, null);
        getConnection(fr.seller_user_id)?.ws.close(4003, "Account suspended");
        sendToUser(fr.buyer_user_id, {
          type: "market_disabled_notice",
          payload: { message: "The seller has been suspended for not leaving your map. Please contact admins for assistance." },
        });
        advanceState(txnId, "pending_completion");
      };
      startVerification(
        txnId,
        freshRow.buyer_user_id,
        "maps:completed",
        {
          verificationType: "party_left",
          mapId: freshRow.mh_map_id!,
          expectedHunterSnUserId: freshRow.seller_mh_sn_user_id,
        },
        () => advanceState(txnId, "pending_completion"),
        onLeftFail,
        () => parkVerificationTimeout(txnId, "buyer"),
      );
      break;
    }

    case "pending_completion":
      completeTransaction(txnId);
      break;
  }
}

function completeTransaction(txnId: number): void {
  clearStepTimeout(txnId);
  updateMapTransactionState(txnId, "completed");

  const row = findMapTransactionById(txnId);
  if (!row) return;

  recordMapPriceHistory(row.map_type_id, row.mode, row.price, row.quantity);

  markBuyerAvailable(row.buyer_user_id);

  // Buyer just received a map – update active maps immediately
  // so matchers block them for same-class orders on the next sweep.
  if (row.mh_map_id) {
    const mapClass = getMapTypeClass(row.map_type_id) as MHMapClass | null;
    if (mapClass) {
      addUserActiveMap(row.buyer_user_id, row.mh_map_id, mapClass);
    }
  }

  deleteMapRiskDecisionsForSellOrder(row.sell_order_id);

  resetFailureTracker(row.map_type_id, row.mode);

  audit("map_transaction_completed", undefined, {
    transactionId: txnId,
    mapTypeId: row.map_type_id,
    mode: row.mode,
    price: row.price,
    quantity: row.quantity,
  });

  const txn = rowToMapTransaction(row);
  broadcastTransactionUpdate(txn);

  broadcastMapOrderBook(row.map_type_id, row.mode);

  matchMapOrders(row.map_type_id, row.mode);
}

function failTransaction(
  txnId: number,
  row: MapTransactionRow,
  reason: string,
  skipReversal: boolean
): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);
  updateMapTransactionState(txnId, "failed", reason);

  markBuyerAvailable(row.buyer_user_id);

  trackFailure(row.map_type_id, row.mode);

  if (!skipReversal) {
    reverseMapOrderFill(row.sell_order_id, row.quantity);
    reverseMapOrderFill(row.buy_order_id, row.quantity);
  }

  audit("map_transaction_failed", undefined, {
    transactionId: txnId,
    mapTypeId: row.map_type_id,
    mode: row.mode,
    reason,
  });

  const txn = rowToMapTransaction({ ...row, failure_reason: reason, state: "failed" });
  broadcastTransactionUpdate(txn);

  // No matcher – matching on failure causes runaway fail->rematch->fail loops
  broadcastMapOrderBook(row.map_type_id, row.mode);
}

/**
 * Suspend seller and permanently close BOTH orders with no re-match.
 * Used for pre-PONR (verifying_map_free, verifying_scroll_opened) and
 * post-PONR (verifying_invite_sent) seller fraud in the unopened flow.
 * SB may already be with seller – admin must recover manually.
 */
function suspendSellerAndCloseAll(
  txnId: number,
  row: MapTransactionRow,
  reason: string,
  verificationType: string,
  marketplace: string,
): void {
  reverseMapOrderFill(row.sell_order_id, row.quantity);
  reverseMapOrderFill(row.buy_order_id, row.quantity);
  closeMapOrderWithReason(row.sell_order_id, reason);
  closeMapOrderWithReason(row.buy_order_id, reason + " – admin review required");
  deleteMapRiskDecisionsForSellOrder(row.sell_order_id);

  createSuspension(row.seller_user_id, null, reason, null);
  getConnection(row.seller_user_id)?.ws.close(4003, "Account suspended");

  audit("verification_failed", undefined, {
    txnId,
    marketplace,
    verificationType,
    failingParty: row.seller_user_id,
    attemptCount: 3,
  });

  failTransaction(txnId, row, reason, true);
}

/**
 * Suspend the seller for pre-PONR invite fraud and fail the transaction.
 * Both fills are reversed (no SB sent yet, no irreversible action taken).
 * Sell order is closed permanently; buy order fill is reversed so buyer can re-match.
 */
function suspendSellerAndFailMap(txnId: number, reason: string, verificationType: string): void {
  cancelVerification(txnId);
  clearStepTimeout(txnId);

  const row = findMapTransactionById(txnId);
  if (!row) return;

  reverseMapOrderFill(row.sell_order_id, row.quantity);
  reverseMapOrderFill(row.buy_order_id, row.quantity);
  closeMapOrderWithReason(row.sell_order_id, reason);
  deleteMapRiskDecisionsForSellOrder(row.sell_order_id);

  updateMapTransactionState(txnId, "failed", reason);
  markBuyerAvailable(row.buyer_user_id);
  trackFailure(row.map_type_id, row.mode);

  audit("map_transaction_failed", undefined, {
    transactionId: txnId,
    mapTypeId: row.map_type_id,
    mode: row.mode,
    reason,
  });
  audit("verification_failed", undefined, {
    txnId,
    marketplace: "maps:completed",
    verificationType,
    failingParty: row.seller_user_id,
    attemptCount: 3,
  });

  createSuspension(row.seller_user_id, null, reason, null);
  getConnection(row.seller_user_id)?.ws.close(4003, "Account suspended");

  const txn = rowToMapTransaction({ ...row, failure_reason: reason, state: "failed" });
  broadcastTransactionUpdate(txn);
  broadcastMapOrderBook(row.map_type_id, row.mode);

  // Buy order fill reversed – allow re-matching for buyer
  queueMicrotask(() => matchMapOrders(row.map_type_id, row.mode));
}

function closeOrderAndFail(
  txnId: number,
  row: MapTransactionRow,
  party: "seller" | "buyer",
  reason: string
): void {
  const orderId = party === "seller" ? row.sell_order_id : row.buy_order_id;
  closeMapOrderWithReason(orderId, reason);
  if (party === "seller") {
    deleteMapRiskDecisionsForSellOrder(row.sell_order_id);
  }
  reverseMapOrderFill(row.sell_order_id, row.quantity);
  reverseMapOrderFill(row.buy_order_id, row.quantity);
  failTransaction(txnId, row, `${party}: ${reason}`, true);
}

const riskCheckTimers = new Map<number, ReturnType<typeof setTimeout>>();

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
  const row = findMapTransactionById(txnId);
  if (!row || row.state !== "risk_checking") return;

  upsertMapRiskDecision(row.buy_order_id, row.sell_order_id, "blocked");

  failTransaction(txnId, row, "Risk check timed out", false);

  sendToUser(row.buyer_user_id, {
    type: "risk_check_timed_out",
    payload: {
      transactionId: txnId,
      marketplace: "map" as const,
      sellOrderId: row.sell_order_id,
      buyOrderId: row.buy_order_id,
      mapTypeId: row.map_type_id,
    },
  });

  queueMicrotask(() => matchMapOrders(row.map_type_id, row.mode));
}

export function handleMapRiskCheckResponse(userId: number, payload: {
  transactionId: number;
  decision: "accepted" | "rejected";
  autoAccepted?: boolean;
}): void {
  const { transactionId, decision } = payload;

  clearRiskCheckTimer(transactionId);

  const row = findMapTransactionById(transactionId);
  if (!row || row.state !== "risk_checking") return;
  if (row.buyer_user_id !== userId) return;

  if (decision === "accepted") {
    upsertMapRiskDecision(row.buy_order_id, row.sell_order_id, "accepted");
    advanceState(transactionId, "validating_seller");
  } else {
    upsertMapRiskDecision(row.buy_order_id, row.sell_order_id, "blocked");
    failTransaction(transactionId, row, "Buyer rejected risk check", false);
    queueMicrotask(() => matchMapOrders(row.map_type_id, row.mode));
  }
}

export function handleMapRiskCheckRetry(userId: number, payload: {
  marketplace: "slot" | "map";
  buyOrderId: number;
  sellOrderId: number;
  mapTypeId: number;
}): void {
  deleteMapRiskDecision(payload.buyOrderId, payload.sellOrderId);

  const buyOrder = findMapOrderById(payload.buyOrderId);
  const mode = buyOrder?.mode ?? "completed";

  queueMicrotask(() => matchMapOrders(payload.mapTypeId, mode));

  setTimeout(() => {
    const order = findMapOrderById(payload.buyOrderId);
    if (!order || order.status === "filled" || order.status === "cancelled") return;

    const activeTxn = findActiveMapTransactionForBuyOrder(payload.buyOrderId);
    if (!activeTxn) {
      sendToUser(userId, { type: "risk_check_retry_no_match", payload: {} });
    }
  }, 2000);
}

function handleStepFailure(
  txnId: number,
  row: MapTransactionRow,
  step: MapStepType,
  error: string
): void {
  console.error(`[map-orchestrator] txn ${txnId} step ${step} failed: ${error}`);

  // Pre-PONR states differ by mode.
  // For completed: PONR is crossed when verifying_sb_receipt passes and accepting begins.
  const prePonrStates: MapTransactionState[] =
    row.mode === "unopened"
      ? ["validating_seller", "validating_buyer", "transferring_sb", "opening_scroll"]
      : ["validating_seller", "validating_buyer", "inviting", "verifying_invite_sent", "transferring_sb"];

  const isPonr = !prePonrStates.includes(row.state);

  // cancelling_invite is a recovery state, not truly post-PONR.
  // Step failure should fail the txn (same outcome as success), not complete it.
  if (row.state === "cancelling_invite") {
    reverseMapOrderFill(row.sell_order_id, row.quantity);
    reverseMapOrderFill(row.buy_order_id, row.quantity);
    failTransaction(txnId, row, error, true);
    return;
  }

  if (isPonr) {
    advanceState(txnId, "pending_completion");
  } else {
    if (row.mode === "unopened" && row.state === "opening_scroll") {
      // Scroll open failed after SB paid – refund SB
      advanceState(txnId, "reversing_sb");
    } else if (row.mode === "completed" && row.state === "transferring_sb") {
      // SB transfer failed after invite sent – cancel invite
      advanceState(txnId, "cancelling_invite");
    } else {
      reverseMapOrderFill(row.sell_order_id, row.quantity);
      reverseMapOrderFill(row.buy_order_id, row.quantity);
      failTransaction(txnId, row, error, true);
    }
  }
}

function broadcastTransactionUpdate(txn: MapTransaction): void {
  const parkedWaitingFor = parkedTransactions.get(txn.id);
  const payload: MapTransaction = parkedWaitingFor != null
    ? { ...txn, parked: true, parkedWaitingFor }
    : txn;
  sendToUser(txn.sellerUserId, {
    type: "map_transaction_update",
    payload: { transaction: payload },
  });
  sendToUser(txn.buyerUserId, {
    type: "map_transaction_update",
    payload: { transaction: payload },
  });
}

/**
 * All transactions are preserved initially for reconnect recovery.
 * Pre-PONR transactions get a grace period – if both parties haven't
 * reconnected within that window, the transaction is failed.
 */
const PRE_PONR_GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 minutes
const MID_FLOW_GRACE_PERIOD_MS = 30 * 60 * 1000; // 30 minutes
// States eligible for grace-period fail: both fills can be safely reversed
// with no invite/scroll to undo. Deeper states resume via reconnect handling.
const PRE_PONR_STATES: MapTransactionState[] = [
  "pending",
  "risk_checking",
  "validating_seller",
  "validating_buyer",
];
/** Mid-flow pre-PONR states for completed mode: past validation but before SB verified. */
const MID_FLOW_PRE_PONR_STATES: MapTransactionState[] = [
  "inviting",
  "verifying_invite_sent",
  "verifying_map_valid",
  "transferring_sb",
  "verifying_sb_receipt",
];

export function cleanupStuckMapTransactions(): void {
  const stuck = findPendingMapTransactions();

  for (const row of stuck) {
    console.log(
      `[map-orchestrator] stuck transaction ${row.id} in state ${row.state} – will resume on reconnect`
    );
  }

  if (stuck.some((r) => PRE_PONR_STATES.includes(r.state))) {
    setTimeout(() => {
      const stillStuck = findPendingMapTransactions();
      for (const row of stillStuck) {
        if (PRE_PONR_STATES.includes(row.state)) {
          console.log(
            `[map-orchestrator] txn ${row.id} still in pre-PONR state ${row.state} after grace period – failing`
          );
          failTransaction(
            row.id,
            row,
            "Other party did not reconnect in time",
            false
          );
        }
      }
    }, PRE_PONR_GRACE_PERIOD_MS);
  }

  // Mid-flow pre-PONR states get a longer grace period.
  // These have invites/SB in flight and normally resume on reconnect,
  // but if both parties permanently disappear the txn would be stuck forever.
  const UNOPENED_MID_FLOW_STATES: MapTransactionState[] = [
    "transferring_sb", "verifying_sb_receipt", "verifying_map_free", "opening_scroll",
  ];
  const hasMidFlow = stuck.some((r) =>
    (r.mode === "completed" && MID_FLOW_PRE_PONR_STATES.includes(r.state)) ||
    (r.mode === "unopened" && UNOPENED_MID_FLOW_STATES.includes(r.state as MapTransactionState))
  );
  if (hasMidFlow) {
    setTimeout(() => {
      const stillStuck = findPendingMapTransactions();
      for (const row of stillStuck) {
        const isCompletedMidFlow = row.mode === "completed" && MID_FLOW_PRE_PONR_STATES.includes(row.state);
        const isUnopenedMidFlow = row.mode === "unopened" && UNOPENED_MID_FLOW_STATES.includes(row.state as MapTransactionState);
        if (isCompletedMidFlow) {
          console.log(
            `[map-orchestrator] txn ${row.id} still in mid-flow state ${row.state} after extended grace period – failing`
          );
          if (row.state === "transferring_sb" || row.state === "verifying_sb_receipt") {
            // SB may have been sent after invite -- cancel invite before failing
            advanceState(row.id, "cancelling_invite");
          } else {
            failTransaction(row.id, row, "Other party did not reconnect in time", false);
          }
        } else if (isUnopenedMidFlow) {
          // Unopened mid-flow: no invite to cancel, no PONR crossed -- reverse fills and fail
          console.log(
            `[map-orchestrator] txn ${row.id} still in unopened mid-flow state ${row.state} after extended grace period – failing`
          );
          reverseMapOrderFill(row.sell_order_id, row.quantity);
          reverseMapOrderFill(row.buy_order_id, row.quantity);
          failTransaction(row.id, row, "Other party did not reconnect in time", true);
        }
      }
    }, MID_FLOW_GRACE_PERIOD_MS);
  }
}

/**
 * Retry final steps (max 1 retry per transaction).
 */
export function checkMapPendingCompletionsOnConnect(userId: number): void {
  const pending = findMapPendingCompletionTransactions(userId);
  for (const row of pending) {
    const retryCount = getMapRetryCount(row.id);
    if (retryCount >= MAP_PENDING_COMPLETION_MAX_RETRIES) {
      console.log(
        `[map-orchestrator] txn ${row.id} exceeded max retries, failing`
      );
      failTransaction(row.id, row, "Max retries exceeded", false);
    } else {
      console.log(
        `[map-orchestrator] retrying pending_completion txn ${row.id} (retry ${retryCount + 1})`
      );
      incrementMapRetryCount(row.id);
      advanceState(row.id, "pending_completion");
    }
  }
}

const VERIFYING_STATES: MapTransactionState[] = [
  "verifying_invite_sent",
  "verifying_map_valid",
  "verifying_sb_receipt",
  "verifying_map_free",
  "verifying_scroll_opened",
  "verifying_ownership",
  "verifying_seller_left",
];

const COMPLETED_PRE_PONR_STEP_STATES = new Set<MapTransactionState>([
  "validating_seller",
  "validating_buyer",
  "inviting",
  "verifying_invite_sent",
  "transferring_sb",
]);

const UNOPENED_POST_PONR_STEP_STATES = new Set<MapTransactionState>([
  "inviting",
  "accepting",
  "transferring_ownership",
  "seller_leaving",
]);

/**
 * Resume active map transactions when a user reconnects.
 *
 * - pending: starts the transaction
 * - validating_*: re-sends the validation step (idempotent)
 * - verifying_*: re-starts verification if lost in a server restart
 * - opening_scroll with NULL mh_map_id: defers to probeForOpenedMap
 * - opening_scroll with mh_map_id: advances to inviting
 * - post-PONR states: re-sends the current step
 *
 * If validation fails on resume, the normal step failure handler handles it.
 */
export function resumeActiveMapTransactionsOnConnect(userId: number): void {
  const active = findPendingMapTransactions();

  for (const row of active) {
    if (row.seller_user_id !== userId && row.buyer_user_id !== userId) continue;

    // Handled by checkMapPendingCompletionsOnConnect
    if (row.state === "pending_completion") continue;

    // Verifying states: re-start verification if in-memory state was lost (server restart).
    // resendPendingVerificationsForUser handles the normal reconnect case (challenge already queued).
    if (VERIFYING_STATES.includes(row.state) && row.mode === "completed") {
      if (!isVerificationPending(row.id)) {
        const verifierId = getVerificationParty(row);
        if (!getConnection(verifierId)) continue; // wait for verifier to reconnect
        parkedTransactions.delete(row.id);
        markBuyerBusy(row.buyer_user_id);
        // At restart, SB transfer outcome is unknown -- don't suspend buyer for fraud
        if (row.state === "verifying_sb_receipt") {
          sbTransferRestartTxns.add(row.id);
        }
        console.log(
          `[map-orchestrator] txn ${row.id} in ${row.state} at restart – re-starting verification`
        );
        advanceCompletedState(row, row.state);
      }
      continue;
    }

    if (VERIFYING_STATES.includes(row.state) && row.mode === "unopened") {
      if (!isVerificationPending(row.id)) {
        const verifierId = getVerificationParty(row);
        if (!getConnection(verifierId)) continue; // wait for verifier to reconnect
        parkedTransactions.delete(row.id);
        markBuyerBusy(row.buyer_user_id);
        console.log(
          `[map-orchestrator] txn ${row.id} in ${row.state} (unopened) at restart – re-starting verification`
        );
        advanceUnopenedState(row, row.state);
      }
      continue;
    }

    // Parked step (e.g. reversing_sb): unpark when the waiting party reconnects.
    if (parkedTransactions.has(row.id)) {
      const waitingFor = parkedTransactions.get(row.id)!;
      const reconnectedParty = userId === row.seller_user_id ? "seller" : "buyer";
      if (reconnectedParty === waitingFor) {
        parkedTransactions.delete(row.id);
        markBuyerBusy(row.buyer_user_id);
        inflightStep.delete(userId);
        console.log(
          `[map-orchestrator] txn ${row.id} unparking – ${waitingFor} reconnected, re-advancing ${row.state}`
        );
        advanceUnopenedState(row, row.state);
      }
      continue;
    }

    const otherUserId =
      userId === row.seller_user_id ? row.buyer_user_id : row.seller_user_id;
    if (!isUserOnline(otherUserId)) {
      console.log(
        `[map-orchestrator] txn ${row.id} in ${row.state}: waiting for other party (user ${otherUserId}) to come online`
      );
      continue;
    }

    if (row.state === "pending") {
      console.log(
        `[map-orchestrator] resuming pending txn ${row.id} – starting transaction`
      );
      startMapTransaction(row.id);
      continue;
    }

    // risk_checking: no step queue involved – re-send the risk check prompt to buyer
    if (row.state === "risk_checking") {
      if (userId === row.buyer_user_id) {
        markBuyerBusy(row.buyer_user_id);
        console.log(
          `[map-orchestrator] resuming risk_checking txn ${row.id} – re-sending prompt to buyer`
        );
        advanceCompletedState(row, "risk_checking");
      }
      continue;
    }

    const stepUserId = getTimeoutUserId(row);
    if (stepUserId == null || !isUserOnline(stepUserId)) continue;

    // Unknown whether SB was sent before restart – verify before re-sending (avoid double-transfer).
    if (row.state === "transferring_sb" && row.mode === "unopened") {
      markBuyerBusy(row.buyer_user_id);
      unopenedSbTransferRestartTxns.add(row.id);
      console.log(
        `[map-orchestrator] txn ${row.id} in transferring_sb (unopened) at restart – advancing to verifying_sb_receipt`
      );
      advanceState(row.id, "verifying_sb_receipt");
      continue;
    }

    // opening_scroll with lost mh_map_id – defer to probeForOpenedMap
    if (row.state === "opening_scroll" && row.mh_map_id == null) {
      pendingMapIdRecovery.add(row.id);
      markBuyerBusy(row.buyer_user_id);
      console.log(
        `[map-orchestrator] txn ${row.id} in opening_scroll with no mh_map_id – ` +
          `will probe seller's active maps when update_active_maps arrives`
      );
      continue;
    }

    // opening_scroll WITH mh_map_id (recovered) – scroll was opened before crash; verify it.
    if (row.state === "opening_scroll" && row.mh_map_id != null) {
      markBuyerBusy(row.buyer_user_id);
      openScrollRestartTxns.add(row.id);
      console.log(
        `[map-orchestrator] txn ${row.id} recovered opening_scroll with mh_map_id ${row.mh_map_id}, advancing to verifying_scroll_opened`
      );
      advanceState(row.id, "verifying_scroll_opened");
      continue;
    }

    // Unknown whether the invite was sent before restart; verify before re-sending.
    if (row.state === "inviting" && row.mode === "completed") {
      markBuyerBusy(row.buyer_user_id);
      // Set restart flag BEFORE advanceState so advanceCompletedState sees it synchronously.
      inviteRestartRecovery.set(row.id, "first");
      console.log(
        `[map-orchestrator] txn ${row.id} in inviting at restart – advancing to verifying_invite_sent (restart recovery)`
      );
      // advanceState broadcasts the state change to both parties and calls advanceCompletedState.
      advanceState(row.id, "verifying_invite_sent");
      continue;
    }

    // Gap 2: completed-mode `transferring_sb` at restart – avoid double-transfer by verifying first.
    // Unknown whether the SB was sent before restart; verify before re-sending.
    if (row.state === "transferring_sb" && row.mode === "completed") {
      markBuyerBusy(row.buyer_user_id);
      // Set restart flag BEFORE advanceState so advanceCompletedState sees it synchronously.
      sbTransferRestartTxns.add(row.id);
      console.log(
        `[map-orchestrator] txn ${row.id} in transferring_sb at restart – advancing to verifying_sb_receipt (restart recovery)`
      );
      // advanceState broadcasts the state change to both parties and calls advanceCompletedState.
      advanceState(row.id, "verifying_sb_receipt");
      continue;
    }

    console.log(
      `[map-orchestrator] resuming txn ${row.id} from state ${row.state} for step user ${stepUserId} (triggered by user ${userId})`
    );

    markBuyerBusy(row.buyer_user_id);

    inflightStep.delete(stepUserId);
    if (row.mode === "unopened") {
      advanceUnopenedState(row, row.state);
    } else {
      advanceCompletedState(row, row.state);
    }
  }
}

// Fast states = step is actively in-flight. Verifying states are NOT included
// because they are waiting for a WS verify_transfer_result, not a game API step.
const MAP_FAST_STATES = new Set<MapTransactionState>([
  "risk_checking",
  "validating_seller",
  "validating_buyer",
  "transferring_sb",
  "opening_scroll",
  "inviting",
  "accepting",
  "transferring_ownership",
  "seller_leaving",
  "reversing_sb",
  "cancelling_invite",
]);

function countDrainableMapTransactions(): number {
  return findPendingMapTransactions().filter((r) =>
    MAP_FAST_STATES.has(r.state as MapTransactionState)
  ).length;
}

registerDrainableCounter(countDrainableMapTransactions);
