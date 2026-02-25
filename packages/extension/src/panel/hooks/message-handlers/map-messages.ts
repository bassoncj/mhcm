import type { ServerMessage } from "@mhcm/shared";
import {
  mapOrderBook,
  myMapOrders,
  activeMapTransaction,
  mapHomeData,
  mapFavourites,
  mapNotifications,
  mapHistory,
  mapHistoryPage,
  mapHistoryTotalPages,
  mapHistoryTotalOrders,
  sellMapTier,
  sellMapTierLoading,
} from "../../signals/maps.js";
import { showToast } from "../../signals/toast.js";
import { wsSend } from "../useServiceWorker.js";

export function handleMapMessage(message: ServerMessage): boolean {
  switch (message.type) {
    case "map_order_book_snapshot":
      mapOrderBook.value = message.payload;
      return true;

    case "map_order_created":
      myMapOrders.value = [...myMapOrders.value, message.payload.order];
      showToast("Map order created");
      return true;

    case "map_order_cancelled":
      myMapOrders.value = myMapOrders.value.filter(
        (o) => o.id !== message.payload.orderId,
      );
      showToast("Map order cancelled");
      return true;

    case "map_order_adjusted":
      myMapOrders.value = myMapOrders.value.map((o) =>
        o.id === message.payload.order.id ? message.payload.order : o,
      );
      showToast("Map order updated");
      return true;

    case "my_map_orders":
      myMapOrders.value = message.payload.orders;
      return true;

    case "map_order_matched":
      activeMapTransaction.value = message.payload.transaction;
      return true;

    case "map_transaction_update": {
      const mapTxn = message.payload.transaction;
      const isMapTerminal = mapTxn.state === "completed" || mapTxn.state === "failed";
      if (isMapTerminal) {
        activeMapTransaction.value = null;
        wsSend({ type: "get_my_map_orders" });
        wsSend({ type: "get_map_transaction_history", payload: { page: mapHistoryPage.value, perPage: 15 } });
        if (mapTxn.state === "failed") {
          showToast(mapTxn.failureReason || "Map transaction failed", "error");
        }
      } else {
        activeMapTransaction.value = mapTxn;
      }
      return true;
    }

    case "map_transaction_history":
      mapHistory.value = message.payload.groups;
      if (message.payload.page != null) mapHistoryPage.value = message.payload.page;
      if (message.payload.totalPages != null) mapHistoryTotalPages.value = message.payload.totalPages;
      if (message.payload.totalOrders != null) mapHistoryTotalOrders.value = message.payload.totalOrders;
      return true;

    case "map_home_data":
      mapHomeData.value = message.payload;
      return true;

    case "map_favourites":
      mapFavourites.value = new Set(message.payload.mapTypeIds);
      return true;

    case "map_notifications":
      mapNotifications.value = new Set(
        message.payload.notifications.map(
          (n: { mapTypeId: number; mode: string }) => `${n.mapTypeId}:${n.mode}`,
        ),
      );
      return true;

    case "map_tier":
      sellMapTier.value = message.payload.tier;
      sellMapTierLoading.value = false;
      return true;

    case "map_market_stats":
      // Update stats within the current order book if it matches
      if (
        mapOrderBook.value?.mapTypeId === message.payload.mapTypeId &&
        mapOrderBook.value?.mode === message.payload.mode
      ) {
        mapOrderBook.value = {
          ...mapOrderBook.value,
          stats: message.payload.stats,
        };
      }
      return true;

    default:
      return false;
  }
}
