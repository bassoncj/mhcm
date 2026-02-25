import type { ServerMessage } from "@mhcm/shared";
import {
  orderBook,
  myOrders,
  transactions,
  activeTransaction,
  transactionHistory,
  historyPage,
  historyTotalPages,
  historyTotalOrders,
  homeData,
  favouriteMapTypeIds,
  subscribedMapTypeIds,
} from "../../signals/slots.js";
import { showToast } from "../../signals/toast.js";
import { wsSend } from "../useServiceWorker.js";

export function handleSlotMessage(message: ServerMessage): boolean {
  switch (message.type) {
    case "order_book_snapshot":
      orderBook.value = message.payload;
      return true;

    case "my_orders":
      myOrders.value = message.payload.orders;
      return true;

    case "order_created":
      myOrders.value = [...myOrders.value, message.payload.order];
      showToast("Order created");
      return true;

    case "order_cancelled":
      myOrders.value = myOrders.value.filter(
        (o) => o.id !== message.payload.orderId,
      );
      showToast("Order cancelled");
      return true;

    case "order_adjusted":
      myOrders.value = myOrders.value.map((o) =>
        o.id === message.payload.order.id ? message.payload.order : o,
      );
      showToast("Order updated");
      return true;

    case "order_matched":
      activeTransaction.value = message.payload.transaction;
      transactions.value = [
        message.payload.transaction,
        ...transactions.value,
      ];
      return true;

    case "transaction_update": {
      const txn = message.payload.transaction;
      activeTransaction.value = txn;
      transactions.value = transactions.value.map((t) =>
        t.id === txn.id ? txn : t,
      );
      // Refresh orders when a transaction reaches a terminal state
      if (txn.state === "completed" || txn.state === "failed") {
        wsSend({ type: "get_my_orders" });
        wsSend({ type: "get_transaction_history", payload: { page: historyPage.value, perPage: 15 } });
        if (txn.state === "failed") {
          showToast(txn.failureReason || "Transaction failed", "error");
        }
      }
      return true;
    }

    case "transactions":
      transactions.value = message.payload.transactions;
      return true;

    case "transaction_history":
      transactionHistory.value = message.payload.groups;
      historyPage.value = message.payload.page;
      historyTotalPages.value = message.payload.totalPages;
      historyTotalOrders.value = message.payload.totalOrders;
      return true;

    case "home_data":
      homeData.value = message.payload;
      // Re-fetch user data when home data changes (e.g., demo mode toggle)
      wsSend({ type: "get_my_orders" });
      wsSend({ type: "get_transaction_history", payload: { page: historyPage.value, perPage: 15 } });
      return true;

    case "favourites":
      favouriteMapTypeIds.value = message.payload.mapTypeIds;
      return true;

    case "subscriptions":
      subscribedMapTypeIds.value = message.payload.mapTypeIds;
      return true;

    default:
      return false;
  }
}
