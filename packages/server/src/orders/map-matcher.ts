import type { MapOrderMode, MHMapClass } from "@mhcm/shared";
import { getDb } from "../db/connection.js";
import { isMarketEnabled } from "../settings.js";
import {
  findBestMapSellOrder,
  findCandidateMapBuyOrders,
  updateMapOrderFill,
  deprioritizeMapOrder,
  findAllOpenMapOrderTypes,
} from "../db/queries/map-orders.js";
import { createMapTransaction } from "../db/queries/map-transactions.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { findMapTypeById, getMapTypeClass } from "../db/queries/map-types.js";
import {
  getOnlineUserIds,
  getAfkUserIds,
  getBusyBuyerIds,
  getInvalidSettingsUserIds,
  getUnfinishedOnboardingUserIds,
  getPendingRtConfirmationUserIds,
} from "../ws/connections.js";
import { audit } from "../audit.js";
import { findMapRiskDecision } from "../db/queries/risk-decisions.js";
import { isDraining } from "../drain.js";
import { startMapTransaction } from "../transactions/map-orchestrator.js";

/**
 * 1. Find best sell (lowest price, oldest priority)
 * 2. Find candidate buys (highest price first, tier-compatible for completed)
 * 3. If sell.price <= buy.price, match at sell's price
 * 4. Fill exactly 1 map per match (fair queue)
 * 5. CRITICAL: Deprioritize both sell and buy orders after match
 * 6. Create transaction record
 * 7. Repeat until no more matches
 */
export function matchMapOrders(mapTypeId: number, mode: MapOrderMode): void {
  if (!isMarketEnabled("maps")) return;
  if (isDraining()) return;
  const db = getDb();

  const matchAll = db.transaction(() => {
    const onlineIds = getOnlineUserIds();
    if (onlineIds.size === 0) return;

    const afkIds = getAfkUserIds();
    const invalidSettingsIds = getInvalidSettingsUserIds();
    const onboardingIds = getUnfinishedOnboardingUserIds();
    const rtConfirmIds = getPendingRtConfirmationUserIds();
    const excludedIds = new Set([...invalidSettingsIds, ...onboardingIds, ...rtConfirmIds]);

    // COMPLETED MODE: Exclude buyers in active transactions (can't be on two maps)
    const busyIds = mode === "completed" ? getBusyBuyerIds() : new Set<number>();

    const mapClass = getMapTypeClass(mapTypeId) as MHMapClass | null;

    let matched = true;
    while (matched) {
      matched = false;

      const bestSell = findBestMapSellOrder(
        mapTypeId,
        mode,
        onlineIds,
        afkIds,
        busyIds,
        excludedIds,
        mapClass
      );

      if (!bestSell) break;

      const candidateBuys = findCandidateMapBuyOrders(
        mapTypeId,
        mode,
        bestSell.price,
        bestSell.tier,
        onlineIds,
        afkIds,
        busyIds,
        excludedIds,
        mapClass
      );

      if (candidateBuys.length === 0) break;

      for (const buy of candidateBuys) {
        if (buy.user_id === bestSell.user_id) continue;

        if (mode === "completed") {
          const decision = findMapRiskDecision(buy.id, bestSell.id);
          if (decision?.decision === "blocked") continue;
        }

        if (bestSell.price > buy.price) break;

        const matchPrice = bestSell.price;
        const fillQty = 1;

        const sellerMH = findMHAccountByUserId(bestSell.user_id);
        const buyerMH = findMHAccountByUserId(buy.user_id);

        if (!sellerMH || !buyerMH) {
          console.error("[map-matcher] missing MH account for matched users");
          break;
        }

        const mapType = findMapTypeById(mapTypeId);
        const scrollItemType = mapType?.scroll_item_type ?? null;

        updateMapOrderFill(bestSell.id, fillQty);
        updateMapOrderFill(buy.id, fillQty);

        // CRITICAL: Deprioritize both parties (fair queuing)
        deprioritizeMapOrder(bestSell.id);
        deprioritizeMapOrder(buy.id);

        const txn = createMapTransaction({
          sellOrderId: bestSell.id,
          buyOrderId: buy.id,
          sellerUserId: bestSell.user_id,
          buyerUserId: buy.user_id,
          mapTypeId,
          mode,
          price: matchPrice,
          quantity: fillQty,
          mhMapId: mode === "completed" ? bestSell.mh_map_id : null,
          scrollItemType,
          sellerMhSnUserId: sellerMH.mh_sn_user_id,
          buyerMhSnUserId: buyerMH.mh_sn_user_id,
        });

        audit("map_order_matched", undefined, {
          transactionId: txn.id,
          sellOrderId: bestSell.id,
          buyOrderId: buy.id,
          sellerUserId: bestSell.user_id,
          buyerUserId: buy.user_id,
          price: matchPrice,
          quantity: fillQty,
          mapTypeId,
          mode,
        });

        matched = true;

        queueNotification(txn.id);
        break;
      }
    }
  });

  matchAll();
}

function queueNotification(txnId: number): void {
  queueMicrotask(() => startMapTransaction(txnId));
}

export function sweepAllMapMatches(): void {
  const pairs = findAllOpenMapOrderTypes();
  for (const { map_type_id, mode } of pairs) {
    matchMapOrders(map_type_id, mode);
  }
}
