import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser, addMapSubscription, removeMapSubscription } from "../connections.js";
import {
  handleCreateMapOrder,
  handleCancelMapOrder,
  handleAdjustMapOrder,
  getMapOrderBookSnapshot,
  rowToMapOrder,
} from "../../orders/map-book.js";
import { handleMapStepResult, handleMapRiskCheckResponse, handleMapRiskCheckRetry } from "../../transactions/map-orchestrator.js";
import { findMapOrdersByUser } from "../../db/queries/map-orders.js";
import { computeMapHomeData } from "../../db/queries/map-home.js";
import { resolveMouseTiers, calculateOrderTier } from "../../db/queries/mouse-types.js";
import { resolveItemTiers } from "../../db/queries/item-types.js";
import { getMapTypeGoal } from "../../db/queries/map-types.js";
import {
  getMapNotifications,
  addMapNotification,
  removeMapNotification,
} from "../../db/queries/map-notifications.js";
import { getMapFavourites, addMapFavourite, removeMapFavourite } from "../../db/queries/map-favourites.js";
import { getMapTransactionHistory } from "../../db/queries/map-transaction-history.js";
import { findMapTypeById as findMapTypeByIdForOrders, findMapTypes } from "../../db/queries/map-types.js";
import { findRankById } from "../../db/queries/ranks.js";
import { isMarketBeta, isMarketEnabled } from "../../settings.js";
import { isUserBetaEligible } from "./handler-utils.js";

export function handleMapMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "subscribe_map_order_book": {
      const { mapTypeId, mode } = message.payload;
      addMapSubscription(userId, mapTypeId, mode);
      const mapSnapshot = getMapOrderBookSnapshot(mapTypeId, mode);
      sendToUser(userId, { type: "map_order_book_snapshot", payload: mapSnapshot });
      return true;
    }

    case "unsubscribe_map_order_book":
      removeMapSubscription(userId, message.payload.mapTypeId, message.payload.mode);
      return true;

    case "get_map_order_book": {
      const { mapTypeId: getMapTypeId, mode: getMode } = message.payload;
      const snapshot = getMapOrderBookSnapshot(getMapTypeId, getMode);
      sendToUser(userId, { type: "map_order_book_snapshot", payload: snapshot });
      return true;
    }

    case "create_map_order":
      if (isMarketBeta("maps") && !isUserBetaEligible(userId, user.role)) {
        sendToUser(userId, { type: "error", payload: { message: "This market is in beta", source: "create_map_order" } });
        return true;
      }
      if (!isMarketEnabled("maps")) {
        sendToUser(userId, { type: "error", payload: { message: "Trading is paused in this market", source: "create_map_order" } });
        return true;
      }
      handleCreateMapOrder(userId, message.payload);
      return true;

    case "cancel_map_order":
      handleCancelMapOrder(userId, message.payload);
      return true;

    case "adjust_map_order":
      handleAdjustMapOrder(userId, message.payload);
      return true;

    case "get_map_home_data": {
      const homeMode = message.payload.mode;
      const mapHomeData = computeMapHomeData(userId, homeMode);
      sendToUser(userId, { type: "map_home_data", payload: mapHomeData });
      return true;
    }

    case "get_my_map_orders": {
      const mapOrderRows = findMapOrdersByUser(userId);
      const mapOrders = mapOrderRows.map((row) => {
        const mt = findMapTypeByIdForOrders(row.map_type_id);
        return rowToMapOrder(row, mt?.display_name ?? "", mt?.thumbnail ?? null);
      });
      sendToUser(userId, { type: "my_map_orders", payload: { orders: mapOrders } });
      return true;
    }

    case "map_step_result":
      handleMapStepResult(message.payload);
      return true;

    case "risk_check_response":
      if (message.payload.marketplace !== "map") return false;
      handleMapRiskCheckResponse(userId, message.payload);
      return true;

    case "risk_check_retry":
      if (message.payload.marketplace !== "map") return false;
      handleMapRiskCheckRetry(userId, message.payload);
      return true;

    case "get_map_transaction_history": {
      const mPage = message.payload?.page ?? 1;
      const mPerPage = message.payload?.perPage ?? 20;
      const mapHistoryResult = getMapTransactionHistory(userId, { page: mPage, perPage: mPerPage });
      sendToUser(userId, {
        type: "map_transaction_history",
        payload: mapHistoryResult,
      });
      return true;
    }

    case "toggle_map_notification": {
      const { mapTypeId: notifMapId, mode: notifMode } = message.payload;
      const currentMapNotifs = getMapNotifications(userId);
      const isCurrentlySubscribed = currentMapNotifs.some(
        (n) => n.map_type_id === notifMapId && n.mode === notifMode,
      );
      if (isCurrentlySubscribed) {
        removeMapNotification(userId, notifMapId, notifMode);
      } else {
        addMapNotification(userId, notifMapId, notifMode);
      }
      const updatedMapNotifs = getMapNotifications(userId);
      sendToUser(userId, {
        type: "map_notifications",
        payload: {
          notifications: updatedMapNotifs.map((n) => ({
            mapTypeId: n.map_type_id,
            mode: n.mode,
          })),
        },
      });
      return true;
    }

    case "get_map_notifications": {
      const mapNotifs = getMapNotifications(userId);
      sendToUser(userId, {
        type: "map_notifications",
        payload: {
          notifications: mapNotifs.map((n) => ({
            mapTypeId: n.map_type_id,
            mode: n.mode,
          })),
        },
      });
      return true;
    }

    case "toggle_map_favourite": {
      const { mapTypeId: favMapId, mode: favMode } = message.payload;
      const currentFavs = getMapFavourites(userId, favMode);
      if (currentFavs.includes(favMapId)) {
        removeMapFavourite(userId, favMapId, favMode);
      } else {
        addMapFavourite(userId, favMapId, favMode);
      }
      const updatedMapFavs = getMapFavourites(userId, favMode);
      sendToUser(userId, { type: "map_favourites", payload: { mapTypeIds: updatedMapFavs } });
      return true;
    }

    case "get_map_favourites": {
      const { mode: favReqMode } = message.payload;
      const mapFavIds = getMapFavourites(userId, favReqMode);
      sendToUser(userId, { type: "map_favourites", payload: { mapTypeIds: mapFavIds } });
      return true;
    }

    case "get_map_tier": {
      const { mapTypeId: tierMapId, goalIds } = message.payload;
      const goalType = getMapTypeGoal(tierMapId);
      let tierMap: Map<number, "S" | "A" | "B">;
      if (goalType === "item") {
        tierMap = resolveItemTiers(goalIds, tierMapId);
      } else {
        tierMap = resolveMouseTiers(goalIds, tierMapId);
      }
      const tiers = goalIds.map((id) => tierMap.get(id) ?? "B");
      const tier = calculateOrderTier(tiers);
      sendToUser(userId, { type: "map_tier", payload: { tier } });
      return true;
    }

    case "get_map_types": {
      const allMapTypes = findMapTypes("every");
      sendToUser(userId, {
        type: "map_types",
        payload: {
          mapTypes: allMapTypes.map((r) => ({
            id: r.id,
            mapType: r.map_type,
            quality: r.quality as "common" | "rare",
            goal: r.goal as "mouse" | "item",
            displayName: r.display_name,
            thumbnail: r.thumbnail,
            alias: r.alias,
            maxHunters: r.max_hunters,
            lastGoalCount: (r.last_goal_count ?? 1) as 1 | 2 | 3,
            enabledSlots: !!r.enabled_slots,
            enabledUnopened: !!r.enabled_unopened,
            enabledComplete: !!r.enabled_complete,
            scrollItemType: r.scroll_item_type,
            minRank: r.min_rank ? Number(r.min_rank) : null,
            minRankName: r.min_rank ? (findRankById(Number(r.min_rank))?.name ?? null) : null,
            mapClass: (r.map_class ?? null) as any,
            supportsRt: !!r.supports_rt,
          })),
        },
      });
      return true;
    }

    default:
      return false;
  }
}
