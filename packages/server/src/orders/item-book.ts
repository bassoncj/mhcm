import type {
  ItemOrder,
  ItemOrderBookSnapshot,
  CreateItemOrderPayload,
  CancelItemOrderPayload,
  AdjustItemOrderPayload,
} from "@mhcm/shared";
import { getItemMoq, itemSbTotal } from "@mhcm/shared";
import {
  createItemOrder as dbCreateItemOrder,
  cancelItemOrder as dbCancelItemOrder,
  adjustItemOrder as dbAdjustItemOrder,
  findItemOrderById,
  getItemOrderBookLevels,
  type ItemOrderRow,
} from "../db/queries/item-orders.js";
import { getItemMarketStatsCached } from "../db/queries/item-transactions.js";
import { findItemTypeById } from "../db/queries/item-types.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { getTotalCommittedSb } from "../db/queries/sb-reservation.js";
import { sendToUser, broadcastToItemSubscribers } from "../ws/connections.js";
import { getUsersNotifyingItemType } from "../db/queries/item-notifications.js";
import { matchItemOrders } from "./item-matcher.js";
import { audit } from "../audit.js";

export function rowToItemOrder(row: ItemOrderRow, itemName: string, itemThumbnail: string | null): ItemOrder {
  return {
    id: row.id,
    userId: row.user_id,
    itemTypeId: row.item_type_id,
    itemName,
    itemThumbnail,
    side: row.side,
    price: row.price,
    quantity: row.quantity,
    filledQuantity: row.filled_quantity,
    status: row.status,
    closeReason: row.close_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function handleCreateItemOrder(
  userId: number,
  payload: CreateItemOrderPayload
): void {
  const itemType = findItemTypeById(payload.itemTypeId);
  if (!itemType) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Invalid item type", source: "create_item_order" },
    });
    return;
  }
  if (!itemType.enabled) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Item type is not enabled for trading", source: "create_item_order" },
    });
    return;
  }

  const mhAccount = findMHAccountByUserId(userId);
  if (!mhAccount?.verified_at) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "MH account not verified", source: "create_item_order" },
    });
    return;
  }

  if (payload.quantity <= 0 || payload.price <= 0) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Price and quantity must be positive", source: "create_item_order" },
    });
    return;
  }

  if (payload.price < 0.1 || Math.round(payload.price * 10) / 10 !== payload.price) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Price must be in 0.1 SB increments (minimum 0.1)", source: "create_item_order" },
    });
    return;
  }

  const moq = getItemMoq(payload.price);
  if (payload.quantity % moq !== 0) {
    sendToUser(userId, {
      type: "error",
      payload: { message: `Quantity must be a multiple of ${moq} at this price`, source: "create_item_order" },
    });
    return;
  }

  if (payload.side === "buy" && typeof payload.sbBalance === "number") {
    const committedSb = getTotalCommittedSb(userId);
    const orderCost = itemSbTotal(payload.price, payload.quantity);
    const availableSb = payload.sbBalance - committedSb;
    if (orderCost > availableSb) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "Insufficient SB balance for this order", source: "create_item_order" },
      });
      return;
    }
  }

  const row = dbCreateItemOrder({
    userId,
    itemTypeId: payload.itemTypeId,
    side: payload.side,
    price: payload.price,
    quantity: payload.quantity,
  });

  const order = rowToItemOrder(row, itemType.name, itemType.thumbnail);
  audit("item_order_created", userId, {
    orderId: order.id,
    itemTypeId: order.itemTypeId,
    side: order.side,
    price: order.price,
    quantity: order.quantity,
  });
  sendToUser(userId, { type: "item_order_created", payload: { order } });

  if (payload.side === "buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  if (payload.side === "sell") {
    const subscribers = getUsersNotifyingItemType(payload.itemTypeId);
    for (const subUserId of subscribers) {
      if (subUserId !== userId) {
        sendToUser(subUserId, {
          type: "new_item_sell_order",
          payload: {
            itemTypeId: payload.itemTypeId,
            itemName: itemType.name,
            price: payload.price,
            quantity: payload.quantity,
          },
        });
      }
    }
  }

  matchItemOrders(payload.itemTypeId);
  broadcastItemOrderBook(payload.itemTypeId);
}

export function handleCancelItemOrder(
  userId: number,
  payload: CancelItemOrderPayload
): void {
  const existing = findItemOrderById(payload.orderId);
  if (!existing || existing.user_id !== userId) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Order not found", source: "cancel_item_order" },
    });
    return;
  }

  const success = dbCancelItemOrder(payload.orderId, userId);
  if (!success) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Cannot cancel order", source: "cancel_item_order" },
    });
    return;
  }

  audit("item_order_cancelled", userId, { orderId: payload.orderId });
  sendToUser(userId, {
    type: "item_order_cancelled",
    payload: { orderId: payload.orderId },
  });

  if (existing.side === "buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  broadcastItemOrderBook(existing.item_type_id);
}

export function handleAdjustItemOrder(
  userId: number,
  payload: AdjustItemOrderPayload
): void {
  const existing = findItemOrderById(payload.orderId);
  if (!existing || existing.user_id !== userId) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Order not found", source: "adjust_item_order" },
    });
    return;
  }

  // Validate fractional price constraints on adjustment
  if (payload.price !== undefined) {
    if (payload.price < 0.1 || Math.round(payload.price * 10) / 10 !== payload.price) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "Price must be in 0.1 SB increments (minimum 0.1)", source: "adjust_item_order" },
      });
      return;
    }
    const newRemaining = (payload.quantity ?? existing.quantity) - existing.filled_quantity;
    const newMoq = getItemMoq(payload.price);
    if (newRemaining % newMoq !== 0) {
      sendToUser(userId, {
        type: "error",
        payload: { message: `Remaining quantity (${newRemaining}) not compatible with ${payload.price} SB price`, source: "adjust_item_order" },
      });
      return;
    }
  } else if (payload.quantity !== undefined) {
    const newRemaining = payload.quantity - existing.filled_quantity;
    const existingMoq = getItemMoq(existing.price);
    if (newRemaining % existingMoq !== 0) {
      sendToUser(userId, {
        type: "error",
        payload: { message: `Remaining quantity (${newRemaining}) not compatible with ${existing.price} SB price`, source: "adjust_item_order" },
      });
      return;
    }
  }

  if (existing.side === "buy" && typeof payload.sbBalance === "number") {
    const oldRemaining = existing.quantity - existing.filled_quantity;
    const oldCost = itemSbTotal(existing.price, oldRemaining);
    const newPrice = payload.price ?? existing.price;
    const newQuantity = payload.quantity ?? existing.quantity;
    const newCost = itemSbTotal(newPrice, newQuantity - existing.filled_quantity);
    const delta = newCost - oldCost;
    if (delta > 0) {
      const committedSb = getTotalCommittedSb(userId);
      const availableSb = payload.sbBalance - committedSb;
      if (delta > availableSb) {
        sendToUser(userId, {
          type: "error",
          payload: { message: "Insufficient SB for this adjustment", source: "adjust_item_order" },
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
        payload: { message: "Cannot raise price on partially filled sell order", source: "adjust_item_order" },
      });
      return;
    }
    if (existing.side === "buy" && payload.price < existing.price) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "Cannot lower price on partially filled buy order", source: "adjust_item_order" },
      });
      return;
    }
  }

  const row = dbAdjustItemOrder(
    payload.orderId,
    userId,
    payload.price,
    payload.quantity
  );
  if (!row) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Cannot adjust order", source: "adjust_item_order" },
    });
    return;
  }

  const itemType = findItemTypeById(row.item_type_id);
  const order = rowToItemOrder(row, itemType?.name ?? "", itemType?.thumbnail ?? null);
  audit("item_order_adjusted", userId, {
    orderId: order.id,
    price: order.price,
    quantity: order.quantity,
  });
  sendToUser(userId, { type: "item_order_adjusted", payload: { order } });

  if (existing.side === "buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  matchItemOrders(order.itemTypeId);
  broadcastItemOrderBook(order.itemTypeId);
}

export function getItemOrderBookSnapshot(
  itemTypeId: number
): ItemOrderBookSnapshot {
  const sells = getItemOrderBookLevels(itemTypeId, "sell").map((r) => ({
    price: r.price,
    totalQuantity: r.total_quantity,
    orderCount: r.order_count,
  }));

  const buys = getItemOrderBookLevels(itemTypeId, "buy").map((r) => ({
    price: r.price,
    totalQuantity: r.total_quantity,
    orderCount: r.order_count,
  }));

  const rawStats = getItemMarketStatsCached(itemTypeId);
  const stats = {
    priceHistory: rawStats.priceHistory.map((r) => ({
      date: r.date,
      avgPrice: r.avgPrice,
      volume: r.volume,
    })),
    sales: rawStats.sales,
  };

  return { itemTypeId, sells, buys, stats };
}

export function broadcastItemOrderBook(itemTypeId: number): void {
  const snapshot = getItemOrderBookSnapshot(itemTypeId);
  broadcastToItemSubscribers(itemTypeId, {
    type: "item_order_book_snapshot",
    payload: snapshot,
  });
}
