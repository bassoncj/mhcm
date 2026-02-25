import type { SnipingOrder, SnipingOrderBookSnapshot, SnipingTarget } from "@mhcm/shared";
import {
  createSnipingOrder as dbCreateSnipingOrder,
  cancelSnipingOrder as dbCancelSnipingOrder,
  findSnipingOrderById,
  findSnipingOrdersByUser,
  getSnipingOrderBookLevels,
  hasConflictingIndividualOrders,
  hasConflictingGroupOrders,
  hasConflictingItemIndividualOrders,
  hasConflictingItemGroupOrders,
  type SnipingOrderRow,
} from "../db/queries/sniping-orders.js";
import { findMHAccountByUserId } from "../db/queries/mh-accounts.js";
import { findMouseTypeById } from "../db/queries/mouse-types.js";
import { findItemTypeById } from "../db/queries/item-types.js";
import {
  findSnipingGroupById,
  findSnipingGroupMembers,
  findGroupsContainingMouse,
  findSnipingItemGroupById,
  findSnipingItemGroupMembers,
  findItemGroupsContainingItem,
} from "../db/queries/sniping-groups.js";
import { getSnipingMarketStatsCached } from "../db/queries/sniping-stats.js";
import { getGroupThumbDataUrl } from "../util/group-thumb.js";
import { sendToUser, broadcastToSnipingSubscribers } from "../ws/connections.js";
import { getTotalCommittedSb } from "../db/queries/sb-reservation.js";
import { trySnipingMatch } from "./sniping-matcher.js";
import { audit } from "../audit.js";
import { verboseLog } from "../settings.js";

export function rowToSnipingOrder(row: SnipingOrderRow): SnipingOrder {
  const base = {
    id: row.id,
    userId: row.user_id,
    goalType: (row.goal_type ?? "mouse") as SnipingOrder["goalType"],
    side: row.side,
    price: row.price,
    status: row.status,
    mhMapId: row.mh_map_id ?? undefined,
    pausedReason: row.paused_reason ?? undefined,
    createdAt: row.created_at,
  };

  if (row.mouse_group_id != null) {
    const group = findSnipingGroupById(row.mouse_group_id);
    return {
      ...base,
      mouseGroupId: row.mouse_group_id,
      mouseGroupName: group?.name ?? `Group #${row.mouse_group_id}`,
    };
  }

  if (row.item_group_id != null) {
    const group = findSnipingItemGroupById(row.item_group_id);
    return {
      ...base,
      itemGroupId: row.item_group_id,
      itemGroupName: group?.name ?? `Item Group #${row.item_group_id}`,
    };
  }

  if (row.item_type_id != null) {
    const item = findItemTypeById(row.item_type_id);
    return {
      ...base,
      itemTypeId: row.item_type_id,
      itemName: item?.name ?? `Item #${row.item_type_id}`,
      itemThumbnail: item?.thumbnail ?? null,
    };
  }

  const mouse = findMouseTypeById(row.mouse_type_id!);
  return {
    ...base,
    mouseTypeId: row.mouse_type_id!,
    mouseName: mouse?.name ?? `Mouse #${row.mouse_type_id}`,
    mouseThumbnail: mouse?.thumbnail ?? null,
  };
}

function targetFromRow(row: SnipingOrderRow): SnipingTarget {
  if (row.mouse_group_id != null) return { mouseGroupId: row.mouse_group_id };
  if (row.item_type_id != null) return { itemTypeId: row.item_type_id };
  if (row.item_group_id != null) return { itemGroupId: row.item_group_id };
  return { mouseTypeId: row.mouse_type_id! };
}

export function handleCreateSnipingOrder(
  userId: number,
  payload: {
    goalType?: string;
    mouseTypeId?: number;
    mouseGroupId?: number;
    itemTypeId?: number;
    itemGroupId?: number;
    side: "sniper_sell" | "sniper_buy";
    price: number;
    mhMapId?: number;
    mapClass?: string;
    minRankId?: number;
    sbBalance?: number;
  }
): void {
  const source = "create_sniping_order";

  const mhAccount = findMHAccountByUserId(userId);
  if (!mhAccount?.verified_at) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "MH account not verified", source },
    });
    return;
  }

  if (payload.side === "sniper_buy" && !payload.mhMapId) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Buy orders require a map ID", source },
    });
    return;
  }

  if (payload.price <= 0) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Price must be positive", source },
    });
    return;
  }

  const goalType = payload.goalType ?? "mouse";

  let target: SnipingTarget;
  let targetLabel: string;

  if (payload.mouseGroupId != null) {
    const group = findSnipingGroupById(payload.mouseGroupId);
    if (!group) {
      verboseLog("snipe-book", `CREATE ORDER REJECTED: group ${payload.mouseGroupId} not found (user ${userId})`);
      sendToUser(userId, { type: "error", payload: { message: "Invalid mouse group", source } });
      return;
    }
    if (!group.enabled || group.archived) {
      verboseLog("snipe-book", `CREATE ORDER REJECTED: group ${payload.mouseGroupId} disabled/archived (user ${userId})`);
      sendToUser(userId, { type: "error", payload: { message: "This group is not currently available", source } });
      return;
    }

    // Mutual exclusion: check for conflicting individual orders on same side
    const members = findSnipingGroupMembers(payload.mouseGroupId);
    const memberIds = members.map((m) => m.mouse_type_id);
    if (hasConflictingIndividualOrders(userId, payload.side, memberIds)) {
      verboseLog("snipe-book", `CREATE ORDER REJECTED: user ${userId} has conflicting individual orders for group ${payload.mouseGroupId}`);
      sendToUser(userId, {
        type: "error",
        payload: { message: "You already have an individual order for a mouse in this group on the same side", source },
      });
      return;
    }

    target = { mouseGroupId: payload.mouseGroupId };
    targetLabel = `mouseGroup=${payload.mouseGroupId}`;
  } else if (payload.itemGroupId != null) {
    const group = findSnipingItemGroupById(payload.itemGroupId);
    if (!group) {
      verboseLog("snipe-book", `CREATE ORDER REJECTED: item group ${payload.itemGroupId} not found (user ${userId})`);
      sendToUser(userId, { type: "error", payload: { message: "Invalid item group", source } });
      return;
    }
    if (!group.enabled || group.archived) {
      verboseLog("snipe-book", `CREATE ORDER REJECTED: item group ${payload.itemGroupId} disabled/archived (user ${userId})`);
      sendToUser(userId, { type: "error", payload: { message: "This group is not currently available", source } });
      return;
    }

    // Mutual exclusion: check for conflicting individual item orders on same side
    const members = findSnipingItemGroupMembers(payload.itemGroupId);
    const memberIds = members.map((m) => m.item_type_id);
    if (hasConflictingItemIndividualOrders(userId, payload.side, memberIds)) {
      verboseLog("snipe-book", `CREATE ORDER REJECTED: user ${userId} has conflicting individual orders for item group ${payload.itemGroupId}`);
      sendToUser(userId, {
        type: "error",
        payload: { message: "You already have an individual order for an item in this group on the same side", source },
      });
      return;
    }

    target = { itemGroupId: payload.itemGroupId };
    targetLabel = `itemGroup=${payload.itemGroupId}`;
  } else if (payload.itemTypeId != null) {
    const itemType = findItemTypeById(payload.itemTypeId);
    if (!itemType) {
      sendToUser(userId, { type: "error", payload: { message: "Invalid item type", source } });
      return;
    }

    // Mutual exclusion: check for conflicting item group orders on same side
    if (hasConflictingItemGroupOrders(userId, payload.side, payload.itemTypeId)) {
      verboseLog("snipe-book", `CREATE ORDER REJECTED: user ${userId} has conflicting item group orders for item ${payload.itemTypeId}`);
      sendToUser(userId, {
        type: "error",
        payload: { message: "You already have a group order containing this item on the same side", source },
      });
      return;
    }

    target = { itemTypeId: payload.itemTypeId };
    targetLabel = `item=${payload.itemTypeId}`;
  } else if (payload.mouseTypeId != null) {
    const mouseType = findMouseTypeById(payload.mouseTypeId);
    if (!mouseType) {
      sendToUser(userId, { type: "error", payload: { message: "Invalid mouse type", source } });
      return;
    }

    // Mutual exclusion: check for conflicting group orders on same side
    if (hasConflictingGroupOrders(userId, payload.side, payload.mouseTypeId)) {
      verboseLog("snipe-book", `CREATE ORDER REJECTED: user ${userId} has conflicting group orders for mouse ${payload.mouseTypeId}`);
      sendToUser(userId, {
        type: "error",
        payload: { message: "You already have a group order containing this mouse on the same side", source },
      });
      return;
    }

    target = { mouseTypeId: payload.mouseTypeId };
    targetLabel = `mouse=${payload.mouseTypeId}`;
  } else {
    sendToUser(userId, { type: "error", payload: { message: "Must specify a target (mouseTypeId, mouseGroupId, itemTypeId, or itemGroupId)", source } });
    return;
  }

  if (payload.side === "sniper_buy" && typeof payload.sbBalance === "number") {
    const committedSb = getTotalCommittedSb(userId);
    const availableSb = payload.sbBalance - committedSb;
    if (payload.price > availableSb) {
      sendToUser(userId, {
        type: "error",
        payload: { message: "Insufficient SB balance for this order", source },
      });
      return;
    }
  }

  const row = dbCreateSnipingOrder({
    userId,
    mouseTypeId: payload.mouseTypeId,
    mouseGroupId: payload.mouseGroupId,
    itemTypeId: payload.itemTypeId,
    itemGroupId: payload.itemGroupId,
    goalType,
    side: payload.side,
    price: payload.price,
    mhMapId: payload.mhMapId,
    mapClass: payload.mapClass,
    minRankId: payload.minRankId,
  });

  verboseLog("snipe-book", `CREATE ORDER: user ${userId}, side=${payload.side}, ${targetLabel}, price=${payload.price}, map=${payload.mhMapId ?? "none"} → order #${row.id}`);

  const order = rowToSnipingOrder(row);
  audit("order_created", userId, {
    orderId: order.id,
    mouseTypeId: order.mouseTypeId,
    mouseGroupId: order.mouseGroupId,
    itemTypeId: order.itemTypeId,
    itemGroupId: order.itemGroupId,
    side: order.side,
    price: order.price,
    context: "sniping",
  });
  sendToUser(userId, { type: "sniping_order_created", payload: { order } });

  if (payload.side === "sniper_buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  trySnipingMatch(target);
  broadcastSnipingOrderBook(target);
}

export function handleCancelSnipingOrder(
  userId: number,
  payload: { orderId: number }
): void {
  const existing = findSnipingOrderById(payload.orderId);
  if (!existing || existing.user_id !== userId) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Cannot cancel this order", source: "cancel_sniping_order" },
    });
    return;
  }

  verboseLog("snipe-book", `CANCEL ORDER #${payload.orderId}: user ${userId}`);
  const cancelled = dbCancelSnipingOrder(payload.orderId, userId);
  if (!cancelled) {
    sendToUser(userId, {
      type: "error",
      payload: { message: "Cannot cancel this order", source: "cancel_sniping_order" },
    });
    return;
  }

  audit("order_cancelled", userId, {
    orderId: payload.orderId,
    context: "sniping",
  });
  sendToUser(userId, {
    type: "sniping_order_cancelled",
    payload: { orderId: payload.orderId },
  });

  if (existing.side === "sniper_buy") {
    const updatedCommitted = getTotalCommittedSb(userId);
    sendToUser(userId, {
      type: "available_sb",
      payload: { totalSb: null, committedSb: updatedCommitted, availableSb: null },
    });
  }

  broadcastSnipingOrderBook(targetFromRow(existing));
}

export function getSnipingOrderBookSnapshot(
  target: SnipingTarget
): SnipingOrderBookSnapshot {
  const sells = getSnipingOrderBookLevels(target, "sniper_sell");
  const buys = getSnipingOrderBookLevels(target, "sniper_buy");
  const stats = getSnipingMarketStatsCached(target);

  const groupsContainingMouse =
    target.mouseTypeId != null ? findGroupsContainingMouse(target.mouseTypeId) : undefined;

  const groupMembers =
    target.mouseGroupId != null
      ? findSnipingGroupMembers(target.mouseGroupId).map((m) => ({
          mouseTypeId: m.mouse_type_id,
          name: m.name,
          thumbnail: m.thumbnail,
        }))
      : undefined;

  const groupsContainingItem =
    target.itemTypeId != null ? findItemGroupsContainingItem(target.itemTypeId) : undefined;

  const itemGroupMembers =
    target.itemGroupId != null
      ? findSnipingItemGroupMembers(target.itemGroupId).map((m) => ({
          itemTypeId: m.item_type_id,
          name: m.name,
          thumbnail: m.thumbnail,
        }))
      : undefined;

  return {
    mouseTypeId: target.mouseTypeId,
    mouseGroupId: target.mouseGroupId,
    itemTypeId: target.itemTypeId,
    itemGroupId: target.itemGroupId,
    sells,
    buys,
    stats,
    groupsContainingMouse,
    groupMembers,
    groupsContainingItem,
    itemGroupMembers,
  };
}

export function broadcastSnipingOrderBook(target: SnipingTarget): void {
  const snapshot = getSnipingOrderBookSnapshot(target);
  broadcastToSnipingSubscribers(target, {
    type: "sniping_order_book_snapshot",
    payload: snapshot,
  });
}
