import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { handleAdminSystemMessage } from "./admin-system-handlers.js";
import { handleAdminDemoMessage } from "./admin-demo-handlers.js";
import { handleAdminBetaMessage } from "./admin-beta-handlers.js";
import { handleAdminUsersMessage } from "./admin-users-handlers.js";
import { handleAdminAuditMessage } from "./admin-audit-handlers.js";

export { scheduleUpcomingAlerts } from "./admin-system-handlers.js";

export function handleAdminMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  return (
    handleAdminSystemMessage(userId, user, message) ||
    handleAdminDemoMessage(userId, user, message) ||
    handleAdminBetaMessage(userId, user, message) ||
    handleAdminUsersMessage(userId, user, message) ||
    handleAdminAuditMessage(userId, user, message)
  );
}
