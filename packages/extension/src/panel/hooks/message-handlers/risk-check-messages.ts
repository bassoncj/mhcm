import type { ServerMessage } from "@mhcm/shared";
import type { RiskCheckShowPromptPayload } from "../../../shared/messaging.js";
import { activeRiskCheck } from "../../signals/risk-check.js";
import { showToast } from "../../signals/toast.js";

export function handleRiskCheckShowPrompt(payload: RiskCheckShowPromptPayload): void {
  activeRiskCheck.value = {
    transactionId: payload.transactionId,
    marketplace: payload.marketplace,
    mapTypeId: payload.mapTypeId,
    goalType: payload.goalType,
    remainingGoals: payload.remainingGoals,
    atRiskGoals: payload.atRiskGoals,
    timeoutSeconds: payload.timeoutSeconds,
    environmentType: payload.environmentType,
    status: "pending",
  };
}

export function handleRiskCheckServerMessage(message: ServerMessage): boolean {
  switch (message.type) {
    case "risk_check_timed_out":
      activeRiskCheck.value = {
        ...activeRiskCheck.value!,
        transactionId: message.payload.transactionId,
        marketplace: message.payload.marketplace,
        mapTypeId: message.payload.mapTypeId,
        status: "timed_out",
        sellOrderId: message.payload.sellOrderId,
        buyOrderId: message.payload.buyOrderId,
      };
      return true;

    case "risk_check_retry_no_match":
      activeRiskCheck.value = null;
      showToast("No matching sell order found", "info");
      return true;

    default:
      return false;
  }
}
