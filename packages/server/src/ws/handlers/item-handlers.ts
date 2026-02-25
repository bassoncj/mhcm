import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser, addItemSubscription, removeItemSubscription } from "../connections.js";
import {
  handleCreateItemOrder,
  handleCancelItemOrder,
  handleAdjustItemOrder,
  getItemOrderBookSnapshot,
  rowToItemOrder,
} from "../../orders/item-book.js";
import { handleItemStepResult } from "../../transactions/item-orchestrator.js";
import { findItemOrdersByUser } from "../../db/queries/item-orders.js";
import {
  findItemTypeById,
  findEnabledItemTypes,
  getDistinctClassifications,
} from "../../db/queries/item-types.js";
import { computeItemHomeData } from "../../db/queries/item-home.js";
import {
  getItemFavourites,
  addItemFavourite,
  removeItemFavourite,
} from "../../db/queries/item-favourites.js";
import {
  getItemNotifications,
  addItemNotification,
  removeItemNotification,
} from "../../db/queries/item-notifications.js";
import { getItemTransactionHistory } from "../../db/queries/item-transaction-history.js";
import { isMarketBeta, isMarketEnabled } from "../../settings.js";
import { isUserBetaEligible, rowToItemType } from "./handler-utils.js";

export function handleItemMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "subscribe_item_order_book": {
      const { itemTypeId: subItemId } = message.payload;
      addItemSubscription(userId, subItemId);
      const snapshot = getItemOrderBookSnapshot(subItemId);
      sendToUser(userId, { type: "item_order_book_snapshot", payload: snapshot });
      return true;
    }

    case "unsubscribe_item_order_book":
      removeItemSubscription(userId, message.payload.itemTypeId);
      return true;

    case "create_item_order":
      if (isMarketBeta("items") && !isUserBetaEligible(userId, user.role)) {
        sendToUser(userId, { type: "error", payload: { message: "This market is in beta", source: "create_item_order" } });
        return true;
      }
      if (!isMarketEnabled("items")) {
        sendToUser(userId, { type: "error", payload: { message: "Trading is paused in this market", source: "create_item_order" } });
        return true;
      }
      handleCreateItemOrder(userId, message.payload);
      return true;

    case "cancel_item_order":
      handleCancelItemOrder(userId, message.payload);
      return true;

    case "adjust_item_order":
      handleAdjustItemOrder(userId, message.payload);
      return true;

    case "get_item_order_book": {
      const itemSnapshot = getItemOrderBookSnapshot(message.payload.itemTypeId);
      sendToUser(userId, { type: "item_order_book_snapshot", payload: itemSnapshot });
      return true;
    }

    case "get_item_types": {
      const enabledItems = findEnabledItemTypes();
      const classifications = getDistinctClassifications();
      sendToUser(userId, {
        type: "item_types",
        payload: {
          items: enabledItems.map(rowToItemType),
          classifications,
        },
      });
      return true;
    }

    case "get_item_home_data": {
      const itemHomeData = computeItemHomeData(userId);
      sendToUser(userId, { type: "item_home_data", payload: itemHomeData });
      return true;
    }

    case "toggle_item_favourite": {
      const { itemTypeId: favItemId } = message.payload;
      const currentFavs = getItemFavourites(userId);
      if (currentFavs.includes(favItemId)) {
        removeItemFavourite(userId, favItemId);
      } else {
        addItemFavourite(userId, favItemId);
      }
      const updatedItemFavs = getItemFavourites(userId);
      sendToUser(userId, { type: "item_favourites", payload: { itemTypeIds: updatedItemFavs } });
      return true;
    }

    case "toggle_item_notification": {
      const { itemTypeId: notifItemId } = message.payload;
      const currentNotifs = getItemNotifications(userId);
      if (currentNotifs.includes(notifItemId)) {
        removeItemNotification(userId, notifItemId);
      } else {
        addItemNotification(userId, notifItemId);
      }
      const updatedItemNotifs = getItemNotifications(userId);
      sendToUser(userId, { type: "item_notifications", payload: { itemTypeIds: updatedItemNotifs } });
      return true;
    }

    case "get_my_item_orders": {
      const itemOrderRows = findItemOrdersByUser(userId);
      const itemOrders = itemOrderRows.map((row) => {
        const it = findItemTypeById(row.item_type_id);
        return rowToItemOrder(row, it?.name ?? "", it?.thumbnail ?? null);
      });
      sendToUser(userId, { type: "my_item_orders", payload: { orders: itemOrders } });
      return true;
    }

    case "get_item_transaction_history": {
      const iPage = message.payload?.page ?? 1;
      const iPerPage = message.payload?.perPage ?? 20;
      const { groups, totalOrders } = getItemTransactionHistory(userId, { page: iPage, perPage: iPerPage });
      const iTotalPages = Math.max(1, Math.ceil(totalOrders / iPerPage));
      sendToUser(userId, {
        type: "item_transaction_history",
        payload: { groups, page: iPage, totalPages: iTotalPages, totalOrders },
      });
      return true;
    }

    case "item_step_result":
      handleItemStepResult(message.payload);
      return true;

    case "get_item_favourites": {
      const itemFavIds = getItemFavourites(userId);
      sendToUser(userId, { type: "item_favourites", payload: { itemTypeIds: itemFavIds } });
      return true;
    }

    case "get_item_notifications": {
      const itemNotifIds = getItemNotifications(userId);
      sendToUser(userId, { type: "item_notifications", payload: { itemTypeIds: itemNotifIds } });
      return true;
    }

    default:
      return false;
  }
}
