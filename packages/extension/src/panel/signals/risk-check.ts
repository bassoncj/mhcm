import { signal } from "@preact/signals";

export interface RiskCheckState {
  transactionId: number;
  marketplace: "slot" | "map";
  mapTypeId: number;
  goalType: "mouse" | "item";
  remainingGoals: Array<{ uniqueId: number; type: string; name: string; thumbnail: string | null }>;
  atRiskGoals: Array<{ type: string; reason: string }>;
  timeoutSeconds: number;
  environmentType: string | null;
  /** "pending" = awaiting user decision, "timed_out" = server timed out, offer retry */
  status: "pending" | "timed_out";
  /** For retry after timeout */
  sellOrderId?: number;
  buyOrderId?: number;
}

/** Active risk check prompt (null = no active prompt). */
export const activeRiskCheck = signal<RiskCheckState | null>(null);
