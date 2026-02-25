import { getItemMoq, lcm } from "@mhcm/shared";
import {
  findBestItemSellOrder,
  findCandidateItemBuyOrders,
  updateItemOrderFill,
  findAllOpenItemOrderTypes,
} from "../db/queries/item-orders.js";
import {
  createItemTransaction,
} from "../db/queries/item-transactions.js";
import { findItemTypeById } from "../db/queries/item-types.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { getDb } from "../db/connection.js";
import { getOnlineUserIds, getAfkUserIds, getInvalidSettingsUserIds, getUnfinishedOnboardingUserIds, getPendingRtConfirmationUserIds } from "../ws/connections.js";
import { audit } from "../audit.js";
import { verboseLog, isMarketEnabled } from "../settings.js";
import { isDraining } from "../drain.js";
import { startItemTransaction } from "../transactions/item-orchestrator.js";

/**
 * Fill qty = min(sell.remaining, buy.remaining) per cycle (not 1).
 * Price execution = seller's ask price.
 * Self-trade: skip the buy and try next (don't break the loop).
 */
export function matchItemOrders(itemTypeId: number): number {
  if (!isMarketEnabled("items")) return 0;
  if (isDraining()) return 0;
  const onlineIds = getOnlineUserIds();
  if (onlineIds.size === 0) return 0;
  const afkIds = getAfkUserIds();
  const invalidSettingsIds = getInvalidSettingsUserIds();
  const onboardingIds = getUnfinishedOnboardingUserIds();
  const rtConfirmIds = getPendingRtConfirmationUserIds();
  const excludedIds = new Set([...invalidSettingsIds, ...onboardingIds, ...rtConfirmIds]);

  let transactionsCreated = 0;
  let matched = true;

  while (matched) {
    matched = false;

    const bestSell = findBestItemSellOrder(itemTypeId, onlineIds, afkIds, excludedIds);
    if (!bestSell) {
      verboseLog("item-match", `item ${itemTypeId}: no eligible sell orders`);
      break;
    }

    const sellRemaining = bestSell.quantity - bestSell.filled_quantity;
    verboseLog("item-match", `item ${itemTypeId}: best sell #${bestSell.id} (user ${bestSell.user_id}, ${bestSell.price} SB, ${sellRemaining} remaining)`);

    const candidateBuys = findCandidateItemBuyOrders(
      itemTypeId,
      bestSell.price,
      onlineIds,
      afkIds,
      excludedIds
    );

    if (candidateBuys.length === 0) {
      verboseLog("item-match", `  no eligible buy orders at >= ${bestSell.price} SB`);
      break;
    }

    for (const buy of candidateBuys) {
      if (buy.user_id === bestSell.user_id) {
        verboseLog("item-match", `  buy #${buy.id} skip: self-trade`);
        continue;
      }

      const buyRemaining = buy.quantity - buy.filled_quantity;
      const rawFill = Math.min(sellRemaining, buyRemaining);
      const fillMoq = lcm(getItemMoq(bestSell.price), getItemMoq(buy.price));
      const fillQty = Math.floor(rawFill / fillMoq) * fillMoq;
      if (fillQty === 0) {
        verboseLog("item-match", `  buy #${buy.id} skip: can't fill valid MOQ qty (need multiple of ${fillMoq}, max ${rawFill})`);
        continue;
      }

      const sellerMH = findMHAccountByUserId(bestSell.user_id);
      const buyerMH = findMHAccountByUserId(buy.user_id);
      if (!sellerMH || !buyerMH) {
        verboseLog("item-match", `  buy #${buy.id} skip: missing MH account (seller=${!!sellerMH}, buyer=${!!buyerMH})`);
        continue;
      }

      const itemType = findItemTypeById(itemTypeId);
      if (!itemType) {
        verboseLog("item-match", `  skip: item type ${itemTypeId} not found`);
        break;
      }

      const matchPrice = bestSell.price;

      verboseLog("item-match", `  matched! sell #${bestSell.id} ↔ buy #${buy.id}: ${fillQty} units @ ${matchPrice} SB`);

      const txn = getDb().transaction(() => {
        updateItemOrderFill(bestSell.id, fillQty);
        updateItemOrderFill(buy.id, fillQty);

        return createItemTransaction({
          sellOrderId: bestSell.id,
          buyOrderId: buy.id,
          sellerUserId: bestSell.user_id,
          buyerUserId: buy.user_id,
          itemTypeId,
          itemType: itemType.type,
          price: matchPrice,
          quantity: fillQty,
          sellerMhSnUserId: sellerMH.mh_sn_user_id,
          buyerMhSnUserId: buyerMH.mh_sn_user_id,
        });
      })();

      audit("item_order_matched", undefined, {
        transactionId: txn.id,
        sellOrderId: bestSell.id,
        buyOrderId: buy.id,
        sellerUserId: bestSell.user_id,
        buyerUserId: buy.user_id,
        itemTypeId,
        price: matchPrice,
        quantity: fillQty,
      });

      transactionsCreated++;
      matched = true;

      queueMicrotask(() => startItemTransaction(txn.id));

      break;
    }

    if (!matched) break;
  }

  return transactionsCreated;
}

/**
 * Sweep all item types with open orders for potential matches.
 * Called on server startup and when users come online.
 */
export function sweepAllItemMatches(): void {
  const itemTypeIds = findAllOpenItemOrderTypes();
  if (itemTypeIds.length === 0) return;

  verboseLog("item-match", `sweep: checking ${itemTypeIds.length} item type(s) for matches`);
  for (const itemTypeId of itemTypeIds) {
    matchItemOrders(itemTypeId);
  }
}
