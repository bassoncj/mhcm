import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import {
  sendToUser,
  addSubscription,
  removeSubscription,
} from "../connections.js";
import {
  handleCreateOrder,
  handleCancelOrder,
  handleAdjustOrder,
  getOrderBookSnapshot,
  rowToOrder,
} from "../../orders/slot-book.js";
import { handleStepResult, handleRiskCheckResponse, handleRiskCheckRetry, handleRtManualConfirm } from "../../transactions/slot-orchestrator.js";
import { findOrdersByUser } from "../../db/queries/slot-orders.js";
import { findTransactionsByUser } from "../../db/queries/slot-transactions.js";
import { findTransactionHistoryByUser, groupTransactionHistory } from "../../db/queries/slot-transaction-history.js";
import { rowToTransaction } from "../../transactions/slot-orchestrator.js";
import { getUserFavourites, addFavourite, removeFavourite } from "../../db/queries/slot-favourites.js";
import {
  getUserNotifications,
  addNotification,
  removeNotification,
} from "../../db/queries/slot-notifications.js";
import { computeHomeData } from "../../db/queries/slot-home.js";
import { isMarketBeta, isMarketEnabled } from "../../settings.js";
import { isUserBetaEligible } from "./handler-utils.js";

export function handleSlotMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "create_order":
      if (isMarketBeta("slots") && !isUserBetaEligible(userId, user.role)) {
        sendToUser(userId, { type: "error", payload: { message: "This market is in beta", source: "create_order" } });
        return true;
      }
      if (!isMarketEnabled("slots")) {
        sendToUser(userId, { type: "error", payload: { message: "Trading is paused in this market", source: "create_order" } });
        return true;
      }
      handleCreateOrder(userId, message.payload, user.role);
      return true;

    case "cancel_order":
      handleCancelOrder(userId, message.payload);
      return true;

    case "adjust_order":
      handleAdjustOrder(userId, message.payload);
      return true;

    case "subscribe_order_book":
      addSubscription(userId, message.payload.mapTypeId);
      sendOrderBookSnapshot(userId, message.payload.mapTypeId);
      return true;

    case "unsubscribe_order_book":
      removeSubscription(userId, message.payload.mapTypeId);
      return true;

    case "step_result":
      handleStepResult(message.payload);
      return true;

    case "risk_check_response":
      if (message.payload.marketplace !== "slot") return false;
      handleRiskCheckResponse(userId, message.payload);
      return true;

    case "risk_check_retry":
      if (message.payload.marketplace !== "slot") return false;
      handleRiskCheckRetry(userId, message.payload);
      return true;

    case "rt_manual_confirm":
      handleRtManualConfirm(userId, message.payload);
      return true;

    case "get_my_orders": {
      const rows = findOrdersByUser(userId);
      const orders = rows.map(rowToOrder);
      sendToUser(userId, { type: "my_orders", payload: { orders } });
      return true;
    }

    case "get_transactions": {
      const rows = findTransactionsByUser(userId);
      const transactions = rows.map(rowToTransaction);
      sendToUser(userId, {
        type: "transactions",
        payload: { transactions },
      });
      return true;
    }

    case "get_transaction_history": {
      const page = message.payload?.page ?? 1;
      const perPage = message.payload?.perPage ?? 20;
      const { rows: histRows, totalOrders } = findTransactionHistoryByUser(userId, { page, perPage });
      const groups = groupTransactionHistory(histRows);
      const totalPages = Math.max(1, Math.ceil(totalOrders / perPage));
      sendToUser(userId, {
        type: "transaction_history",
        payload: { groups, page, totalPages, totalOrders },
      });
      return true;
    }

    case "get_home_data": {
      const data = computeHomeData();
      sendToUser(userId, { type: "home_data", payload: data });
      return true;
    }

    case "get_favourites": {
      const favIds = getUserFavourites(userId);
      sendToUser(userId, { type: "favourites", payload: { mapTypeIds: favIds } });
      return true;
    }

    case "add_favourite": {
      addFavourite(userId, message.payload.mapTypeId);
      const updatedFavIds = getUserFavourites(userId);
      sendToUser(userId, { type: "favourites", payload: { mapTypeIds: updatedFavIds } });
      return true;
    }

    case "remove_favourite": {
      removeFavourite(userId, message.payload.mapTypeId);
      const remainingFavIds = getUserFavourites(userId);
      sendToUser(userId, { type: "favourites", payload: { mapTypeIds: remainingFavIds } });
      return true;
    }

    case "get_subscriptions": {
      const mapTypeIds = getUserNotifications(userId);
      sendToUser(userId, { type: "subscriptions", payload: { mapTypeIds } });
      return true;
    }

    case "subscribe_map_type": {
      addNotification(userId, message.payload.mapTypeId);
      const updatedIds = getUserNotifications(userId);
      sendToUser(userId, { type: "subscriptions", payload: { mapTypeIds: updatedIds } });
      return true;
    }

    case "unsubscribe_map_type": {
      removeNotification(userId, message.payload.mapTypeId);
      const remainingIds = getUserNotifications(userId);
      sendToUser(userId, { type: "subscriptions", payload: { mapTypeIds: remainingIds } });
      return true;
    }

    default:
      return false;
  }
}

function sendOrderBookSnapshot(userId: number, mapTypeId: number): void {
  const snapshot = getOrderBookSnapshot(mapTypeId);
  sendToUser(userId, {
    type: "order_book_snapshot",
    payload: snapshot,
  });
}
