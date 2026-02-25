import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser } from "../connections.js";
import { isAdmin } from "./handler-utils.js";
import { readAuditLog } from "../../audit.js";

export function handleAdminAuditMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "admin_get_audit_log": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_get_audit_log" } });
        return true;
      }
      const { limit = 100, offset = 0 } = message.payload;
      const entries = readAuditLog(Math.min(limit, 500), offset);
      sendToUser(userId, { type: "admin_audit_log", payload: { entries, limit, offset } });
      return true;
    }

    default:
      return false;
  }
}
