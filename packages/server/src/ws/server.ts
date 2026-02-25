import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { WS_PING_INTERVAL_MS } from "@mhcm/shared";
import type { ClientMessage } from "@mhcm/shared";
import { authenticateWs } from "../auth/middleware.js";
import { findUserById, getActiveSuspension, liftSuspension, updateLastConnectedAt } from "../db/queries/users.js";
import { findPendingOrderMapTypes } from "../db/queries/slot-orders.js";
import { findPendingItemOrderTypes } from "../db/queries/item-orders.js";
import { matchItemOrders } from "../orders/item-matcher.js";
import { broadcastItemOrderBook } from "../orders/item-book.js";
import {
  addConnection,
  removeConnection,
  sendToUser,
  markUserOnboardingIncomplete,
} from "./connections.js";
import { getAllOnboardingTasks, getIncompleteOnboardingTasks } from "../db/queries/onboarding.js";
import { handleMessage } from "./handlers.js";
import { checkPendingPaymentsOnConnect, resumeRtStepsOnConnect } from "../transactions/slot-orchestrator.js";
import { checkItemPendingPaymentsOnConnect } from "../transactions/item-orchestrator.js";
import { audit } from "../audit.js";
import { getMapTypes, computeMapTypeStats } from "../maps/catalog.js";
import { tryMatch } from "../orders/slot-matcher.js";
import { broadcastOrderBook } from "../orders/slot-book.js";
import { isXhrLoggingEnabled, getMarketBetaConfig, getMarketEnabledConfig } from "../settings.js";
import { isDiscordIdAllowed } from "../db/queries/allowed-testers.js";
import { hasPendingBetaRequest } from "../db/queries/beta-requests.js";
import { getUnacknowledgedAlert } from "../db/queries/admin-alerts.js";
import { findUnresolvedPenaltiesForUser } from "../db/queries/payment-penalties.js";

export function setupWebSocket(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 1024 * 1024 });

  wss.on("connection", (ws: WebSocket, req) => {
    const user = authenticateWs(req);
    if (!user) {
      ws.close(4001, "Authentication required");
      return;
    }

    // Block suspended users (auto-lift expired suspensions)
    const dbUser = findUserById(user.userId);
    if (!dbUser) {
      ws.close(4003, "Account suspended");
      return;
    }
    if (dbUser.status === "suspended") {
      const suspension = getActiveSuspension(user.userId);
      if (suspension && suspension.expires_at && new Date(suspension.expires_at) < new Date()) {
        liftSuspension(suspension.id, null, "expired");
        audit("user_unsuspended", undefined, { userId: user.userId, reason: "auto_lift_expired" });
      } else {
        ws.close(4003, "Account suspended");
        return;
      }
    }

    addConnection(user.userId, ws, user);
    updateLastConnectedAt(user.userId);
    audit("ws_connected", user.userId);

    // Admins see all map types (including disabled), others see enabled only
    const mapTypes = user.role === "admin" ? getMapTypes("every") : getMapTypes("enabled");
    const stats = computeMapTypeStats();
    sendToUser(user.userId, { type: "map_types", payload: { mapTypes, stats } });

    sendToUser(user.userId, { type: "xhr_logging_state", payload: { enabled: isXhrLoggingEnabled() } });
    sendToUser(user.userId, { type: "market_beta_config", payload: getMarketBetaConfig() });
    sendToUser(user.userId, { type: "market_enabled_config", payload: getMarketEnabledConfig() });

    const isBetaTester = user.role !== "user"
      || (dbUser.discord_id ? isDiscordIdAllowed(dbUser.discord_id) : false);
    sendToUser(user.userId, {
      type: "beta_tester_status",
      payload: { isBetaTester, hasPendingRequest: hasPendingBetaRequest(user.userId) },
    });

    // Onboarding status gates UI until all steps completed
    const onboardingComplete = getIncompleteOnboardingTasks(user.userId).length === 0;
    if (!onboardingComplete) {
      markUserOnboardingIncomplete(user.userId);
    }
    sendToUser(user.userId, {
      type: "onboarding_status",
      payload: { complete: onboardingComplete, tasks: getAllOnboardingTasks(user.userId) },
    });

    const pendingAlert = getUnacknowledgedAlert(user.userId, isBetaTester);
    if (pendingAlert) {
      sendToUser(user.userId, { type: "active_alert", payload: pendingAlert });
    }

    checkPendingPaymentsOnConnect(user.userId);
    checkItemPendingPaymentsOnConnect(user.userId);

    // Resume RT steps for transactions stuck in claiming_chest/opening_chest/transferring_rt
    resumeRtStepsOnConnect(user.userId);

    sendUnresolvedSnipingPenalties(user.userId);

    // Re-run matcher for any pending orders this user has.
    // Ensures that a seller coming back online gets their orders matched,
    // and a buyer reconnecting (who isn't busy) gets matched too.
    const orderMapTypes = findPendingOrderMapTypes(user.userId);
    for (const mapTypeId of orderMapTypes) {
      queueMicrotask(() => {
        tryMatch(mapTypeId);
        broadcastOrderBook(mapTypeId);
      });
    }

    const itemTypeIds = findPendingItemOrderTypes(user.userId);
    for (const itemTypeId of itemTypeIds) {
      queueMicrotask(() => {
        matchItemOrders(itemTypeId);
        broadcastItemOrderBook(itemTypeId);
      });
    }

    // NOTE: Sniping matcher sweep is deferred to the report_version handler
    // in handlers.ts, ensuring the extension's content script is loaded
    // before we create transactions that require step execution.

    const pingTimer = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, WS_PING_INTERVAL_MS);

    ws.on("message", (data) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());
        handleMessage(user.userId, user, message);
      } catch (err) {
        console.error("[ws] invalid message from user", user.userId, err);
      }
    });

    ws.on("close", () => {
      clearInterval(pingTimer);
      removeConnection(user.userId);
      audit("ws_disconnected", user.userId);
    });

    ws.on("error", (err) => {
      console.error("[ws] error for user", user.userId, err);
    });
  });

  console.log("[ws] WebSocket server attached");
  return wss;
}

function sendUnresolvedSnipingPenalties(userId: number): void {
  const penalties = findUnresolvedPenaltiesForUser(userId);
  for (const p of penalties) {
    sendToUser(userId, {
      type: "sniping_payment_grace",
      payload: {
        transactionId: p.transaction_id,
        requiredAmount: p.required_amount,
        reportedBalance: p.reported_balance ?? 0,
        graceExpiresAt: p.grace_expires_at,
      },
    });
  }
}
