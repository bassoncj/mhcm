import type { ClientMessage, UserListItem } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser, getConnection } from "../connections.js";
import { isAdminOrMod } from "./handler-utils.js";
import { audit } from "../../audit.js";
import {
  findAllUsers,
  findUserById,
  createSuspension,
  liftSuspension,
  getActiveSuspension,
  getSuspensionHistory,
} from "../../db/queries/users.js";
import { findMHAccountByUserId } from "../../db/queries/mh-accounts.js";

function rowToUserListItem(r: { id: number; username: string; role: string; status: string; created_at: string; last_connected_at: string | null }): UserListItem {
  return {
    id: r.id,
    username: r.username,
    role: r.role as UserListItem["role"],
    status: r.status as UserListItem["status"],
    createdAt: r.created_at,
    lastConnectedAt: r.last_connected_at ?? null,
    mhLinked: !!findMHAccountByUserId(r.id)?.verified_at,
  };
}

export function handleModUserMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "mod_get_users": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_users" } });
        return true;
      }
      const rows = findAllUsers();
      const users = rows
        .filter((r) => r.is_demo !== 1)
        .map(rowToUserListItem);
      sendToUser(userId, { type: "mod_users_list", payload: { users } });
      return true;
    }

    case "mod_suspend_user": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_suspend_user" } });
        return true;
      }
      const { userId: targetId, reason, expiresAt } = message.payload;
      const target = findUserById(targetId);
      if (!target) {
        sendToUser(userId, { type: "error", payload: { message: "User not found", source: "mod_suspend_user" } });
        return true;
      }
      if (user.role === "moderator" && target.role !== "user") {
        sendToUser(userId, { type: "error", payload: { message: "Cannot suspend users with elevated roles", source: "mod_suspend_user" } });
        return true;
      }
      if (target.id === userId) {
        sendToUser(userId, { type: "error", payload: { message: "Cannot suspend yourself", source: "mod_suspend_user" } });
        return true;
      }
      createSuspension(targetId, userId, reason ?? null, expiresAt ?? null);
      audit("user_suspended", userId, {
        targetUserId: targetId,
        targetUsername: target.username,
        reason: reason ?? null,
        expiresAt: expiresAt ?? null,
      });
      const conn = getConnection(targetId);
      if (conn) {
        conn.ws.close(4003, "Account suspended");
      }
      sendToUser(userId, { type: "mod_user_updated", payload: { userId: targetId, status: "suspended" } });
      return true;
    }

    case "mod_unsuspend_user": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_unsuspend_user" } });
        return true;
      }
      const { userId: unsuspendId, note } = message.payload;
      const target = findUserById(unsuspendId);
      if (!target) {
        sendToUser(userId, { type: "error", payload: { message: "User not found", source: "mod_unsuspend_user" } });
        return true;
      }
      const suspension = getActiveSuspension(unsuspendId);
      if (suspension) {
        liftSuspension(suspension.id, userId, note ?? "manual");
      }
      audit("user_unsuspended", userId, {
        targetUserId: unsuspendId,
        targetUsername: target.username,
        note: note ?? null,
      });
      sendToUser(userId, { type: "mod_user_updated", payload: { userId: unsuspendId, status: "active" } });
      return true;
    }

    case "mod_get_suspensions": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_suspensions" } });
        return true;
      }
      const { userId: histUserId } = message.payload;
      const target = findUserById(histUserId);
      if (!target) {
        sendToUser(userId, { type: "error", payload: { message: "User not found", source: "mod_get_suspensions" } });
        return true;
      }
      const rows = getSuspensionHistory(histUserId);
      const suspensions = rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        suspendedBy: r.suspended_by,
        suspendedByUsername: r.suspended_by_username,
        reason: r.reason,
        suspendedAt: r.suspended_at,
        expiresAt: r.expires_at,
        liftedAt: r.lifted_at,
        liftedBy: r.lifted_by,
        liftedByUsername: r.lifted_by_username,
        liftNote: r.lift_note,
      }));
      sendToUser(userId, { type: "mod_suspension_history", payload: { userId: histUserId, suspensions } });
      return true;
    }

    default:
      return false;
  }
}
