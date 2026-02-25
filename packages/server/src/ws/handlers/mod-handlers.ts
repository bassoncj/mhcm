import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { handleModMouseMessage } from "./mod-mouse-handlers.js";
import { handleModItemMessage } from "./mod-item-handlers.js";
import { handleModMapTypeMessage } from "./mod-map-type-handlers.js";
import { handleModUserMessage } from "./mod-user-handlers.js";

export function handleModMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  return (
    handleModMouseMessage(userId, user, message) ||
    handleModItemMessage(userId, user, message) ||
    handleModMapTypeMessage(userId, user, message) ||
    handleModUserMessage(userId, user, message)
  );
}
