import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../auth/sessions.js";
import { sendToUser } from "./connections.js";
import { handleSharedMessage } from "./handlers/shared-handlers.js";
import { handleSlotMessage } from "./handlers/slot-handlers.js";
import { handleSnipingMessage } from "./handlers/sniping-handlers.js";
import { handleItemMessage } from "./handlers/item-handlers.js";
import { handleMapMessage } from "./handlers/map-handlers.js";
import { handleModMessage } from "./handlers/mod-handlers.js";
import { handleAdminMessage } from "./handlers/admin-handlers.js";
import { classifyWsMessage, checkWsRateLimit } from "../util/rate-limit.js";

export function handleMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): void {
  const category = classifyWsMessage(message);
  if (category !== null && !checkWsRateLimit(userId, category)) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Rate limit exceeded. Please slow down.", source: message.type },
    });
    return;
  }

  if (handleSharedMessage(userId, user, message)) return;
  if (handleSlotMessage(userId, user, message)) return;
  if (handleSnipingMessage(userId, user, message)) return;
  if (handleItemMessage(userId, user, message)) return;
  if (handleMapMessage(userId, user, message)) return;
  if (handleModMessage(userId, user, message)) return;
  if (handleAdminMessage(userId, user, message)) return;

  const msg = message as { type: string };
  sendToUser(userId, {
    type: "error",
    payload: { message: `Unknown message type: ${msg.type}` },
  });
}
