import type { ClientMessage, SnipingHomeGoalItem } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser, addSnipingSubscription, removeSnipingSubscription } from "../connections.js";
import { targetFromPayload, rowToMouseType, rowToItemType } from "./handler-utils.js";
import { verboseLog } from "../../settings.js";
import {
  findSnipingOrdersByUser,
  getSnipingPriceSuggestion,
  hasConflictingIndividualOrders,
  hasConflictingItemIndividualOrders,
} from "../../db/queries/sniping-orders.js";
import {
  handleCreateSnipingOrder,
  handleCancelSnipingOrder,
  getSnipingOrderBookSnapshot,
  rowToSnipingOrder,
} from "../../orders/sniping-book.js";
import {
  handleSnipingStepResult,
  handleGoalCompleted,
  handleSniperLeftMap,
  rowToSnipingTransaction,
} from "../../transactions/sniping-orchestrator.js";
import { findMouseTypeById, searchMouseTypes, listMicePaged } from "../../db/queries/mouse-types.js";
import { findItemTypeById, searchItemTypes, listItemsPaged } from "../../db/queries/item-types.js";
import { computeSnipingHomeData, computeSnipingItemHomeData } from "../../db/queries/sniping-home.js";
import {
  getUserSnipingFavourites,
  addSnipingFavourite,
  removeSnipingFavourite,
  type FavouriteGoalType,
} from "../../db/queries/sniping-favourites.js";
import { findSnipingTransactionHistory } from "../../db/queries/sniping-transaction-history.js";
import { findActiveSnipingTransactions } from "../../db/queries/sniping-transactions.js";
import {
  findQualifyingGroups,
  findSnipingGroupById,
  findQualifyingItemGroups,
  findSnipingItemGroupById,
} from "../../db/queries/sniping-groups.js";
import { getGroupThumbDataUrl } from "../../util/group-thumb.js";
import { isMarketBeta, isMarketEnabled } from "../../settings.js";
import { isUserBetaEligible } from "./handler-utils.js";

export function handleSnipingMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "create_sniping_order":
      if (isMarketBeta("sniping") && !isUserBetaEligible(userId, user.role)) {
        sendToUser(userId, { type: "error", payload: { message: "This market is in beta", source: "create_sniping_order" } });
        return true;
      }
      if (!isMarketEnabled("sniping")) {
        sendToUser(userId, { type: "error", payload: { message: "Trading is paused in this market", source: "create_sniping_order" } });
        return true;
      }
      handleCreateSnipingOrder(userId, message.payload);
      return true;

    case "cancel_sniping_order":
      handleCancelSnipingOrder(userId, message.payload);
      return true;

    case "get_sniping_order_book": {
      const bookTarget = targetFromPayload(message.payload);
      const snapshot = getSnipingOrderBookSnapshot(bookTarget);
      sendToUser(userId, {
        type: "sniping_order_book_snapshot",
        payload: snapshot,
      });
      return true;
    }

    case "subscribe_sniping_order_book": {
      const subTarget = targetFromPayload(message.payload);
      addSnipingSubscription(userId, subTarget);
      const subSnapshot = getSnipingOrderBookSnapshot(subTarget);
      sendToUser(userId, {
        type: "sniping_order_book_snapshot",
        payload: subSnapshot,
      });
      return true;
    }

    case "unsubscribe_sniping_order_book":
      removeSnipingSubscription(userId, targetFromPayload(message.payload));
      return true;

    case "search_mice": {
      const { query: mouseQuery } = message.payload;
      if (!mouseQuery || mouseQuery.length < 2) {
        sendToUser(userId, { type: "mouse_search_results", payload: { mice: [] } });
        return true;
      }
      const mouseResults = searchMouseTypes(mouseQuery, 20);
      sendToUser(userId, {
        type: "mouse_search_results",
        payload: { mice: mouseResults.map(rowToMouseType) },
      });
      return true;
    }

    case "search_items": {
      const { query: itemQuery } = message.payload;
      if (!itemQuery || itemQuery.length < 2) {
        sendToUser(userId, { type: "item_search_results", payload: { items: [] } });
        return true;
      }
      // No tradable filter – sniping goal items can be non-tradable
      const itemResults = searchItemTypes(itemQuery, undefined, 20);
      sendToUser(userId, {
        type: "item_search_results",
        payload: { items: itemResults.map(rowToItemType) },
      });
      return true;
    }

    case "get_sniping_price_suggestion": {
      const sugTarget = targetFromPayload(message.payload);
      const suggestion = getSnipingPriceSuggestion(sugTarget);
      sendToUser(userId, {
        type: "sniping_price_suggestion",
        payload: {
          mouseTypeId: message.payload.mouseTypeId,
          mouseGroupId: message.payload.mouseGroupId,
          itemTypeId: message.payload.itemTypeId,
          itemGroupId: message.payload.itemGroupId,
          ...suggestion,
        },
      });
      return true;
    }

    case "get_my_sniping_orders": {
      const snipingRows = findSnipingOrdersByUser(userId, [
        "open", "paused", "matched", "in_progress",
      ]);
      const snipingOrders = snipingRows.map(rowToSnipingOrder);
      sendToUser(userId, { type: "my_sniping_orders", payload: { orders: snipingOrders } });
      return true;
    }

    case "mouse_caught":
      verboseLog("snipe-ws", `RECV mouse_caught from user ${userId}: txn #${message.payload.transactionId}, mouse=${message.payload.mouseTypeId}, reportedBy=${message.payload.reportedBy ?? "unknown"}`);
      handleGoalCompleted(message.payload.transactionId, "mouse", message.payload.mouseTypeId, userId);
      return true;

    case "item_found":
      verboseLog("snipe-ws", `RECV item_found from user ${userId}: txn #${message.payload.transactionId}, item=${message.payload.itemTypeId}, reportedBy=${message.payload.reportedBy ?? "unknown"}`);
      handleGoalCompleted(message.payload.transactionId, "item", message.payload.itemTypeId, userId);
      return true;

    case "sniper_left_map":
      verboseLog("snipe-ws", `RECV sniper_left_map from user ${userId}: txn #${message.payload.transactionId}, reportedBy=${message.payload.reportedBy ?? "unknown"}`);
      handleSniperLeftMap(message.payload.transactionId, message.payload.reportedBy);
      return true;

    case "sniping_step_result":
      verboseLog("snipe-ws", `RECV sniping_step_result from user ${userId}: txn #${message.payload.transactionId}, step=${message.payload.step}, success=${message.payload.success}${message.payload.error ? `, error=${message.payload.error}` : ""}`);
      handleSnipingStepResult(message.payload);
      return true;

    case "get_sniping_home_data": {
      const homeGoalType = message.payload?.goalType ?? "mouse";
      const globalData = homeGoalType === "item"
        ? computeSnipingItemHomeData()
        : computeSnipingHomeData();
      const favRows = getUserSnipingFavourites(userId);
      const favourites = favRows
        .map((row): SnipingHomeGoalItem | null => {
          switch (row.goal_type) {
            case "mouse_group": {
              if (homeGoalType === "item") return null;
              const group = findSnipingGroupById(row.goal_id);
              if (!group || !group.enabled || group.archived) return null;
              return { mouseGroupId: row.goal_id, isGroup: true, name: group.name, thumbnail: getGroupThumbDataUrl(row.goal_id), avgPrice: null };
            }
            case "mouse": {
              if (homeGoalType === "item") return null;
              const mt = findMouseTypeById(row.goal_id);
              if (!mt) return null;
              return { mouseTypeId: row.goal_id, name: mt.name, thumbnail: mt.thumbnail, avgPrice: null };
            }
            case "item": {
              if (homeGoalType === "mouse") return null;
              const it = findItemTypeById(row.goal_id);
              if (!it) return null;
              return { itemTypeId: row.goal_id, name: it.name, thumbnail: it.thumbnail, avgPrice: null };
            }
            case "item_group": {
              if (homeGoalType === "mouse") return null;
              const ig = findSnipingItemGroupById(row.goal_id);
              if (!ig || !ig.enabled || ig.archived) return null;
              return { itemGroupId: row.goal_id, isGroup: true, name: ig.name, thumbnail: getGroupThumbDataUrl(row.goal_id, "item"), avgPrice: null };
            }
            default:
              return null;
          }
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
      sendToUser(userId, {
        type: "sniping_home_data",
        payload: { ...globalData, favourites },
      });
      return true;
    }

    case "get_sniping_favourites": {
      const snipingFavs = getUserSnipingFavourites(userId);
      sendToUser(userId, {
        type: "sniping_favourites",
        payload: { favourites: snipingFavs.map(r => ({ goalType: r.goal_type, goalId: r.goal_id })) },
      });
      return true;
    }

    case "add_sniping_favourite": {
      const { goalType: addGoalType, goalId: addGoalId } = message.payload;
      addSnipingFavourite(userId, addGoalType as FavouriteGoalType, addGoalId);
      const updatedFavs = getUserSnipingFavourites(userId);
      sendToUser(userId, {
        type: "sniping_favourites",
        payload: { favourites: updatedFavs.map(r => ({ goalType: r.goal_type, goalId: r.goal_id })) },
      });
      return true;
    }

    case "remove_sniping_favourite": {
      const { goalType: rmGoalType, goalId: rmGoalId } = message.payload;
      removeSnipingFavourite(userId, rmGoalType as FavouriteGoalType, rmGoalId);
      const updatedFavs2 = getUserSnipingFavourites(userId);
      sendToUser(userId, {
        type: "sniping_favourites",
        payload: { favourites: updatedFavs2.map(r => ({ goalType: r.goal_type, goalId: r.goal_id })) },
      });
      return true;
    }

    case "list_mice": {
      const { offset: mouseOffset, limit: mouseLimit, search: mouseSearch } = message.payload;
      const clampedLimit = Math.min(mouseLimit, 100);
      const result = listMicePaged({ offset: mouseOffset, limit: clampedLimit, search: mouseSearch });
      sendToUser(userId, {
        type: "mouse_list",
        payload: { mice: result.mice.map(rowToMouseType), hasMore: result.hasMore },
      });
      return true;
    }

    case "list_items": {
      const { offset: itemOffset, limit: itemLimit, search: itemSearch } = message.payload;
      const clampedItemLimit = Math.min(itemLimit, 100);
      const itemResult = listItemsPaged({ offset: itemOffset, limit: clampedItemLimit, search: itemSearch });
      sendToUser(userId, {
        type: "item_list",
        payload: { items: itemResult.items.map(rowToItemType), hasMore: itemResult.hasMore },
      });
      return true;
    }

    case "get_sniping_wizard_data": {
      const { mouseTypeIds: wizardMouseIds } = message.payload;
      const wizardMice = wizardMouseIds
        .map((id) => {
          const mt = findMouseTypeById(id);
          if (!mt) return null;
          const suggestion = getSnipingPriceSuggestion({ mouseTypeId: id });
          return {
            mouseTypeId: id,
            name: mt.name,
            thumbnail: mt.thumbnail,
            avg7d: suggestion.avg7d,
            avg30d: suggestion.avg30d,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);

      // Filter out groups where user already has conflicting individual buy orders
      const qualifyingGroups = findQualifyingGroups(wizardMouseIds).filter((qg) => {
        const memberIds = qg.members.map((m) => m.mouse_type_id);
        return !hasConflictingIndividualOrders(userId, "sniper_buy", memberIds);
      });
      const groups = qualifyingGroups.map((qg) => {
        const suggestion = getSnipingPriceSuggestion({ mouseGroupId: qg.group.id });
        return {
          groupId: qg.group.id,
          name: qg.group.name,
          mice: qg.members.map((m) => ({
            mouseTypeId: m.mouse_type_id,
            name: m.name,
            thumbnail: m.thumbnail,
          })),
          avg7d: suggestion.avg7d,
          avg30d: suggestion.avg30d,
        };
      });

      sendToUser(userId, { type: "sniping_wizard_data", payload: { mice: wizardMice, groups } });
      return true;
    }

    case "get_sniping_item_wizard_data": {
      const { itemTypeIds: wizardItemIds } = message.payload;
      const wizardItems = wizardItemIds
        .map((id) => {
          const it = findItemTypeById(id);
          if (!it) return null;
          const suggestion = getSnipingPriceSuggestion({ itemTypeId: id });
          return {
            itemTypeId: id,
            name: it.name,
            thumbnail: it.thumbnail,
            avg7d: suggestion.avg7d,
            avg30d: suggestion.avg30d,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);

      // Filter out groups where user already has conflicting individual buy orders
      const qualifyingItemGroups = findQualifyingItemGroups(wizardItemIds).filter((qg) => {
        const memberIds = qg.members.map((m) => m.item_type_id);
        return !hasConflictingItemIndividualOrders(userId, "sniper_buy", memberIds);
      });
      const itemGroups = qualifyingItemGroups.map((qg) => {
        const suggestion = getSnipingPriceSuggestion({ itemGroupId: qg.group.id });
        return {
          groupId: qg.group.id,
          name: qg.group.name,
          items: qg.members.map((m) => ({
            itemTypeId: m.item_type_id,
            name: m.name,
            thumbnail: m.thumbnail,
          })),
          avg7d: suggestion.avg7d,
          avg30d: suggestion.avg30d,
        };
      });

      sendToUser(userId, { type: "sniping_item_wizard_data", payload: { items: wizardItems, groups: itemGroups } });
      return true;
    }

    case "get_sniping_transaction_history": {
      const sPage = message.payload?.page ?? 1;
      const sPerPage = message.payload?.perPage ?? 20;
      const { groups, totalMaps } = findSnipingTransactionHistory(userId, { page: sPage, perPage: sPerPage });
      const sTotalPages = Math.max(1, Math.ceil(totalMaps / sPerPage));
      sendToUser(userId, {
        type: "sniping_transaction_history",
        payload: { groups, page: sPage, totalPages: sTotalPages, totalMaps },
      });
      return true;
    }

    case "get_active_sniping_transactions": {
      const activeRows = findActiveSnipingTransactions(userId);
      for (const row of activeRows) {
        sendToUser(userId, {
          type: "sniping_transaction_update",
          payload: { transaction: rowToSnipingTransaction(row) },
        });
      }
      return true;
    }

    default:
      return false;
  }
}
