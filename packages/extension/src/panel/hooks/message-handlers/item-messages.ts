import type { ServerMessage } from "@mhcm/shared";
import {
  allItemTypes,
  itemClassifications,
  itemOrderBook,
  myItemOrders,
  activeItemTransaction,
  itemHomeData,
  itemFavourites,
  itemNotifications,
  itemHistory,
  itemHistoryPage,
  itemHistoryTotalPages,
} from "../../signals/items.js";
import { showToast } from "../../signals/toast.js";
import { wsSend } from "../useServiceWorker.js";

export function handleItemMessage(message: ServerMessage): boolean {
  switch (message.type) {
    case "item_types":
      allItemTypes.value = message.payload.items;
      itemClassifications.value = message.payload.classifications;
      return true;

    case "item_order_book_snapshot":
      itemOrderBook.value = message.payload;
      return true;

    case "item_order_created":
      myItemOrders.value = [...myItemOrders.value, message.payload.order];
      showToast("Item order created");
      return true;

    case "item_order_cancelled":
      myItemOrders.value = myItemOrders.value.filter(
        (o) => o.id !== message.payload.orderId,
      );
      showToast("Item order cancelled");
      return true;

    case "item_order_adjusted":
      myItemOrders.value = myItemOrders.value.map((o) =>
        o.id === message.payload.order.id ? message.payload.order : o,
      );
      showToast("Item order updated");
      return true;

    case "my_item_orders":
      myItemOrders.value = message.payload.orders;
      return true;

    case "item_order_matched":
      activeItemTransaction.value = message.payload.transaction;
      return true;

    case "item_transaction_update": {
      const itemTxn = message.payload.transaction;
      const isItemTerminal = itemTxn.state === "completed" || itemTxn.state === "failed";
      if (isItemTerminal) {
        activeItemTransaction.value = null;
        wsSend({ type: "get_my_item_orders" });
        wsSend({ type: "get_item_transaction_history", payload: { page: itemHistoryPage.value, perPage: 15 } });
        if (itemTxn.state === "failed") {
          showToast(itemTxn.failureReason || "Item transaction failed", "error");
        }
      } else {
        activeItemTransaction.value = itemTxn;
      }
      return true;
    }

    case "item_transaction_history":
      itemHistory.value = message.payload.groups;
      if (message.payload.page != null) itemHistoryPage.value = message.payload.page;
      if (message.payload.totalPages != null) itemHistoryTotalPages.value = message.payload.totalPages;
      return true;

    case "item_home_data":
      itemHomeData.value = message.payload;
      return true;

    case "item_favourites":
      itemFavourites.value = new Set(message.payload.itemTypeIds);
      return true;

    case "item_notifications":
      itemNotifications.value = new Set(message.payload.itemTypeIds);
      return true;

    case "item_market_stats":
      // Update stats within the current order book if it matches
      if (itemOrderBook.value?.itemTypeId === message.payload.itemTypeId) {
        itemOrderBook.value = {
          ...itemOrderBook.value,
          stats: message.payload.stats,
        };
      }
      return true;

    default:
      return false;
  }
}
