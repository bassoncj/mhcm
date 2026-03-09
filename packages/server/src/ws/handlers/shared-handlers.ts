import type { ClientMessage, MHMapClass } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { fetchCorkboardMessages, fetchCorkboardViaProxy, handleProxyVerifyResult } from "../../auth/mh-client.js";
import { getVerificationMethod } from "../../settings.js";
import {
  sendToUser,
  broadcast,
  getOnlineUserIds,
  getConnection,
  markUserAfk,
  markUserActive,
  markUserSettingsInvalid,
  markUserSettingsValid,
  isUserSettingsInvalid,
  setUserActiveMaps,
  getUsersOnMap,
  markUserOnboardingComplete,
} from "../connections.js";
import {
  findMHAccountByUserId,
  findMHAccountByMHUserId,
  createMHAccountPending,
  markVerified,
  deletePendingMHAccount,
} from "../../db/queries/mh-accounts.js";
import { randomBytes } from "node:crypto";
import { getTotalCommittedSb } from "../../db/queries/sb-reservation.js";
import { handleReportMapTypes } from "../../maps/catalog.js";
import { findPendingBuyMapTypes, findPendingOrderMapTypes, cancelSellOrdersByMapIds } from "../../db/queries/slot-orders.js";
import { tryMatch } from "../../orders/slot-matcher.js";
import { broadcastOrderBook } from "../../orders/slot-book.js";
import { getNotificationPrefs, updateNotificationPrefs, findUserById, setUserRankId, setUserUtcOffset } from "../../db/queries/users.js";
import { handleVerificationResult, resendPendingVerificationsForUser } from "../../transactions/verify-utils.js";
import { audit } from "../../audit.js";
import { isXhrLoggingEnabled, isVersionAlertEnabled, verboseLog } from "../../settings.js";
import { acknowledgeAlert, getUnacknowledgedAlert } from "../../db/queries/admin-alerts.js";
import { isAdmin as isAdminRole, isUserBetaEligible } from "./handler-utils.js";
import { SERVER_VERSION } from "../../config.js";
import {
  hasPendingBetaRequest,
  createBetaRequest,
  findBetaRequestByUserId,
} from "../../db/queries/beta-requests.js";
import { writeXhrLog } from "../../xhr-logger.js";
import { getMapTypeClass } from "../../db/queries/map-types.js";
import { findPendingSnipingOrderTargets, findPendingSnipingSellTargets } from "../../db/queries/sniping-orders.js";
import { trySnipingMatch } from "../../orders/sniping-matcher.js";
import { broadcastSnipingOrderBook } from "../../orders/sniping-book.js";
import { handleSniperLeftMap, resumePendingPayments } from "../../transactions/sniping-orchestrator.js";
import { advanceRtTransactionsForMap, resumeDeferredRtAdvancements, triggerRtManualFallback, resumeSlotVerificationsOnConnect } from "../../transactions/slot-orchestrator.js";
import { findRtAwaitingCompletionByBuyer } from "../../db/queries/rt-pending-items.js";
import { findActiveSnipingTransactionsAsSniper } from "../../db/queries/sniping-transactions.js";
import { findPendingItemOrderTypes } from "../../db/queries/item-orders.js";
import { matchItemOrders } from "../../orders/item-matcher.js";
import { broadcastItemOrderBook } from "../../orders/item-book.js";
import { findPendingMapOrderTypes } from "../../db/queries/map-orders.js";
import { matchMapOrders } from "../../orders/map-matcher.js";
import { broadcastMapOrderBook } from "../../orders/map-book.js";
import {
  completeOnboardingTask,
  isUserOnboardingComplete,
  getAllOnboardingTasks,
} from "../../db/queries/onboarding.js";
import {
  checkMapPendingCompletionsOnConnect,
  resumeActiveMapTransactionsOnConnect,
  probeForOpenedMap,
} from "../../transactions/map-orchestrator.js";
import { resumeItemVerificationsOnConnect } from "../../transactions/item-orchestrator.js";
import { resumeSnipingVerificationsOnConnect } from "../../transactions/sniping-orchestrator.js";

export function handleSharedMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "report_version": {
      const extVersion = message.payload?.version ?? "legacy";
      console.log(`[mhcm-server] user ${userId} connected with extension v${extVersion}`);

      const { titleId } = message.payload;
      if (typeof titleId === "number" && titleId > 0) {
        setUserRankId(userId, titleId);
      }

      // Run sniping matcher sweep AFTER the extension reports its version
      const snipingTargets = findPendingSnipingOrderTargets(userId);
      if (snipingTargets.length > 0) {
        verboseLog("snipe-ws", `ON report_version user ${userId}: ${snipingTargets.length} pending sniping target(s)`);
      }
      for (const target of snipingTargets) {
        queueMicrotask(() => {
          trySnipingMatch(target);
          broadcastSnipingOrderBook(target);
        });
      }

      const slotMapTypeIds = findPendingOrderMapTypes(userId);
      for (const mapTypeId of slotMapTypeIds) {
        queueMicrotask(() => {
          tryMatch(mapTypeId);
          broadcastOrderBook(mapTypeId);
        });
      }

      const itemTypes = findPendingItemOrderTypes(userId);
      for (const itemTypeId of itemTypes) {
        queueMicrotask(() => {
          matchItemOrders(itemTypeId);
          broadcastItemOrderBook(itemTypeId);
        });
      }

      const mapOrderTypes = findPendingMapOrderTypes(userId);
      for (const { map_type_id, mode } of mapOrderTypes) {
        queueMicrotask(() => {
          matchMapOrders(map_type_id, mode);
          broadcastMapOrderBook(map_type_id, mode);
        });
      }

      checkMapPendingCompletionsOnConnect(userId);

      // Resume any post-PONR transactions that were preserved through server restart
      resumeActiveMapTransactionsOnConnect(userId);

      // Resume parked slot/item/sniping verifications when the verifier reconnects
      resumeSlotVerificationsOnConnect(userId);
      resumeItemVerificationsOnConnect(userId);
      resumeSnipingVerificationsOnConnect(userId);

      // Re-send any pending verification challenges (user may have been offline when challenged)
      resendPendingVerificationsForUser(userId);

      if (isVersionAlertEnabled() && extVersion !== "legacy" && extVersion < SERVER_VERSION) {
        sendToUser(userId, {
          type: "version_outdated",
          payload: { serverVersion: SERVER_VERSION, extensionVersion: extVersion },
        });
      }
      return true;
    }

    case "ping":
      sendToUser(userId, { type: "pong" });
      return true;

    case "confirm_mh_link": {
      handleConfirmMHLink(userId, message.payload.mhUserId, message.payload.mhSnUserId);
      return true;
    }

    case "verify_mh_link": {
      handleVerifyMHLink(userId);
      return true;
    }

    case "verify_mh_link_result": {
      handleProxyVerifyResult(userId, message.payload);
      return true;
    }

    case "report_map_types":
      handleReportMapTypes(message.payload.mapTypes);
      return true;

    case "user_afk":
      handleUserAfk(userId);
      return true;

    case "user_active":
      handleUserActiveFromAfk(userId);
      return true;

    case "maps_removed":
      handleMapsRemoved(userId, message.payload.mapIds);
      return true;

    case "update_active_maps":
      handleUpdateActiveMaps(userId, message.payload.maps);
      return true;

    case "get_notification_prefs": {
      const prefs = getNotificationPrefs(userId);
      sendToUser(userId, { type: "notification_prefs", payload: prefs });
      return true;
    }

    case "update_notification_prefs": {
      const updatedPrefs = updateNotificationPrefs(userId, message.payload);
      audit("notification_prefs_updated", userId, message.payload);
      sendToUser(userId, { type: "notification_prefs", payload: updatedPrefs });
      return true;
    }

    case "map_completed_report": {
      const { mhMapId, mapName } = message.payload;
      handleMapCompletedReport(userId, mhMapId, mapName);
      return true;
    }

    case "xhr_log": {
      if (!isXhrLoggingEnabled()) return true;
      verboseLog("snipe-ws", `RECV xhr_log from user ${userId}: ${(message.payload as any)?.url ?? "unknown url"}`);
      writeXhrLog(userId, message.payload);
      return true;
    }

    case "report_game_settings": {
      const { allowMapInvites, allowAnonymousSupplyTransfers, utcOffset } = message.payload;
      setUserUtcOffset(userId, utcOffset ?? 0);
      const valid = allowMapInvites && allowAnonymousSupplyTransfers;

      if (valid) {
        const wasInvalid = isUserSettingsInvalid(userId);
        markUserSettingsValid(userId);

        if (wasInvalid) {
          // Settings fixed – re-run all matchers for this user's pending orders
          const mapTypeIds = findPendingOrderMapTypes(userId);
          for (const mapTypeId of mapTypeIds) {
            tryMatch(mapTypeId);
            broadcastOrderBook(mapTypeId);
          }

          const snipingTargets = findPendingSnipingOrderTargets(userId);
          for (const target of snipingTargets) {
            trySnipingMatch(target);
            broadcastSnipingOrderBook(target);
          }

          const activeItemTypes = findPendingItemOrderTypes(userId);
          for (const itemTypeId of activeItemTypes) {
            matchItemOrders(itemTypeId);
            broadcastItemOrderBook(itemTypeId);
          }

          const activeMapOrderTypes = findPendingMapOrderTypes(userId);
          for (const { map_type_id, mode } of activeMapOrderTypes) {
            matchMapOrders(map_type_id, mode);
            broadcastMapOrderBook(map_type_id, mode);
          }
        }
      } else {
        markUserSettingsInvalid(userId);
        sendToUser(userId, {
          type: "game_settings_invalid",
          payload: { allowMapInvites, allowAnonymousSupplyTransfers },
        });
      }
      return true;
    }

    case "get_available_sb": {
      const committedSb = getTotalCommittedSb(userId);
      sendToUser(userId, {
        type: "available_sb",
        payload: {
          totalSb: null,
          committedSb,
          availableSb: null,
        },
      });
      return true;
    }

    case "apply_for_beta": {
      if (hasPendingBetaRequest(userId)) {
        sendToUser(userId, {
          type: "error",
          payload: { message: "You already have a pending beta request", source: "apply_for_beta" },
        });
        return true;
      }

      const existing = findBetaRequestByUserId(userId);
      if (existing && existing.status === "approved") {
        sendToUser(userId, {
          type: "error",
          payload: { message: "You are already a beta tester", source: "apply_for_beta" },
        });
        return true;
      }

      const request = createBetaRequest(userId);
      audit("beta_request_created", userId);

      sendToUser(userId, { type: "beta_applied" });
      sendToUser(userId, {
        type: "beta_tester_status",
        payload: { isBetaTester: false, hasPendingRequest: true },
      });

      const betaReq = {
        id: request.id,
        userId: request.user_id,
        username: request.username,
        discordUsername: request.discord_username,
        status: request.status as "pending",
        createdAt: request.created_at,
      };
      for (const onlineId of getOnlineUserIds()) {
        const conn = getConnection(onlineId);
        if (conn?.user.role === "admin") {
          sendToUser(onlineId, {
            type: "admin_beta_request_received",
            payload: { request: betaReq },
          });
        }
      }
      return true;
    }

    case "acknowledge_alert": {
      const { alertId } = message.payload;
      acknowledgeAlert(userId, alertId);

      const isBeta = isUserBetaEligible(userId, user.role);
      const nextAlert = getUnacknowledgedAlert(userId, isBeta);
      if (nextAlert) {
        sendToUser(userId, { type: "active_alert", payload: nextAlert });
      }
      return true;
    }

    case "dismiss_version_alert":
      // No persistence – version alert re-shows on next connect if still outdated
      return true;

    case "complete_onboarding_step": {
      const { stepId, version } = message.payload;
      completeOnboardingTask(userId, stepId, version);
      const complete = isUserOnboardingComplete(userId);
      if (complete) {
        markUserOnboardingComplete(userId);
      }
      sendToUser(userId, {
        type: "onboarding_status",
        payload: {
          complete,
          tasks: getAllOnboardingTasks(userId),
        },
      });
      // If user just became complete, sweep all matchers for their pending orders
      if (complete) {
        const orderMapTypes = findPendingOrderMapTypes(userId);
        for (const mapTypeId of orderMapTypes) {
          queueMicrotask(() => {
            tryMatch(mapTypeId);
            broadcastOrderBook(mapTypeId);
          });
        }

        const snipingTargets = findPendingSnipingOrderTargets(userId);
        for (const target of snipingTargets) {
          queueMicrotask(() => {
            trySnipingMatch(target);
            broadcastSnipingOrderBook(target);
          });
        }

        const activeItemTypes = findPendingItemOrderTypes(userId);
        for (const itemTypeId of activeItemTypes) {
          queueMicrotask(() => {
            matchItemOrders(itemTypeId);
            broadcastItemOrderBook(itemTypeId);
          });
        }

        const activeMapOrderTypes = findPendingMapOrderTypes(userId);
        for (const { map_type_id, mode } of activeMapOrderTypes) {
          queueMicrotask(() => {
            matchMapOrders(map_type_id, mode);
            broadcastMapOrderBook(map_type_id, mode);
          });
        }
      }
      return true;
    }

    case "verify_transfer_result": {
      const { transactionId, verificationType, verified, error } = message.payload;
      handleVerificationResult(transactionId, verificationType, verified, error);
      return true;
    }

    default:
      return false;
  }
}

function handleUserAfk(userId: number): void {
  markUserAfk(userId);
  audit("user_afk", userId);
}

/**
 * Clear AFK status and re-run the matcher for all pending orders.
 * Also resumes parked sniping payments and deferred RT advancements.
 */
function handleUserActiveFromAfk(userId: number): void {
  markUserActive(userId);
  audit("user_active", userId);

  // Resume parked sniping payments BEFORE running matchers
  resumePendingPayments(userId);

  resumeDeferredRtAdvancements(userId);

  const mapTypeIds = findPendingOrderMapTypes(userId);
  for (const mapTypeId of mapTypeIds) {
    tryMatch(mapTypeId);
    broadcastOrderBook(mapTypeId);
  }

  const snipingTargets = findPendingSnipingOrderTargets(userId);
  for (const target of snipingTargets) {
    trySnipingMatch(target);
    broadcastSnipingOrderBook(target);
  }

  const activeItemTypes = findPendingItemOrderTypes(userId);
  for (const itemTypeId of activeItemTypes) {
    matchItemOrders(itemTypeId);
    broadcastItemOrderBook(itemTypeId);
  }

  const activeMapOrderTypes = findPendingMapOrderTypes(userId);
  for (const { map_type_id, mode } of activeMapOrderTypes) {
    matchMapOrders(map_type_id, mode);
    broadcastMapOrderBook(map_type_id, mode);
  }
}

/**
 * Cancel any sell orders referencing removed maps and update the order book.
 */
function handleMapsRemoved(userId: number, mapIds: number[]): void {
  const cancelled = cancelSellOrdersByMapIds(userId, mapIds);

  const affectedMapTypes = new Set<number>();
  for (const row of cancelled) {
    audit("order_cancelled", userId, {
      orderId: row.id,
      reason: "map_removed",
      mhMapId: row.mh_map_id,
    });

    sendToUser(userId, {
      type: "order_cancelled",
      payload: { orderId: row.id },
    });

    affectedMapTypes.add(row.map_type_id);
  }

  for (const mapTypeId of affectedMapTypes) {
    broadcastOrderBook(mapTypeId);
  }
}

/** Dedup: mapId -> timestamp of last broadcast (prevents spam from multiple users). */
const recentMapCompletions = new Map<number, number>();
const MAP_COMPLETE_DEDUP_MS = 60_000;

function handleMapCompletedReport(userId: number, mhMapId: number, mapName: string): void {
  const lastBroadcast = recentMapCompletions.get(mhMapId);
  if (lastBroadcast && Date.now() - lastBroadcast < MAP_COMPLETE_DEDUP_MS) return;
  recentMapCompletions.set(mhMapId, Date.now());

  if (recentMapCompletions.size > 100) {
    const now = Date.now();
    for (const [id, ts] of recentMapCompletions) {
      if (now - ts > MAP_COMPLETE_DEDUP_MS) recentMapCompletions.delete(id);
    }
  }

  // Broadcast to all connected users on this map (except the reporter – they notify locally)
  const usersOnMap = getUsersOnMap(mhMapId);
  for (const uid of usersOnMap) {
    if (uid === userId) continue;
    sendToUser(uid, { type: "map_completed", payload: { mhMapId, mapName } });
  }

  advanceRtTransactionsForMap(mhMapId);
}

function handleUpdateActiveMaps(
  userId: number,
  maps: Array<{ mapId: number; mapClass: MHMapClass }>
): void {
  verboseLog("snipe-ws", `RECV update_active_maps from user ${userId}: maps=[${maps.map((m) => `${m.mapId}(${m.mapClass})`).join(", ")}]`);
  const { removedMapIds, removedClasses } = setUserActiveMaps(userId, maps);

  // Sniping abandonment: check sniper left active sniping maps
  const currentMapIds = new Set(maps.map((m) => m.mapId));
  const activeTxns = findActiveSnipingTransactionsAsSniper(userId);
  verboseLog("snipe-ws", `  active sniping txns as sniper: [${activeTxns.map((t) => `#${t.id}(map=${t.mh_map_id},state=${t.state})`).join(", ")}]`);
  for (const txn of activeTxns) {
    if (!currentMapIds.has(txn.mh_map_id)) {
      verboseLog("snipe-ws", `  txn #${txn.id}: map ${txn.mh_map_id} NOT in current set → triggering sniper_left`);
      handleSniperLeftMap(txn.id);
    } else {
      verboseLog("snipe-ws", `  txn #${txn.id}: map ${txn.mh_map_id} present ✓`);
    }
  }

  // RT buyer left map: check if buyer has awaiting_map_completion txns for maps they left
  const rtAwaitingTxns = findRtAwaitingCompletionByBuyer(userId);
  for (const rtTxn of rtAwaitingTxns) {
    if (!currentMapIds.has(rtTxn.mh_map_id)) {
      triggerRtManualFallback(userId, rtTxn.id);
    }
  }

  // Probe for lost mh_map_id recovery (opening_scroll with NULL mh_map_id)
  probeForOpenedMap(userId);

  // Class-aware sweep: when a map class was removed, sweep matchers for that class
  if (removedClasses.size > 0 || maps.length === 0) {
    const slotMapTypeIds = findPendingBuyMapTypes(userId);
    for (const mapTypeId of slotMapTypeIds) {
      const cls = getMapTypeClass(mapTypeId);
      if (maps.length === 0 || !cls || removedClasses.has(cls as MHMapClass)) {
        queueMicrotask(() => {
          tryMatch(mapTypeId);
          broadcastOrderBook(mapTypeId);
        });
      }
    }

    const mapOrderTypes = findPendingMapOrderTypes(userId);
    for (const { map_type_id, mode } of mapOrderTypes) {
      const cls = getMapTypeClass(map_type_id);
      if (maps.length === 0 || !cls || removedClasses.has(cls as MHMapClass)) {
        queueMicrotask(() => {
          matchMapOrders(map_type_id, mode);
          broadcastMapOrderBook(map_type_id, mode);
        });
      }
    }

    const snipingSellTargets = findPendingSnipingSellTargets(userId);
    for (const target of snipingSellTargets) {
      queueMicrotask(() => {
        trySnipingMatch(target);
        broadcastSnipingOrderBook(target);
      });
    }
  }
}

function handleConfirmMHLink(
  userId: number,
  mhUserId: number,
  mhSnUserId: string,
): void {
  const existingForUser = findMHAccountByUserId(userId);
  if (existingForUser && existingForUser.verified_at) {
    // Account already verified. Return success so the panel initialises its
    // mhAccount state correctly (e.g. after the success response was lost in
    // a disconnect and the user refreshed).
    sendToUser(userId, {
      type: "mh_link_result",
      payload: {
        success: true,
        mhAccount: {
          userId: existingForUser.user_id,
          mhUserId: existingForUser.mh_user_id,
          mhSnUserId: existingForUser.mh_sn_user_id,
          verifiedAt: existingForUser.verified_at,
        },
      },
    });
    return;
  }

  const existingMHLink = findMHAccountByMHUserId(mhUserId);
  if (existingMHLink && existingMHLink.verified_at && existingMHLink.user_id !== userId) {
    sendToUser(userId, {
      type: "mh_link_result",
      payload: {
        success: false,
        error: "This MouseHunt account is already linked to another user.",
        code: "already_linked",
      },
    });
    return;
  }

  // Clean up any previous pending (unverified) link for this user
  deletePendingMHAccount(userId);

  const code = randomBytes(4).toString("hex").toUpperCase();
  createMHAccountPending(userId, mhUserId, mhSnUserId, code);

  sendToUser(userId, {
    type: "mh_link_verify_code",
    payload: { code, mhUserId },
  });
}

async function handleVerifyMHLink(userId: number): Promise<void> {
  const account = findMHAccountByUserId(userId);
  if (!account || !account.verification_token) {
    sendToUser(userId, {
      type: "mh_link_result",
      payload: { success: false, error: "No pending verification found." },
    });
    return;
  }

  const code = account.verification_token;
  const snUserId = account.mh_sn_user_id;

  let messages: Array<{ body: string; sn_user_id: string }>;
  try {
    const method = getVerificationMethod();
    if (method === "proxy_user") {
      try {
        messages = await fetchCorkboardViaProxy(snUserId, userId);
      } catch (proxyErr) {
        console.log(`[shared-handlers] proxy verification failed for user ${userId}: ${(proxyErr as Error).message}, falling back to service account`);
        messages = await fetchCorkboardMessages(snUserId);
      }
    } else {
      messages = await fetchCorkboardMessages(snUserId);
    }
  } catch (err) {
    console.log(`[shared-handlers] corkboard fetch failed for user ${userId}: ${(err as Error).message}`);
    sendToUser(userId, {
      type: "mh_link_result",
      payload: { success: false, error: "Could not verify at this time. Please try again." },
    });
    return;
  }

  const found = messages.some(
    (msg) => msg.body.includes(code) && msg.sn_user_id === snUserId,
  );

  if (!found) {
    sendToUser(userId, {
      type: "mh_link_result",
      payload: {
        success: false,
        error: "Verification code not found on your corkboard. Make sure you posted it and try again.",
      },
    });
    return;
  }

  markVerified(userId);
  audit("mh_account_linked", userId, { mhUserId: account.mh_user_id, mhSnUserId: snUserId });

  const verified = findMHAccountByUserId(userId)!;
  sendToUser(userId, {
    type: "mh_link_result",
    payload: {
      success: true,
      mhAccount: {
        userId: verified.user_id,
        mhUserId: verified.mh_user_id,
        mhSnUserId: verified.mh_sn_user_id,
        verifiedAt: verified.verified_at!,
      },
    },
  });
}
