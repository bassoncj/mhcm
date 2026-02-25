import type { RiskCheckGoal } from "@mhcm/shared";
import { findMouseTypeByType } from "../db/queries/mouse-types.js";
import { findItemTypeByType } from "../db/queries/item-types.js";

/**
 * Enrich raw goal data (uniqueId + type) with names and thumbnails from DB.
 * Used to build the risk_check_prompt payload.
 */
export function enrichGoalData(
  goals: Array<{ uniqueId: number; type: string }>,
  goalType: string,
): RiskCheckGoal[] {
  return goals.map((g) => {
    if (goalType === "item") {
      const item = findItemTypeByType(g.type);
      return {
        uniqueId: g.uniqueId,
        type: g.type,
        name: item?.name ?? g.type,
        thumbnail: item?.thumbnail ?? null,
      };
    }
    const mouse = findMouseTypeByType(g.type);
    return {
      uniqueId: g.uniqueId,
      type: g.type,
      name: mouse?.name ?? g.type,
      thumbnail: mouse?.thumbnail ?? null,
    };
  });
}
