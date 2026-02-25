import { getDb } from "../db/connection.js";
import { isMarketEnabled } from "../settings.js";
import {
  updateOrderFill,
  type OrderRow,
} from "../db/queries/slot-orders.js";
import {
  createTransaction,
} from "../db/queries/slot-transactions.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { getBusyBuyerIds, getOnlineUserIds, getAfkUserIds, getInvalidSettingsUserIds, getUnfinishedOnboardingUserIds, getPendingRtConfirmationUserIds, getUserActiveMaps, isMapsUnreported, isUserOnMapClass } from "../ws/connections.js";
import type { MHMapClass } from "@mhcm/shared";
import { getMapTypeClass } from "../db/queries/map-types.js";
import { startTransaction } from "../transactions/slot-orchestrator.js";
import { audit } from "../audit.js";
import { isDraining } from "../drain.js";

/**
 * Two-pass RT-aware matching per iteration:
 *
 *   Pass 1 – RT match:
 *     Best RT sell (lowest rt_price) + best RT buy (highest price, is_rt=1)
 *     Match at seller's rt_price if rt_price <= buy.price
 *
 *   Pass 2 – Standard match (only if Pass 1 didn't match):
 *     Best non-RT-only sell (lowest price, rt_only=0) + best non-RT buy (is_rt=0)
 *     Match at seller's price if price <= buy.price
 *
 * All existing clauses (online, AFK, busy, demo, tier, risk, map class,
 * onboarding, settings) apply to both passes identically.
 */
export function tryMatch(mapTypeId: number): void {
  if (!isMarketEnabled("slots")) return;
  if (isDraining()) return;
  const db = getDb();

  const matchAll = db.transaction(() => {
    let matched = true;

    const onlineIds = getOnlineUserIds();
    if (onlineIds.size === 0) return;
    const onlineClause = `AND user_id IN (${[...onlineIds].join(",")})`;

    const demoClause = "AND is_demo = 0";

    const afkIds = getAfkUserIds();
    const afkClause = afkIds.size > 0
      ? `AND user_id NOT IN (${[...afkIds].join(",")})`
      : "";

    const invalidSettingsIds = getInvalidSettingsUserIds();
    const settingsClause = invalidSettingsIds.size > 0
      ? `AND user_id NOT IN (${[...invalidSettingsIds].join(",")})`
      : "";

    const onboardingIds = getUnfinishedOnboardingUserIds();
    const onboardingClause = onboardingIds.size > 0
      ? `AND user_id NOT IN (${[...onboardingIds].join(",")})`
      : "";

    const rtConfirmIds = getPendingRtConfirmationUserIds();
    const rtConfirmClause = rtConfirmIds.size > 0
      ? `AND user_id NOT IN (${[...rtConfirmIds].join(",")})`
      : "";

    const sellShared = `
      AND status IN ('open', 'partially_filled')
      AND id NOT IN (
        SELECT sell_order_id FROM transactions WHERE state NOT IN ('completed', 'failed')
      )
      ${onlineClause} ${afkClause} ${settingsClause} ${onboardingClause} ${rtConfirmClause} ${demoClause}
    `;

    // Class-aware map presence check (stable per iteration – mapTypeId doesn't change)
    const mapClass = getMapTypeClass(mapTypeId) as MHMapClass | null;

    while (matched) {
      matched = false;

      // Recompute dynamic buy-side exclusions each iteration
      const busyIds = getBusyBuyerIds();
      const busyClause = busyIds.size > 0
        ? `AND user_id NOT IN (${[...busyIds].join(",")})`
        : "";

      const blockedByMapClass = new Set<number>();
      for (const uid of onlineIds) {
        if (isMapsUnreported(uid)) { blockedByMapClass.add(uid); continue; }
        if (getUserActiveMaps(uid).size > 0) {
          if (!mapClass) { blockedByMapClass.add(uid); continue; }
          if (isUserOnMapClass(uid, mapClass)) { blockedByMapClass.add(uid); continue; }
        }
      }
      const mapClassClause = blockedByMapClass.size > 0
        ? `AND user_id NOT IN (${[...blockedByMapClass].join(",")})`
        : "";

      const buyShared = `
        AND status IN ('open', 'partially_filled')
        AND id NOT IN (
          SELECT buy_order_id FROM transactions WHERE state NOT IN ('completed', 'failed')
        )
        ${onlineClause} ${busyClause} ${mapClassClause}
        ${afkClause} ${settingsClause} ${onboardingClause} ${rtConfirmClause} ${demoClause}
      `;

      const buildTierClause = (sellTier: string | null) =>
        sellTier
          ? `AND (accepted_tiers IS NULL OR accepted_tiers LIKE ?)`
          : `AND (accepted_tiers IS NULL OR accepted_tiers LIKE '%null%')`;

      const riskBlockClause =
        `AND id NOT IN (
           SELECT buy_order_id FROM slot_risk_decisions
           WHERE sell_order_id = ? AND decision = 'blocked'
         )`;

      const findBestBuy = (sell: OrderRow, rtFilter: string): OrderRow | undefined => {
        const tierClause = buildTierClause(sell.tier);
        return db
          .prepare(
            `SELECT * FROM orders
             WHERE map_type_id = ? AND side = 'buy'
               ${buyShared}
               ${rtFilter}
               AND user_id != ?
               ${tierClause}
               ${riskBlockClause}
             ORDER BY price DESC, priority_at ASC
             LIMIT 1`
          )
          .get(...(sell.tier
            ? [mapTypeId, sell.user_id, `%"${sell.tier}"%`, sell.id]
            : [mapTypeId, sell.user_id, sell.id])) as OrderRow | undefined;
      };

      const executeMatch = (sell: OrderRow, buy: OrderRow, price: number, isRt: boolean): void => {
        const fillQty = 1;
        const sellerMH = findMHAccountByUserId(sell.user_id);
        const buyerMH = findMHAccountByUserId(buy.user_id);

        if (!sellerMH || !buyerMH) {
          console.error("[matcher] missing MH account for matched users");
          return;
        }

        updateOrderFill(sell.id, fillQty);
        updateOrderFill(buy.id, fillQty);

        const txn = createTransaction({
          sellOrderId: sell.id,
          buyOrderId: buy.id,
          sellerUserId: sell.user_id,
          buyerUserId: buy.user_id,
          price,
          quantity: fillQty,
          mhMapId: sell.mh_map_id!,
          buyerMhSnUserId: buyerMH.mh_sn_user_id,
          sellerMhSnUserId: sellerMH.mh_sn_user_id,
          isRt: isRt ? 1 : 0,
        });

        audit("order_matched", undefined, {
          transactionId: txn.id,
          sellOrderId: sell.id,
          buyOrderId: buy.id,
          sellerUserId: sell.user_id,
          buyerUserId: buy.user_id,
          price,
          quantity: fillQty,
          mapTypeId,
          isRt,
        });

        matched = true;
        queueNotification(txn.id, sell.user_id, buy.user_id);
      };

      // Pass 1: RT match – best RT sell (has rt_price, sorted by rt_price ASC)
      const bestRtSell = db
        .prepare(
          `SELECT * FROM orders
           WHERE map_type_id = ? AND side = 'sell'
             AND rt_price IS NOT NULL
             ${sellShared}
           ORDER BY rt_price ASC, priority_at ASC
           LIMIT 1`
        )
        .get(mapTypeId) as OrderRow | undefined;

      if (bestRtSell) {
        const bestRtBuy = findBestBuy(bestRtSell, "AND is_rt = 1");

        if (bestRtBuy && bestRtSell.rt_price! <= bestRtBuy.price) {
          executeMatch(bestRtSell, bestRtBuy, bestRtSell.rt_price!, true);
          continue;
        }
      }

      // Pass 2: Standard match – best non-RT-only sell (excludes rt_only=1)
      const bestSell = db
        .prepare(
          `SELECT * FROM orders
           WHERE map_type_id = ? AND side = 'sell'
             AND rt_only = 0
             ${sellShared}
           ORDER BY price ASC, priority_at ASC
           LIMIT 1`
        )
        .get(mapTypeId) as OrderRow | undefined;

      if (!bestSell) break;

      const bestBuy = findBestBuy(bestSell, "AND is_rt = 0");

      if (!bestBuy) break;

      if (bestSell.price > bestBuy.price) break;

      executeMatch(bestSell, bestBuy, bestSell.price, false);
    }
  });

  matchAll();
}

const pendingNotifications: Array<{
  txnId: number;
  sellerId: number;
  buyerId: number;
}> = [];

function queueNotification(
  txnId: number,
  sellerId: number,
  buyerId: number
): void {
  pendingNotifications.push({ txnId, sellerId, buyerId });

  // Process on next tick to ensure DB transaction is committed
  if (pendingNotifications.length === 1) {
    queueMicrotask(processNotifications);
  }
}

function processNotifications(): void {
  while (pendingNotifications.length > 0) {
    const { txnId, sellerId, buyerId } = pendingNotifications.shift()!;
    startTransaction(txnId);
  }
}
