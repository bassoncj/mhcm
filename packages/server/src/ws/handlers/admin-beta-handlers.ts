import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser, broadcast, isUserOnline } from "../connections.js";
import { isAdmin } from "./handler-utils.js";
import { audit } from "../../audit.js";
import { setMarketBeta, getMarketBetaConfig, isClosedBetaEnabled, setClosedBetaEnabled } from "../../settings.js";
import {
  findPendingBetaRequests,
  approveBetaRequest,
  denyBetaRequest,
} from "../../db/queries/beta-requests.js";
import {
  findAllowedTesters,
  addAllowedTester,
  removeAllowedTester,
} from "../../db/queries/allowed-testers.js";
import { findUserById } from "../../db/queries/users.js";

function mapBetaRequests(rows: Array<{ id: number; user_id: number; username: string; discord_username: string | null; status: string; created_at: string }>) {
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    discordUsername: r.discord_username,
    status: r.status as "pending" | "approved" | "denied",
    createdAt: r.created_at,
  }));
}

function getBetaStatusPayload() {
  const testers = findAllowedTesters().map((t) => ({
    discordId: t.discord_id,
    discordUsername: t.discord_username,
    addedBy: t.added_by,
    createdAt: t.created_at,
  }));
  return {
    enabled: isClosedBetaEnabled(),
    testers,
  };
}

export function handleAdminBetaMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "admin_set_market_beta": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_market_beta" } });
        return true;
      }
      const { market, beta } = message.payload;
      setMarketBeta(market, beta);
      audit("market_beta_toggled", userId, { market, beta });
      broadcast({ type: "market_beta_config", payload: getMarketBetaConfig() });
      return true;
    }

    case "admin_get_beta_requests": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_get_beta_requests" } });
        return true;
      }
      const rows = findPendingBetaRequests();
      sendToUser(userId, {
        type: "admin_beta_requests",
        payload: { requests: mapBetaRequests(rows) },
      });
      return true;
    }

    case "admin_approve_beta_request": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_approve_beta_request" } });
        return true;
      }
      const { requestId: approveId } = message.payload;
      const approved = approveBetaRequest(approveId, userId);
      if (!approved) {
        sendToUser(userId, { type: "error", payload: { message: "Request not found or already reviewed", source: "admin_approve_beta_request" } });
        return true;
      }

      const approvedUser = findUserById(approved.user_id);
      if (approvedUser?.discord_id) {
        try {
          addAllowedTester(approvedUser.discord_id, approvedUser.discord_username, userId);
        } catch (err: any) {
          if (err.code !== "SQLITE_CONSTRAINT_UNIQUE") throw err;
        }
      }

      audit("beta_request_approved", userId, { requestId: approveId, approvedUserId: approved.user_id });

      if (isUserOnline(approved.user_id)) {
        sendToUser(approved.user_id, {
          type: "beta_tester_status",
          payload: { isBetaTester: true, hasPendingRequest: false },
        });
      }

      const updatedRows = findPendingBetaRequests();
      sendToUser(userId, {
        type: "admin_beta_requests",
        payload: { requests: mapBetaRequests(updatedRows) },
      });
      return true;
    }

    case "admin_deny_beta_request": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_deny_beta_request" } });
        return true;
      }
      const { requestId: denyId } = message.payload;
      const denied = denyBetaRequest(denyId, userId);
      if (!denied) {
        sendToUser(userId, { type: "error", payload: { message: "Request not found or already reviewed", source: "admin_deny_beta_request" } });
        return true;
      }

      audit("beta_request_denied", userId, { requestId: denyId, deniedUserId: denied.user_id });

      const updatedDenyRows = findPendingBetaRequests();
      sendToUser(userId, {
        type: "admin_beta_requests",
        payload: { requests: mapBetaRequests(updatedDenyRows) },
      });
      return true;
    }

    case "admin_get_beta_status": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_get_beta_status" } });
        return true;
      }
      sendToUser(userId, { type: "admin_beta_status", payload: getBetaStatusPayload() });
      return true;
    }

    case "admin_toggle_beta": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_toggle_beta" } });
        return true;
      }
      const newValue = !isClosedBetaEnabled();
      setClosedBetaEnabled(newValue);
      audit("closed_beta_toggled", userId, { enabled: newValue });
      sendToUser(userId, { type: "admin_beta_status", payload: getBetaStatusPayload() });
      return true;
    }

    case "admin_add_beta_tester": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_add_beta_tester" } });
        return true;
      }
      const { discordId, discordUsername } = message.payload;
      try {
        addAllowedTester(discordId, discordUsername ?? null, userId);
        audit("tester_added", userId, { discordId, discordUsername });
        sendToUser(userId, { type: "admin_beta_status", payload: getBetaStatusPayload() });
      } catch (err: any) {
        if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
          sendToUser(userId, { type: "error", payload: { message: "Discord ID already in tester list", source: "admin_add_beta_tester" } });
        } else {
          throw err;
        }
      }
      return true;
    }

    case "admin_remove_beta_tester": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_remove_beta_tester" } });
        return true;
      }
      const { discordId: removeId } = message.payload;
      const removed = removeAllowedTester(removeId);
      if (!removed) {
        sendToUser(userId, { type: "error", payload: { message: "Discord ID not found in tester list", source: "admin_remove_beta_tester" } });
        return true;
      }
      audit("tester_removed", userId, { discordId: removeId });
      sendToUser(userId, { type: "admin_beta_status", payload: getBetaStatusPayload() });
      return true;
    }

    default:
      return false;
  }
}
