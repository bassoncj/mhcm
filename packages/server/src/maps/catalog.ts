import type { MHMapClass, MapMarket } from "@mhcm/shared";
import type { DiscoveredMapType, GoalType, LastGoalCount, MapType, MapTypeStats } from "@mhcm/shared";
import {
  findMapTypes,
  findMapTypeByNameQualityGoal,
  findMapTypeByRewardTypeAndGoal,
  insertDiscoveredMapType,
  updateMapTypeDisplayName,
  setMapTypeClass,
  setMapTypeMinRank,
  type MapTypeRow,
  type MapTypeFilter,
} from "../db/queries/map-types.js";
import { findRankById, findRankByTitleName } from "../db/queries/ranks.js";
import { getActivityCountsByMapType, cancelOpenSlotOrdersForMapType } from "../db/queries/slot-orders.js";
import { cancelOpenMapOrdersForMarket } from "../db/queries/map-orders.js";
import { getTotalCommittedSb } from "../db/queries/sb-reservation.js";
import { deleteSlotRiskDecisionsForSellOrder } from "../db/queries/risk-decisions.js";
import { deleteMapRiskDecisionsForSellOrder } from "../db/queries/risk-decisions.js";
import { sendToUser } from "../ws/connections.js";
import { broadcastOrderBook } from "../orders/slot-book.js";
import { broadcastMapOrderBook } from "../orders/map-book.js";
import { audit } from "../audit.js";
import { getAvgPriceByMapType } from "../db/queries/slot-transactions.js";
import { broadcastPerUser } from "../ws/connections.js";

/** Strip "Rare " prefix from map name since quality is tracked separately. */
function normalizeMapName(name: string): string {
  return name.replace(/^Rare /, "");
}

function rowToMapType(row: MapTypeRow): MapType {
  return {
    id: row.id,
    mapType: row.map_type,
    quality: row.quality as "common" | "rare",
    goal: row.goal as GoalType,
    displayName: row.display_name,
    thumbnail: row.thumbnail ?? null,
    alias: row.alias ?? null,
    maxHunters: row.max_hunters,
    lastGoalCount: (row.last_goal_count ?? 1) as LastGoalCount,
    enabledSlots: row.enabled_slots === 1,
    enabledUnopened: row.enabled_unopened === 1,
    enabledComplete: row.enabled_complete === 1,
    scrollItemType: row.scroll_item_type ?? null,
    minRank: row.min_rank ? Number(row.min_rank) : null,
    minRankName: row.min_rank ? (findRankById(Number(row.min_rank))?.name ?? null) : null,
    mapClass: (row.map_class as MHMapClass) ?? null,
    supportsRt: !!row.supports_rt,
  };
}

/**
 * Handle map types reported by an extension.
 *
 * Discovery flow per reported type:
 * 1. Match by name (display_name or alias) + quality -> already known, done.
 * 2. Match by reward type (map_type column) -> seeded map first discovered.
 *    Update display_name so future name matches work. Done.
 * 3. No match -> completely new map. Insert with rewardType/name/thumbnail, enabled.
 */
export function handleReportMapTypes(
  mapTypes: DiscoveredMapType[]
): void {
  let changed = false;

  function autoLearnMinRank(row: MapTypeRow, mt: DiscoveredMapType): void {
    if (row.min_rank || !mt.minTitleName) return;
    const rank = findRankByTitleName(mt.minTitleName);
    if (rank) {
      setMapTypeMinRank(row.id, rank.id);
      console.log(`[catalog] auto-learned min_rank="${rank.name}" (id=${rank.id}) for "${row.display_name}" (id=${row.id})`);
      changed = true;
    }
  }

  for (const mt of mapTypes) {
    const cleanName = normalizeMapName(mt.name);
    const goal: GoalType = mt.isScavengerHunt ? "item" : "mouse";

    const byName = findMapTypeByNameQualityGoal(cleanName, mt.quality, goal);
    if (byName) {
      if (!byName.map_class && mt.mapClass) {
        setMapTypeClass(byName.id, mt.mapClass);
        console.log(`[catalog] auto-learned map_class=${mt.mapClass} for "${byName.display_name}" (id=${byName.id})`);
        changed = true;
      }
      autoLearnMinRank(byName, mt);
      continue;
    }

    if (mt.rewardType) {
      const byReward = findMapTypeByRewardTypeAndGoal(mt.rewardType, goal);
      if (byReward) {
        if (byReward.display_name !== cleanName) {
          updateMapTypeDisplayName(byReward.id, cleanName);
          console.log(`[catalog] updated display name: "${byReward.display_name}" -> "${cleanName}"`);
          changed = true;
        }
        if (!byReward.map_class && mt.mapClass) {
          setMapTypeClass(byReward.id, mt.mapClass);
          console.log(`[catalog] auto-learned map_class=${mt.mapClass} for "${byReward.display_name}" (id=${byReward.id})`);
          changed = true;
        }
        autoLearnMinRank(byReward, mt);
        continue;
      }
    }

    if (mt.rewardType) {
      const row = insertDiscoveredMapType({
        mapType: mt.rewardType,
        quality: mt.quality,
        goal,
        displayName: cleanName,
        thumbnail: mt.thumbnail ?? null,
        maxHunters: mt.maxHunters ?? 5,
        mapClass: mt.mapClass,
      });
      autoLearnMinRank(row, mt);
      console.log(`[catalog] discovered new map type: ${row.map_type} goal=${goal} (id=${row.id})`);
      changed = true;
    } else {
      console.log(`[catalog] unknown map "${cleanName}" (${mt.quality}) -- no rewardType, skipping`);
    }
  }

  if (changed) {
    broadcastMapTypes();
  }
}

export function getMapTypes(filter: MapTypeFilter = "every"): MapType[] {
  return findMapTypes(filter).map(rowToMapType);
}

// Day-keyed cache for avg prices (bounded to end-of-previous-day, static all day)
let avgPriceCacheDate: string | null = null;
let avgPriceCache: Record<string, number> = {};

export function computeMapTypeStats(): Record<string, MapTypeStats> {
  const activity = getActivityCountsByMapType();

  const today = new Date().toISOString().slice(0, 10);
  if (avgPriceCacheDate !== today) {
    avgPriceCache = getAvgPriceByMapType();
    avgPriceCacheDate = today;
  }

  const allIds = new Set([...Object.keys(activity), ...Object.keys(avgPriceCache)]);
  const stats: Record<string, MapTypeStats> = {};
  for (const id of allIds) {
    stats[id] = {
      activity: activity[id] ?? 0,
      avgPrice: avgPriceCache[id] ?? null,
    };
  }
  return stats;
}

export function invalidateAvgPriceCache(): void {
  avgPriceCacheDate = null;
  avgPriceCache = {};
}

/**
 * Cancel all open orders for a map type when a market is disabled.
 * Handles SB recalculation, risk decision cleanup, and user notification.
 */
export function cancelOrdersForDisabledMarket(
  mapTypeId: number,
  market: MapMarket,
  mapDisplayName: string,
): void {
  if (market === "slots") {
    const cancelled = cancelOpenSlotOrdersForMapType(mapTypeId);
    const affectedBuyers = new Set<number>();
    for (const order of cancelled) {
      audit("order_cancelled", order.user_id, { orderId: order.id, reason: "market_disabled" });
      sendToUser(order.user_id, { type: "order_cancelled", payload: { orderId: order.id } });
      if (order.side === "sell") deleteSlotRiskDecisionsForSellOrder(order.id);
      if (order.side === "buy") affectedBuyers.add(order.user_id);
    }
    for (const buyerId of affectedBuyers) {
      const committed = getTotalCommittedSb(buyerId);
      sendToUser(buyerId, { type: "available_sb", payload: { totalSb: null, committedSb: committed, availableSb: null } });
    }
    broadcastOrderBook(mapTypeId);
    const affectedUsers = new Set(cancelled.map((o) => o.user_id));
    for (const uid of affectedUsers) {
      sendToUser(uid, {
        type: "market_disabled_notice",
        payload: { message: `${mapDisplayName} has been disabled for the slots market. Your orders have been cancelled.` },
      });
    }
  } else {
    const mode = market === "unopened" ? "unopened" : "completed";
    const reason = `${mapDisplayName} disabled for ${market} market`;
    const cancelled = cancelOpenMapOrdersForMarket(mapTypeId, mode, reason);
    const affectedBuyers = new Set<number>();
    for (const order of cancelled) {
      audit("map_order_cancelled", order.user_id, { orderId: order.id, reason: "market_disabled" });
      sendToUser(order.user_id, { type: "map_order_cancelled", payload: { orderId: order.id } });
      if (order.side === "sell") deleteMapRiskDecisionsForSellOrder(order.id);
      if (order.side === "buy") affectedBuyers.add(order.user_id);
    }
    for (const buyerId of affectedBuyers) {
      const committed = getTotalCommittedSb(buyerId);
      sendToUser(buyerId, { type: "available_sb", payload: { totalSb: null, committedSb: committed, availableSb: null } });
    }
    broadcastMapOrderBook(mapTypeId, mode);
    const affectedUsers = new Set(cancelled.map((o) => o.user_id));
    for (const uid of affectedUsers) {
      sendToUser(uid, {
        type: "market_disabled_notice",
        payload: { message: `${mapDisplayName} has been disabled for the ${market} market. Your orders have been cancelled.` },
      });
    }
  }
}

/**
 * Broadcast map types to all connected clients.
 * Admins receive all types (including disabled); regular users only get enabled.
 */
export function broadcastMapTypes(): void {
  const enabledTypes = getMapTypes("enabled");
  const allTypes = getMapTypes("every");
  const stats = computeMapTypeStats();

  broadcastPerUser((user) => ({
    type: "map_types",
    payload: {
      mapTypes: user.role === "admin" ? allTypes : enabledTypes,
      stats,
    },
  }));
}
