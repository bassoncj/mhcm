import type { ClientMessage, UserStatus } from "@mhcm/shared";
import type { UserRole } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser } from "../connections.js";
import { isAdmin } from "./handler-utils.js";
import { audit } from "../../audit.js";
import { findAllUsers, findUserById, setUserRole } from "../../db/queries/users.js";
import { findMHAccountByUserId } from "../../db/queries/mh-accounts.js";

function mapUserRow(r: { id: number; username: string; role: string; status: string; created_at: string; last_connected_at: string | null; is_demo?: number }) {
  return {
    id: r.id,
    username: r.username,
    role: r.role as UserRole,
    status: r.status as UserStatus,
    createdAt: r.created_at,
    lastConnectedAt: r.last_connected_at ?? null,
    mhLinked: !!findMHAccountByUserId(r.id)?.verified_at,
  };
}

export function handleAdminUsersMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "admin_get_users": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_get_users" } });
        return true;
      }
      const rows = findAllUsers();
      const users = rows.filter((r) => r.is_demo !== 1).map(mapUserRow);
      sendToUser(userId, { type: "admin_users_list", payload: { users } });
      return true;
    }

    case "admin_get_user": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_get_user" } });
        return true;
      }
      const { userId: targetId } = message.payload;
      const row = findUserById(targetId);
      if (!row) {
        sendToUser(userId, { type: "error", payload: { message: "User not found", source: "admin_get_user" } });
        return true;
      }
      sendToUser(userId, { type: "admin_user", payload: { user: mapUserRow(row) } });
      return true;
    }

    case "admin_set_user_role": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_user_role" } });
        return true;
      }
      const { userId: targetId, role } = message.payload;
      const validRoles: UserRole[] = ["user", "moderator", "admin"];
      if (!validRoles.includes(role)) {
        sendToUser(userId, { type: "error", payload: { message: "role must be 'user', 'moderator', or 'admin'", source: "admin_set_user_role" } });
        return true;
      }
      const target = findUserById(targetId);
      if (!target) {
        sendToUser(userId, { type: "error", payload: { message: "User not found", source: "admin_set_user_role" } });
        return true;
      }
      if (target.id === userId && role !== "admin") {
        sendToUser(userId, { type: "error", payload: { message: "Cannot change your own role", source: "admin_set_user_role" } });
        return true;
      }
      const oldRole = target.role;
      setUserRole(targetId, role);
      audit("user_role_changed", userId, {
        targetUserId: targetId,
        targetUsername: target.username,
        oldRole,
        newRole: role,
      });
      // Refresh the user list so the caller sees the updated role
      const rows = findAllUsers();
      const users = rows.filter((r) => r.is_demo !== 1).map(mapUserRow);
      sendToUser(userId, { type: "admin_users_list", payload: { users } });
      return true;
    }

    default:
      return false;
  }
}
