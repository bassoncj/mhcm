import { getDb } from "../db/connection.js";
import type { SnipingTarget } from "@mhcm/shared";
import {
  findOpenSellOrders,
  findOpenBuyOrders,
  updateSnipingOrderStatus,
  type SnipingOrderRow,
} from "../db/queries/sniping-orders.js";
import {
  createSnipingTransaction,
  addSnipingTransactionMouse,
  addSnipingTransactionItem,
  findActiveSnipingMapIds,
} from "../db/queries/sniping-transactions.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { getOnlineUserIds, getAfkUserIds, getBusyBuyerIds, getInvalidSettingsUserIds, getUnfinishedOnboardingUserIds, getPendingRtConfirmationUserIds, getUserActiveMaps, getUserActiveMapsFull, isMapsUnreported } from "../ws/connections.js";
import { startSnipingTransaction } from "../transactions/sniping-orchestrator.js";
import { audit } from "../audit.js";
import { verboseLog, isMarketEnabled, getEffectiveRankId } from "../settings.js";
import { isDraining } from "../drain.js";

export function trySnipingMatch(target: SnipingTarget): void {
  if (!isMarketEnabled("sniping")) return;
  if (isDraining()) return;

  if (target.mouseGroupId != null) return matchGroup(target, "mouse");
  if (target.itemGroupId != null) return matchGroup(target, "item");
  if (target.itemTypeId != null) return matchIndividual(target, "item");
  return matchIndividual(target, "mouse");
}

/**
 * Iterate sell-buy pairs with all eligibility checks (online, AFK, busy,
 * sniper map conflicts, class-aware game maps). Calls onMatch for each
 * eligible pair. If onMatch returns true, stops iteration (match was created).
 */
function iterateEligiblePairs(
  target: SnipingTarget,
  label: string,
  tag: string,
  onMatch: (sell: SnipingOrderRow, buy: SnipingOrderRow) => boolean
): void {
  const onlineIds = getOnlineUserIds();
  if (onlineIds.size === 0) return;
  const afkIds = getAfkUserIds();
  const busyIds = getBusyBuyerIds();
  const invalidSettingsIds = getInvalidSettingsUserIds();
  const onboardingIds = getUnfinishedOnboardingUserIds();
  const rtConfirmIds = getPendingRtConfirmationUserIds();

  const activeSnipingMaps = new Map<number, Set<number>>();
  function getActiveMapIds(userId: number): Set<number> {
    let maps = activeSnipingMaps.get(userId);
    if (!maps) {
      maps = findActiveSnipingMapIds(userId);
      activeSnipingMaps.set(userId, maps);
    }
    return maps;
  }

  const sells = findOpenSellOrders(target);
  verboseLog("snipe-match", ` ${label}: ${sells.length} open sell(s), ${onlineIds.size} online`);

  for (const sell of sells) {
    if (!onlineIds.has(sell.user_id)) { verboseLog("snipe-match", `   ${tag}sell #${sell.id} skip: user ${sell.user_id} offline`); continue; }
    if (afkIds.has(sell.user_id)) { verboseLog("snipe-match", `   ${tag}sell #${sell.id} skip: user ${sell.user_id} AFK`); continue; }
    if (busyIds.has(sell.user_id)) { verboseLog("snipe-match", `   ${tag}sell #${sell.id} skip: user ${sell.user_id} busy`); continue; }
    if (invalidSettingsIds.has(sell.user_id)) { verboseLog("snipe-match", `   ${tag}sell #${sell.id} skip: user ${sell.user_id} invalid settings`); continue; }
    if (onboardingIds.has(sell.user_id)) { verboseLog("snipe-match", `   ${tag}sell #${sell.id} skip: user ${sell.user_id} onboarding incomplete`); continue; }
    if (rtConfirmIds.has(sell.user_id)) { verboseLog("snipe-match", `   ${tag}sell #${sell.id} skip: user ${sell.user_id} pending RT confirm`); continue; }

    const buys = findOpenBuyOrders(target, sell.price);
    verboseLog("snipe-match", `   ${tag}sell #${sell.id} (user ${sell.user_id}, ${sell.price} SB): ${buys.length} matching buy(s)`);

    for (const buy of buys) {
      // NOTE: we do NOT check busyIds for buyers – maptains are expected to be on their map.
      if (!onlineIds.has(buy.user_id)) { verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: user ${buy.user_id} offline`); continue; }
      if (afkIds.has(buy.user_id)) { verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: user ${buy.user_id} AFK`); continue; }
      if (invalidSettingsIds.has(buy.user_id)) { verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: user ${buy.user_id} invalid settings`); continue; }
      if (onboardingIds.has(buy.user_id)) { verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: user ${buy.user_id} onboarding incomplete`); continue; }
      if (rtConfirmIds.has(buy.user_id)) { verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: user ${buy.user_id} pending RT confirm`); continue; }
      if (buy.user_id === sell.user_id) { verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: self-trade`); continue; }
      if (!buy.mh_map_id) { verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: no map ID`); continue; }

      // Sniper busy check: if sniper has active sniping on a DIFFERENT map, skip.
      // If they're already on THIS map, they can take on more goals – allow match.
      const sniperMaps = getActiveMapIds(sell.user_id);
      if (sniperMaps.size > 0 && !sniperMaps.has(buy.mh_map_id)) {
        verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: sniper on different map(s) [${[...sniperMaps]}], need ${buy.mh_map_id}`);
        continue;
      }

      // Class-aware game active maps check: block sniper if on a game map of same class (different map ID)
      if (!isMapsUnreported(sell.user_id)) {
        const sniperGameMaps = getUserActiveMaps(sell.user_id);
        if (sniperGameMaps.size > 0) {
          if (!buy.map_class) {
            // NULL class → block if on any game map that isn't the target map
            if (!sniperGameMaps.has(buy.mh_map_id!)) {
              verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: sniper on game map(s), no map_class, need ${buy.mh_map_id}`);
              continue;
            }
          } else {
            // Known class: block if on a game map of SAME class, DIFFERENT map ID
            const sniperGameMapsFull = getUserActiveMapsFull(sell.user_id);
            let blocked = false;
            for (const [gameMapId, gameMapClass] of sniperGameMapsFull) {
              if (gameMapClass === buy.map_class && gameMapId !== buy.mh_map_id) {
                blocked = true;
                break;
              }
            }
            if (blocked) {
              verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: sniper on game map of same class ${buy.map_class}`);
              continue;
            }
          }
        }
      }

      // Rank check: if buy order's map has a min rank, sniper must meet it
      if (buy.min_rank_id != null) {
        const sniperRank = getEffectiveRankId(sell.user_id);
        if (sniperRank == null || sniperRank < buy.min_rank_id) {
          verboseLog("snipe-match", `     ${tag}buy #${buy.id} skip: sniper rank ${sniperRank ?? "NULL"} < required ${buy.min_rank_id}`);
          continue;
        }
      }

      if (onMatch(sell, buy)) return;
    }
  }
}

function addGoalToTransaction(
  goalType: "mouse" | "item",
  params: { transactionId: number; buyOrderId: number; sellOrderId: number; goalId: number; price: number }
): void {
  if (goalType === "mouse") {
    addSnipingTransactionMouse({
      transactionId: params.transactionId,
      buyOrderId: params.buyOrderId,
      sellOrderId: params.sellOrderId,
      mouseTypeId: params.goalId,
      price: params.price,
    });
  } else {
    addSnipingTransactionItem({
      transactionId: params.transactionId,
      buyOrderId: params.buyOrderId,
      sellOrderId: params.sellOrderId,
      itemTypeId: params.goalId,
      price: params.price,
    });
  }
}

function matchIndividual(target: SnipingTarget, goalType: "mouse" | "item"): void {
  const label = goalType === "mouse" ? `mouse ${target.mouseTypeId}` : `item ${target.itemTypeId}`;
  const tag = goalType === "item" ? "[item] " : "";

  iterateEligiblePairs(target, label, tag, (sell, buy) => {
    const matchedPairs = bundleMatchesForMap(sell.user_id, buy.user_id, buy.mh_map_id!, goalType);
    verboseLog("snipe-match", `     ${tag}buy #${buy.id} (user ${buy.user_id}, map ${buy.mh_map_id}): bundled ${matchedPairs.length} pair(s)`);
    if (matchedPairs.length === 0) return false;

    const sniperMH = findMHAccountByUserId(sell.user_id);
    const maptainMH = findMHAccountByUserId(buy.user_id);
    if (!sniperMH || !maptainMH) {
      verboseLog("snipe-match", `     ${tag}skip: missing MH account (sniper=${!!sniperMH}, maptain=${!!maptainMH})`);
      return false;
    }

    const totalPrice = matchedPairs.reduce((sum, p) => sum + p.sell.price, 0);
    const txn = getDb().transaction(() => {
      const row = createSnipingTransaction({
        sniperUserId: sell.user_id,
        maptainUserId: buy.user_id,
        goalType: sell.goal_type,
        mhMapId: buy.mh_map_id!,
        totalPrice,
        sniperMhSnUserId: sniperMH.mh_sn_user_id,
        maptainMhSnUserId: maptainMH.mh_sn_user_id,
      });

      for (const pair of matchedPairs) {
        const goalId = goalType === "mouse" ? pair.sell.mouse_type_id! : pair.sell.item_type_id!;
        addGoalToTransaction(goalType, {
          transactionId: row.id,
          buyOrderId: pair.buy.id,
          sellOrderId: pair.sell.id,
          goalId,
          price: pair.sell.price,
        });
        updateSnipingOrderStatus(pair.buy.id, "matched");
        updateSnipingOrderStatus(pair.sell.id, "matched");
      }

      return row;
    })();

    audit("sniping_order_matched", undefined, {
      transactionId: txn.id,
      sniperUserId: sell.user_id,
      maptainUserId: buy.user_id,
      mhMapId: buy.mh_map_id,
      goalCount: matchedPairs.length,
      totalPrice,
    });

    queueMicrotask(() => startSnipingTransaction(txn.id));
    return true;
  });
}

// Group matching: strict group-to-group, no bundling (one group order = one transaction).
function matchGroup(target: SnipingTarget, goalType: "mouse" | "item"): void {
  const groupId = goalType === "mouse" ? target.mouseGroupId! : target.itemGroupId!;
  const tag = goalType === "mouse" ? "[group] " : "[item-group] ";
  const label = goalType === "mouse" ? `group ${groupId}` : `item-group ${groupId}`;
  const memberTable = goalType === "mouse" ? "sniping_mouse_group_members" : "sniping_item_group_members";
  const memberCol = goalType === "mouse" ? "mouse_type_id" : "item_type_id";

  iterateEligiblePairs(target, label, tag, (sell, buy) => {
    const sniperMH = findMHAccountByUserId(sell.user_id);
    const maptainMH = findMHAccountByUserId(buy.user_id);
    if (!sniperMH || !maptainMH) {
      verboseLog("snipe-match", `     ${tag}skip: missing MH account (sniper=${!!sniperMH}, maptain=${!!maptainMH})`);
      return false;
    }

    const members = getDb()
      .prepare(`SELECT ${memberCol} as goal_id FROM ${memberTable} WHERE group_id = ?`)
      .all(groupId) as Array<{ goal_id: number }>;

    if (members.length === 0) {
      verboseLog("snipe-match", `     ${tag}skip: no members found for group ${groupId}`);
      return false;
    }

    const goalLabel = goalType === "mouse" ? "mice" : "items";
    verboseLog("snipe-match", `     ${tag}matched! sell #${sell.id} ↔ buy #${buy.id} (map ${buy.mh_map_id}, ${members.length} ${goalLabel}, ${sell.price} SB)`);

    const txn = getDb().transaction(() => {
      const row = createSnipingTransaction({
        sniperUserId: sell.user_id,
        maptainUserId: buy.user_id,
        goalType: sell.goal_type,
        mhMapId: buy.mh_map_id!,
        totalPrice: sell.price,
        sniperMhSnUserId: sniperMH.mh_sn_user_id,
        maptainMhSnUserId: maptainMH.mh_sn_user_id,
        ...(goalType === "mouse" ? { mouseGroupId: groupId } : { itemGroupId: groupId }),
      });

      for (const member of members) {
        addGoalToTransaction(goalType, {
          transactionId: row.id,
          buyOrderId: buy.id,
          sellOrderId: sell.id,
          goalId: member.goal_id,
          price: 0,
        });
      }

      updateSnipingOrderStatus(buy.id, "matched");
      updateSnipingOrderStatus(sell.id, "matched");

      return row;
    })();

    audit("sniping_order_matched", undefined, {
      transactionId: txn.id,
      sniperUserId: sell.user_id,
      maptainUserId: buy.user_id,
      mhMapId: buy.mh_map_id,
      groupId,
      goalCount: members.length,
      totalPrice: sell.price,
    });

    verboseLog("snipe-match", `     ${tag}txn #${txn.id} created, starting orchestration`);
    queueMicrotask(() => startSnipingTransaction(txn.id));
    return true;
  });
}

/**
 * Find all goals on a given map that can be matched between a sniper and maptain.
 * For each buy order on this map, looks for the cheapest matching sell order
 * from the sniper where sell.price <= buy.price.
 */
function bundleMatchesForMap(
  sniperUserId: number,
  maptainUserId: number,
  mhMapId: number,
  goalType: "mouse" | "item"
): Array<{ buy: SnipingOrderRow; sell: SnipingOrderRow }> {
  const db = getDb();
  const targetCol = goalType === "mouse" ? "mouse_type_id" : "item_type_id";

  const maptainBuys = db
    .prepare(
      `SELECT * FROM sniping_orders
       WHERE user_id = ? AND mh_map_id = ? AND side = 'sniper_buy' AND status = 'open'
         AND goal_type = ? AND is_demo = 0
       ORDER BY created_at ASC`
    )
    .all(maptainUserId, mhMapId, goalType) as SnipingOrderRow[];

  const matchedPairs: Array<{ buy: SnipingOrderRow; sell: SnipingOrderRow }> = [];
  const usedSellIds = new Set<number>();

  verboseLog("snipe-match", `  bundleMatchesForMap: sniper=${sniperUserId}, maptain=${maptainUserId}, map=${mhMapId}, goalType=${goalType}, ${maptainBuys.length} buy(s)`);

  for (const buy of maptainBuys) {
    const targetId = goalType === "mouse" ? buy.mouse_type_id : buy.item_type_id;
    const sell = db
      .prepare(
        `SELECT * FROM sniping_orders
         WHERE user_id = ? AND ${targetCol} = ? AND side = 'sniper_sell'
           AND status = 'open' AND price <= ? AND is_demo = 0
         ORDER BY price ASC, priority_at ASC
         LIMIT 1`
      )
      .get(sniperUserId, targetId, buy.price) as
      | SnipingOrderRow
      | undefined;

    if (sell && !usedSellIds.has(sell.id)) {
      verboseLog("snipe-match", `    buy #${buy.id} (${goalType} ${targetId}, ${buy.price} SB) ↔ sell #${sell.id} (${sell.price} SB) – matched`);
      matchedPairs.push({ buy, sell });
      usedSellIds.add(sell.id);
    } else {
      verboseLog("snipe-match", `    buy #${buy.id} (${goalType} ${targetId}, ${buy.price} SB) – no matching sell${sell ? ` (sell #${sell.id} already used)` : ""}`);
    }
  }

  return matchedPairs;
}
