import type {
  MapOrder,
  MapOrderBookSnapshot,
  CreateMapOrderPayload,
  CancelMapOrderPayload,
  AdjustMapOrderPayload,
  MapOrderMode,
} from "@mhcm/shared";
import {
  createMapOrder as dbCreateMapOrder,
  cancelMapOrder as dbCancelMapOrder,
  adjustMapOrder as dbAdjustMapOrder,
  findMapOrderById,
  getMapOrderBookLevels,
  getMapSellOrderBookLevelsWithTiers,
  type MapOrderRow,
} from "../db/queries/map-orders.js";
import { getMapMarketStatsCached } from "../db/queries/map-transactions.js";
import { findMapTypeById, getMapTypeGoal } from "../db/queries/map-types.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { getTotalCommittedSb } from "../db/queries/sb-reservation.js";
import { sendToUser, broadcastToMapSubscribers } from "../ws/connections.js";
import { getUsersNotifyingMapType } from "../db/queries/map-notifications.js";
import { matchMapOrders } from "./map-matcher.js";
import { audit } from "../audit.js";
import {
  resolveMouseTiers,
  calculateOrderTier,
  findMouseTypeByType,
} from "../db/queries/mouse-types.js";
import { resolveItemTiers, findItemTypeByType } from "../db/queries/item-types.js";
import { getDb } from "../db/connection.js";
import { getEffectiveRankId } from "../settings.js";
import { deleteMapRiskDecisionsForSellOrder } from "../db/queries/risk-decisions.js";

export function rowToMapOrder(
  row: MapOrderRow,
  mapName: string,
  mapThumbnail: string | null
): MapOrder {
  return {
    id: row.id,
    userId: row.user_id,
    mapTypeId: row.map_type_id,
    mode: row.mode,
    side: row.side,
    price: row.price,
    quantity: row.quantity,
    filledQuantity: row.filled_quantity,
    status: row.status,
    closeReason: row.close_reason,
    mhMapId: row.mh_map_id,
    tier: row.tier,
    acceptedTiers: row.accepted_tiers ? JSON.parse(row.accepted_tiers) : null,
    priorityAt: row.priority_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mapDisplayName: mapName,
    mapThumbnail,
  };
}

export function handleCreateMapOrder(
  userId: number,
  payload: CreateMapOrderPayload
): void {
  const mapType = findMapTypeById(payload.mapTypeId);
  if (!mapType) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Invalid map type", source: "create_map_order" },
    });
    return;
  }
  const enabledCol = payload.mode === "unopened" ? mapType.enabled_unopened : mapType.enabled_complete;
  if (!enabledCol) {
    sendToUser(userId, {
      type: "error",
      payload: {
        message: "Map type is not enabled for trading",
        source: "create_map_order",
      },
    });
    return;
  }

  const mhAccount = findMHAccountByUserId(userId);
  if (!mhAccount?.verified_at) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "MH account not verified", source: "create_map_order" },
    });
    return;
  }

  // Rank check: buyer must meet map's minimum rank
  if (payload.side === "buy" && mapType.min_rank) {
    const userRank = getEffectiveRankId(userId);
    if (userRank == null || userRank < Number(mapType.min_rank)) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "Your rank does not meet the minimum requirement for this map type", source: "create_map_order" },
      });
      return;
    }
  }

  if (payload.quantity <= 0 || payload.price <= 0) {
    sendToUser(userId, {
      type: "error",
      payload: {
        message: "Price and quantity must be positive",
        source: "create_map_order",
      },
    });
    return;
  }

  if (payload.mode === "unopened" && payload.side === "sell") {
    if (!mapType.scroll_item_type) {
      sendToUser(userId, {
        type: "error",
        payload: {
          message: "Map type does not have a scroll item type configured",
          source: "create_map_order",
        },
      });
      return;
    }
    const RANK_KEYWORDS = ["Easy", "Medium", "Hard", "Elaborate", "Arduous", "Elite"];
    const hasRankKeyword = RANK_KEYWORDS.some(kw => mapType.display_name.includes(kw));
    if (hasRankKeyword && !mapType.min_rank) {
      sendToUser(userId, {
        type: "error",
        payload: {
          message: "Map type min rank not configured",
          source: "create_map_order",
        },
      });
      return;
    }
    // Rank check: unopened seller must meet rank to open the scroll
    if (mapType.min_rank) {
      const userRank = getEffectiveRankId(userId);
      if (userRank == null || userRank < Number(mapType.min_rank)) {
        sendToUser(userId, {
          type: "error",
          payload: { message: "Your rank does not meet the minimum requirement for this map type", source: "create_map_order" },
        });
        return;
      }
    }
  }

  let tier: "S" | "A" | "B" | null = null;
  if (payload.mode === "completed" && payload.side === "sell") {
    if (payload.quantity !== 1) {
      sendToUser(userId, {
        type: "error",
        payload: {
          message: "Completed maps must have quantity = 1",
          source: "create_map_order",
        },
      });
      return;
    }
    if (!payload.mhMapId) {
      sendToUser(userId, {
        type: "error",
        payload: {
          message: "Completed maps must provide mhMapId",
          source: "create_map_order",
        },
      });
      return;
    }
    // Validate LM/LL condition: remaining goals must be 1-lastGoalCount
    if (!payload.remainingGoals || payload.remainingGoals.length === 0) {
      sendToUser(userId, {
        type: "error",
        payload: {
          message: "Remaining goals data required for completed map sells",
          source: "create_map_order",
        },
      });
      return;
    }
    const lastGoalCount = mapType.last_goal_count ?? 1;
    if (payload.remainingGoals.length > lastGoalCount) {
      sendToUser(userId, {
        type: "error",
        payload: {
          message: `Map does not meet LM/LL condition (${payload.remainingGoals.length} goals remaining, ${lastGoalCount === 1 ? "need 1" : `need 1-${lastGoalCount}`})`,
          source: "create_map_order",
        },
      });
      return;
    }
    // Calculate tier from remaining goals (mice or items)
    if (payload.remainingGoals.length > 0) {
      const goalType = getMapTypeGoal(payload.mapTypeId);
      const findGoalByType = goalType === "item" ? findItemTypeByType : findMouseTypeByType;
      const goalTypeIds = payload.remainingGoals
        .map((g) => findGoalByType(g.type)?.id)
        .filter((id): id is number => id !== undefined);

      if (goalTypeIds.length > 0) {
        const tierMap = goalType === "item"
          ? resolveItemTiers(goalTypeIds, payload.mapTypeId)
          : resolveMouseTiers(goalTypeIds, payload.mapTypeId);
        const tiers = goalTypeIds.map((id) => tierMap.get(id) ?? "B");
        tier = calculateOrderTier(tiers);
      }
    }
  }

  if (payload.side === "buy" && typeof payload.sbBalance === "number") {
    const committedSb = getTotalCommittedSb(userId);
    const orderCost = payload.price * payload.quantity;
    const availableSb = payload.sbBalance - committedSb;
    if (orderCost > availableSb) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "Insufficient SB balance for this order", source: "create_map_order" },
      });
      return;
    }
  }

  const acceptedTiers =
    payload.side === "buy" && payload.acceptedTiers
      ? JSON.stringify(payload.acceptedTiers)
      : null;

  // Serialize remaining goals for completed sell orders (used by risk check system)
  const remainingGoals =
    payload.mode === "completed" && payload.side === "sell" && payload.remainingGoals && payload.remainingGoals.length > 0
      ? JSON.stringify(payload.remainingGoals)
      : undefined;

  const row = dbCreateMapOrder({
    userId,
    mapTypeId: payload.mapTypeId,
    mode: payload.mode,
    side: payload.side,
    price: payload.price,
    quantity: payload.quantity,
    mhMapId: payload.mhMapId ?? undefined,
    tier: tier ?? undefined,
    acceptedTiers: acceptedTiers ?? undefined,
    remainingGoals,
  });

  const order = rowToMapOrder(row, mapType.display_name, mapType.thumbnail);
  audit("map_order_created", userId, {
    orderId: order.id,
    mapTypeId: order.mapTypeId,
    mode: order.mode,
    side: order.side,
    price: order.price,
    quantity: order.quantity,
  });
  sendToUser(userId, { type: "map_order_created", payload: { order } });

  if (payload.side === "buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  if (payload.side === "sell") {
    const subscribers = getUsersNotifyingMapType(payload.mapTypeId, payload.mode);
    for (const subUserId of subscribers) {
      if (subUserId !== userId) {
        sendToUser(subUserId, {
          type: "new_map_sell_order",
          payload: {
            mapName: mapType.display_name,
            mode: payload.mode,
            price: payload.price,
          },
        });
      }
    }
  }

  matchMapOrders(payload.mapTypeId, payload.mode);
  broadcastMapOrderBook(payload.mapTypeId, payload.mode);
}

export function handleCancelMapOrder(
  userId: number,
  payload: CancelMapOrderPayload
): void {
  const existing = findMapOrderById(payload.orderId);
  if (!existing || existing.user_id !== userId) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Order not found", source: "cancel_map_order" },
    });
    return;
  }

  // CRITICAL: Check for active transactions before cancelling
  const activeTransaction = getDb()
    .prepare(
      `SELECT id FROM map_transactions
       WHERE (sell_order_id = ? OR buy_order_id = ?)
         AND state NOT IN ('completed', 'failed')`
    )
    .get(payload.orderId, payload.orderId);

  if (activeTransaction) {
    sendToUser(userId, {
      type: "error",
      payload: {
        message: "Cannot cancel order during active transaction",
        source: "cancel_map_order",
      },
    });
    return;
  }

  const success = dbCancelMapOrder(payload.orderId, userId);
  if (!success) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Cannot cancel order", source: "cancel_map_order" },
    });
    return;
  }

  if (existing.side === "sell") {
    deleteMapRiskDecisionsForSellOrder(payload.orderId);
  }

  audit("map_order_cancelled", userId, { orderId: payload.orderId });
  sendToUser(userId, {
    type: "map_order_cancelled",
    payload: { orderId: payload.orderId },
  });

  if (existing.side === "buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  broadcastMapOrderBook(existing.map_type_id, existing.mode);
}

export function handleAdjustMapOrder(
  userId: number,
  payload: AdjustMapOrderPayload
): void {
  const existing = findMapOrderById(payload.orderId);
  if (!existing || existing.user_id !== userId) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Order not found", source: "adjust_map_order" },
    });
    return;
  }

  if (existing.side === "buy" && typeof payload.sbBalance === "number") {
    const oldRemaining = existing.quantity - existing.filled_quantity;
    const oldCost = existing.price * oldRemaining;
    const newPrice = payload.price ?? existing.price;
    const newQuantity = payload.quantity ?? existing.quantity;
    const newCost = newPrice * (newQuantity - existing.filled_quantity);
    const delta = newCost - oldCost;
    if (delta > 0) {
      const committedSb = getTotalCommittedSb(userId);
      const availableSb = payload.sbBalance - committedSb;
      if (delta > availableSb) {
        sendToUser(userId, {
          type: "error",
          payload: { message: "Insufficient SB for this adjustment", source: "adjust_map_order" },
        });
        return;
      }
    }
  }

  // Price direction rules for partially filled orders
  if (existing.filled_quantity > 0 && payload.price !== undefined) {
    if (existing.side === "sell" && payload.price > existing.price) {
      sendToUser(userId, {
        type: "error",
        payload: {
          message: "Cannot raise price on partially filled sell order",
          source: "adjust_map_order",
        },
      });
      return;
    }
    if (existing.side === "buy" && payload.price < existing.price) {
      sendToUser(userId, {
        type: "error",
        payload: {
          message: "Cannot lower price on partially filled buy order",
          source: "adjust_map_order",
        },
      });
      return;
    }
  }

  const row = dbAdjustMapOrder(
    payload.orderId,
    userId,
    payload.price,
    payload.quantity
  );
  if (!row) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Cannot adjust order", source: "adjust_map_order" },
    });
    return;
  }

  const mapType = findMapTypeById(row.map_type_id);
  const order = rowToMapOrder(
    row,
    mapType?.display_name ?? "",
    mapType?.thumbnail ?? null
  );
  audit("map_order_adjusted", userId, {
    orderId: order.id,
    price: order.price,
    quantity: order.quantity,
  });
  sendToUser(userId, { type: "map_order_adjusted", payload: { order } });

  if (existing.side === "buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  matchMapOrders(order.mapTypeId, order.mode);
  broadcastMapOrderBook(order.mapTypeId, order.mode);
}

export function getMapOrderBookSnapshot(
  mapTypeId: number,
  mode: MapOrderMode
): MapOrderBookSnapshot {
  let sells;
  if (mode === "completed") {
    sells = getMapSellOrderBookLevelsWithTiers(mapTypeId, mode).map((r) => ({
      price: r.price,
      totalQuantity: r.total_quantity,
      orderCount: r.order_count,
      tierS: r.tier_s,
      tierA: r.tier_a,
      tierB: r.tier_b,
    }));
  } else {
    sells = getMapOrderBookLevels(mapTypeId, mode, "sell").map((r) => ({
      price: r.price,
      totalQuantity: r.total_quantity,
      orderCount: r.order_count,
    }));
  }

  const buys = getMapOrderBookLevels(mapTypeId, mode, "buy").map((r) => ({
    price: r.price,
    totalQuantity: r.total_quantity,
    orderCount: r.order_count,
  }));

  const rawStats = getMapMarketStatsCached(mapTypeId, mode);
  const stats = {
    priceHistory: rawStats.priceHistory,
    sales: rawStats.sales,
  };

  return { mapTypeId, mode, sells, buys, stats };
}

export function broadcastMapOrderBook(
  mapTypeId: number,
  mode: MapOrderMode
): void {
  const snapshot = getMapOrderBookSnapshot(mapTypeId, mode);
  broadcastToMapSubscribers(mapTypeId, mode, {
    type: "map_order_book_snapshot",
    payload: snapshot,
  });
}
