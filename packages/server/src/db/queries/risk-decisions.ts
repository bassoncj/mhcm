import { getDb } from "../connection.js";

interface RiskDecisionRow {
  buy_order_id: number;
  sell_order_id: number;
  decision: "accepted" | "blocked";
  created_at: string;
}

export function findSlotRiskDecision(
  buyOrderId: number,
  sellOrderId: number
): RiskDecisionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM slot_risk_decisions WHERE buy_order_id = ? AND sell_order_id = ?")
    .get(buyOrderId, sellOrderId) as RiskDecisionRow | undefined;
}

export function upsertSlotRiskDecision(
  buyOrderId: number,
  sellOrderId: number,
  decision: "accepted" | "blocked"
): void {
  getDb()
    .prepare(
      `INSERT INTO slot_risk_decisions (buy_order_id, sell_order_id, decision)
       VALUES (?, ?, ?)
       ON CONFLICT (buy_order_id, sell_order_id)
       DO UPDATE SET decision = excluded.decision, created_at = datetime('now')`
    )
    .run(buyOrderId, sellOrderId, decision);
}

export function deleteSlotRiskDecision(
  buyOrderId: number,
  sellOrderId: number
): void {
  getDb()
    .prepare("DELETE FROM slot_risk_decisions WHERE buy_order_id = ? AND sell_order_id = ?")
    .run(buyOrderId, sellOrderId);
}

/** Clean up all risk decisions for a sell order (on fill/cancel). */
export function deleteSlotRiskDecisionsForSellOrder(sellOrderId: number): void {
  getDb()
    .prepare("DELETE FROM slot_risk_decisions WHERE sell_order_id = ?")
    .run(sellOrderId);
}

export function findMapRiskDecision(
  buyOrderId: number,
  sellOrderId: number
): RiskDecisionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM map_risk_decisions WHERE buy_order_id = ? AND sell_order_id = ?")
    .get(buyOrderId, sellOrderId) as RiskDecisionRow | undefined;
}

export function upsertMapRiskDecision(
  buyOrderId: number,
  sellOrderId: number,
  decision: "accepted" | "blocked"
): void {
  getDb()
    .prepare(
      `INSERT INTO map_risk_decisions (buy_order_id, sell_order_id, decision)
       VALUES (?, ?, ?)
       ON CONFLICT (buy_order_id, sell_order_id)
       DO UPDATE SET decision = excluded.decision, created_at = datetime('now')`
    )
    .run(buyOrderId, sellOrderId, decision);
}

export function deleteMapRiskDecision(
  buyOrderId: number,
  sellOrderId: number
): void {
  getDb()
    .prepare("DELETE FROM map_risk_decisions WHERE buy_order_id = ? AND sell_order_id = ?")
    .run(buyOrderId, sellOrderId);
}

/** Clean up all risk decisions for a sell order (on fill/cancel). */
export function deleteMapRiskDecisionsForSellOrder(sellOrderId: number): void {
  getDb()
    .prepare("DELETE FROM map_risk_decisions WHERE sell_order_id = ?")
    .run(sellOrderId);
}
