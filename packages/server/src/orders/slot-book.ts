import type {
  SlotOrder,
  SlotOrderBookSnapshot,
  CreateSlotOrderPayload,
  CancelSlotOrderPayload,
  AdjustSlotOrderPayload,
  UserRole,
  MouseTier,
} from "@mhcm/shared";
import {
  createOrder as dbCreateOrder,
  cancelOrder as dbCancelOrder,
  adjustOrder as dbAdjustOrder,
  findOrderById,
  getSellOrderBookLevelsWithTiers,
  getBuyOrderBookLevelsWithAcceptedTiers,
  getActiveSellQuantityForMap,
  type OrderRow,
} from "../db/queries/slot-orders.js";
import { getMarketStatsCached } from "../db/queries/slot-transactions.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { findMapTypeById, getMapTypeGoal } from "../db/queries/map-types.js";
import { getTotalCommittedSb } from "../db/queries/sb-reservation.js";
import {
  resolveMouseTiers,
  calculateOrderTier,
} from "../db/queries/mouse-types.js";
import { resolveItemTiers } from "../db/queries/item-types.js";
import { sendToUser, broadcastToSubscribers } from "../ws/connections.js";
import { tryMatch } from "./slot-matcher.js";
import { audit } from "../audit.js";
import { getUsersNotifyingMapType } from "../db/queries/slot-notifications.js";
import { getEffectiveRankId } from "../settings.js";
import { deleteSlotRiskDecisionsForSellOrder } from "../db/queries/risk-decisions.js";

export function rowToOrder(row: OrderRow): SlotOrder {
  return {
    id: row.id,
    userId: row.user_id,
    mapTypeId: row.map_type_id,
    side: row.side,
    price: row.price,
    quantity: row.quantity,
    filledQuantity: row.filled_quantity,
    status: row.status,
    mhMapId: row.mh_map_id,
    tier: row.tier as SlotOrder["tier"],
    acceptedTiers: row.accepted_tiers ? JSON.parse(row.accepted_tiers) : null,
    rtPrice: row.rt_price ?? null,
    rtOnly: !!row.rt_only,
    isRt: !!row.is_rt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function handleCreateOrder(
  userId: number,
  payload: CreateSlotOrderPayload,
  role: UserRole = "user"
): void {
  // Validate map type exists and is enabled (admins bypass the enabled check)
  const mapType = findMapTypeById(payload.mapTypeId);
  if (!mapType) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Invalid map type", source: "create_order" },
    });
    return;
  }
  if (!mapType.enabled_slots && role !== "admin") {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Map type is not enabled", source: "create_order" },
    });
    return;
  }

  const mhAccount = findMHAccountByUserId(userId);
  if (!mhAccount?.verified_at) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "MH account not verified", source: "create_order" },
    });
    return;
  }

  // Rank check: buyer must meet map's minimum rank
  if (payload.side === "buy" && mapType.min_rank) {
    const userRank = getEffectiveRankId(userId);
    if (userRank == null || userRank < Number(mapType.min_rank)) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "Your rank does not meet the minimum requirement for this map type", source: "create_order" },
      });
      return;
    }
  }

  // Basic bounds validation (price 0 allowed for RT-only sell orders)
  if (payload.quantity <= 0 || (payload.price < 0) || (payload.price === 0 && !(payload.side === "sell" && payload.rtOnly))) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Price and quantity must be positive", source: "create_order" },
    });
    return;
  }

  if (payload.side === "sell" && !payload.mhMapId) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Sell orders require a map ID", source: "create_order" },
    });
    return;
  }

  // Validate sell quantity against map capacity (owner occupies 1 slot)
  const maxSellableSlots = mapType.max_hunters - 1;
  if (payload.side === "sell" && payload.quantity > maxSellableSlots) {
    sendToUser(userId, {
      type: "error",
      payload: {
        message: `Cannot sell more than ${maxSellableSlots} slot${maxSellableSlots !== 1 ? "s" : ""} for this map type`,
        source: "create_order",
      },
    });
    return;
  }

  // Prevent duplicate sell listings: total listed slots for this map must not exceed capacity
  if (payload.side === "sell" && payload.mhMapId) {
    const alreadyListed = getActiveSellQuantityForMap(payload.mhMapId);
    const remaining = maxSellableSlots - alreadyListed;
    if (remaining <= 0) {
      sendToUser(userId, {
        type: "error",
        payload: {
          message: "All sellable slots for this map are already listed",
          source: "create_order",
        },
      });
      return;
    }
    if (payload.quantity > remaining) {
      sendToUser(userId, {
        type: "error",
        payload: {
          message: `Only ${remaining} slot${remaining !== 1 ? "s" : ""} remaining to list for this map`,
          source: "create_order",
        },
      });
      return;
    }
  }

  // Calculate tier for sell orders based on remaining goals (mice or items)
  let tier: MouseTier | null = null;
  if (payload.side === "sell" && payload.remainingGoals && payload.remainingGoals.length > 0) {
    const goalIds = payload.remainingGoals.map((g) => g.uniqueId);
    const goalType = getMapTypeGoal(payload.mapTypeId);
    const tierMap = goalType === "item"
      ? resolveItemTiers(goalIds, payload.mapTypeId)
      : resolveMouseTiers(goalIds, payload.mapTypeId);
    const tiers = goalIds.map((id) => tierMap.get(id) ?? "B");
    tier = calculateOrderTier(tiers);
  }

  const acceptedTiers = payload.side === "buy" && payload.acceptedTiers
    ? JSON.stringify(payload.acceptedTiers)
    : null;

  if (payload.side === "buy" && typeof payload.sbBalance === "number") {
    const committedSb = getTotalCommittedSb(userId);
    const orderCost = payload.price * payload.quantity;
    const availableSb = payload.sbBalance - committedSb;
    if (orderCost > availableSb) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "Insufficient SB balance for this order", source: "create_order" },
      });
      return;
    }
  }

  // Serialize remaining goals for sell orders (used by risk check system)
  const remainingGoals =
    payload.side === "sell" && payload.remainingGoals && payload.remainingGoals.length > 0
      ? JSON.stringify(payload.remainingGoals)
      : null;

  const supportsRt = !!mapType.supports_rt;
  let rtPrice: number | null = null;
  let rtOnly = 0;
  let isRt = 0;

  if (payload.side === "sell") {
    if (payload.rtPrice != null) {
      if (!supportsRt) {
        sendToUser(userId, {
          type: "error",
          payload: { message: "This map type does not support Return Tradables", source: "create_order" },
        });
        return;
      }
      if (payload.rtPrice <= 0) {
        sendToUser(userId, {
          type: "error",
          payload: { message: "RT price must be positive", source: "create_order" },
        });
        return;
      }
      rtPrice = payload.rtPrice;
    }
    if (payload.rtOnly) {
      if (!supportsRt || rtPrice == null) {
        sendToUser(userId, {
          type: "error",
          payload: { message: "RT-only orders require an RT price on a supported map type", source: "create_order" },
        });
        return;
      }
      rtOnly = 1;
    }
  } else if (payload.side === "buy" && payload.isRt) {
    if (!supportsRt) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "This map type does not support Return Tradables", source: "create_order" },
      });
      return;
    }
    isRt = 1;
  }

  const row = dbCreateOrder({
    userId,
    mapTypeId: payload.mapTypeId,
    side: payload.side,
    price: payload.price,
    quantity: payload.quantity,
    mhMapId: payload.mhMapId ?? null,
    tier,
    acceptedTiers,
    remainingGoals,
    rtPrice,
    rtOnly,
    isRt,
  });

  const order = rowToOrder(row);
  audit("order_created", userId, {
    orderId: order.id,
    mapTypeId: order.mapTypeId,
    side: order.side,
    price: order.price,
    quantity: order.quantity,
    tier: order.tier,
  });
  sendToUser(userId, { type: "order_created", payload: { order } });

  if (payload.side === "buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  if (payload.side === "sell" && mapType) {
    const subscribers = getUsersNotifyingMapType(payload.mapTypeId);
    for (const subUserId of subscribers) {
      if (subUserId !== userId) {
        sendToUser(subUserId, {
          type: "new_sell_order",
          payload: {
            mapTypeId: payload.mapTypeId,
            mapName: mapType.display_name,
            price: payload.price,
            quantity: payload.quantity,
            tier,
          },
        });
      }
    }
  }

  tryMatch(payload.mapTypeId);
  broadcastOrderBook(payload.mapTypeId);
}

export function handleCancelOrder(
  userId: number,
  payload: CancelSlotOrderPayload
): void {
  const success = dbCancelOrder(payload.orderId, userId);
  if (!success) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Cannot cancel order", source: "cancel_order" },
    });
    return;
  }

  const cancelledOrder = findOrderById(payload.orderId);

  if (cancelledOrder && cancelledOrder.side === "sell") {
    deleteSlotRiskDecisionsForSellOrder(payload.orderId);
  }

  audit("order_cancelled", userId, { orderId: payload.orderId });
  sendToUser(userId, {
    type: "order_cancelled",
    payload: { orderId: payload.orderId },
  });

  if (cancelledOrder && cancelledOrder.side === "buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  if (cancelledOrder) broadcastOrderBook(cancelledOrder.map_type_id);
}

export function handleAdjustOrder(
  userId: number,
  payload: AdjustSlotOrderPayload
): void {
  const existing = findOrderById(payload.orderId);
  if (!existing || existing.user_id !== userId) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Order not found", source: "adjust_order" },
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
          payload: { message: "Insufficient SB for this adjustment", source: "adjust_order" },
        });
        return;
      }
    }
  }

  // Price direction rules for partially filled orders:
  // - Sell orders can only LOWER price (raising would be unfair to future buyers)
  // - Buy orders can only RAISE price (lowering would be unfair to sellers who already sold)
  if (existing.filled_quantity > 0 && payload.price !== undefined) {
    if (existing.side === "sell" && payload.price > existing.price) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "Cannot raise price on partially filled sell order", source: "adjust_order" },
      });
      return;
    }
    if (existing.side === "buy" && payload.price < existing.price) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "Cannot lower price on partially filled buy order", source: "adjust_order" },
      });
      return;
    }
  }

  const row = dbAdjustOrder(
    payload.orderId,
    userId,
    payload.price,
    payload.quantity
  );
  if (!row) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Cannot adjust order", source: "adjust_order" },
    });
    return;
  }

  const order = rowToOrder(row);
  audit("order_adjusted", userId, {
    orderId: order.id,
    price: order.price,
    quantity: order.quantity,
  });
  sendToUser(userId, { type: "order_adjusted", payload: { order } });

  if (existing.side === "buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  tryMatch(order.mapTypeId);
  broadcastOrderBook(order.mapTypeId);
}

export function getOrderBookSnapshot(
  mapTypeId: number
): SlotOrderBookSnapshot {
  const sells = getSellOrderBookLevelsWithTiers(mapTypeId).map((r) => ({
    price: r.price,
    quantity: r.quantity,
    orderCount: r.order_count,
    tierBreakdown: {
      S: r.tier_s,
      A: r.tier_a,
      B: r.tier_b,
      none: r.tier_none,
    },
    rtQty: r.rt_qty,
  }));

  const buys = getBuyOrderBookLevelsWithAcceptedTiers(mapTypeId).map((r) => ({
    price: r.price,
    quantity: r.quantity,
    orderCount: r.order_count,
    acceptedTiersBreakdown: {
      S: r.accepts_s,
      A: r.accepts_a,
      B: r.accepts_b,
      all: r.accepts_all,
    },
    rtQty: r.rt_qty,
  }));

  const stats = getMarketStatsCached(mapTypeId);
  return { mapTypeId, sells, buys, stats };
}

export function broadcastOrderBook(mapTypeId: number): void {
  const snapshot = getOrderBookSnapshot(mapTypeId);
  broadcastToSubscribers(mapTypeId, {
    type: "order_book_snapshot",
    payload: snapshot,
  });
}
