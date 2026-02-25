import type { ServerMessage } from "@mhcm/shared";
import {
  snipingOrderBook,
  mySnipingOrders,
  activeSnipingTransactions,
  mouseSearchResults,
  itemSearchResults,
  snipingHomeData,
  snipingFavourites,
  mouseListPage,
  itemListPage,
  snipingWizardData,
  snipingItemWizardData,
  snipingHistory,
  snipingHistoryPage,
  snipingHistoryTotalPages,
  snipingHistoryTotalMaps,
  recentlyFailedSnipingTxns,
  snipingPaymentPenalties,
} from "../../signals/sniping.js";
import { showToast } from "../../signals/toast.js";
import { wsSend } from "../useServiceWorker.js";

export function handleSnipingMessage(message: ServerMessage): boolean {
  switch (message.type) {
    case "sniping_order_book_snapshot":
      snipingOrderBook.value = message.payload;
      return true;

    case "sniping_order_created":
      mySnipingOrders.value = [...mySnipingOrders.value, message.payload.order];
      showToast("Sniping order created");
      return true;

    case "sniping_order_cancelled":
      mySnipingOrders.value = mySnipingOrders.value.filter(
        (o) => o.id !== message.payload.orderId,
      );
      showToast("Sniping order cancelled");
      return true;

    case "my_sniping_orders":
      mySnipingOrders.value = message.payload.orders;
      return true;

    case "mouse_search_results":
      mouseSearchResults.value = message.payload.mice;
      return true;

    case "item_search_results":
      itemSearchResults.value = message.payload.items;
      return true;

    case "sniping_transaction_update": {
      const snipeTxn = message.payload.transaction;
      const isTerminal = snipeTxn.state === "completed" || snipeTxn.state === "failed";
      if (isTerminal) {
        // Remove from active list
        activeSnipingTransactions.value = activeSnipingTransactions.value.filter(
          (t) => t.id !== snipeTxn.id,
        );
        wsSend({ type: "get_sniping_transaction_history", payload: { page: snipingHistoryPage.value, perPage: 15 } });
        // Show failed transactions briefly so the user knows what happened
        if (snipeTxn.state === "failed") {
          recentlyFailedSnipingTxns.value = [...recentlyFailedSnipingTxns.value, snipeTxn];
          setTimeout(() => {
            recentlyFailedSnipingTxns.value = recentlyFailedSnipingTxns.value.filter(
              (t) => t.id !== snipeTxn.id,
            );
          }, 10_000);
          showToast(snipeTxn.failureReason || "Sniping transaction failed", "error");
        }
      } else {
        // Upsert: update existing or add new
        const idx = activeSnipingTransactions.value.findIndex((t) => t.id === snipeTxn.id);
        if (idx >= 0) {
          const updated = [...activeSnipingTransactions.value];
          updated[idx] = snipeTxn;
          activeSnipingTransactions.value = updated;
        } else {
          activeSnipingTransactions.value = [...activeSnipingTransactions.value, snipeTxn];
        }
      }
      // Always refresh orders so status changes (open → matched) are reflected
      wsSend({ type: "get_my_sniping_orders" });
      return true;
    }

    case "sniping_mouse_caught": {
      const txnId = message.payload.transactionId;
      const mouseId = message.payload.mouseTypeId;
      const idx = activeSnipingTransactions.value.findIndex((t) => t.id === txnId);
      if (idx >= 0) {
        const updated = [...activeSnipingTransactions.value];
        updated[idx] = {
          ...updated[idx],
          mice: updated[idx].mice.map((m) =>
            m.mouseTypeId === mouseId ? { ...m, caught: true } : m,
          ),
        };
        activeSnipingTransactions.value = updated;
      }
      return true;
    }

    case "sniping_item_found": {
      const itemTxnId = message.payload.transactionId;
      const itemId = message.payload.itemTypeId;
      const itemIdx = activeSnipingTransactions.value.findIndex((t) => t.id === itemTxnId);
      if (itemIdx >= 0) {
        const updated = [...activeSnipingTransactions.value];
        updated[itemIdx] = {
          ...updated[itemIdx],
          items: (updated[itemIdx].items || []).map((i) =>
            i.itemTypeId === itemId ? { ...i, found: true } : i,
          ),
        };
        activeSnipingTransactions.value = updated;
      }
      return true;
    }

    case "sniping_home_data":
      snipingHomeData.value = message.payload;
      return true;

    case "sniping_favourites":
      snipingFavourites.value = message.payload.favourites.map(
        (f: { goalType: string; goalId: number }) => {
          switch (f.goalType) {
            case "mouse": return { mouseTypeId: f.goalId };
            case "mouse_group": return { mouseGroupId: f.goalId };
            case "item": return { itemTypeId: f.goalId };
            case "item_group": return { itemGroupId: f.goalId };
            default: return { mouseTypeId: f.goalId };
          }
        },
      );
      return true;

    case "mouse_list":
      mouseListPage.value = { mice: message.payload.mice, hasMore: message.payload.hasMore };
      return true;

    case "item_list":
      itemListPage.value = { items: message.payload.items, hasMore: message.payload.hasMore };
      return true;

    case "sniping_wizard_data":
      snipingWizardData.value = { mice: message.payload.mice, groups: message.payload.groups };
      return true;

    case "sniping_item_wizard_data":
      snipingItemWizardData.value = { items: message.payload.items, groups: message.payload.groups };
      return true;

    case "sniping_transaction_history":
      snipingHistory.value = message.payload.groups;
      snipingHistoryPage.value = message.payload.page;
      snipingHistoryTotalPages.value = message.payload.totalPages;
      snipingHistoryTotalMaps.value = message.payload.totalMaps;
      return true;

    case "sniping_payment_grace": {
      const grace = message.payload;
      // Upsert by transactionId
      const existing = snipingPaymentPenalties.value;
      const graceIdx = existing.findIndex((p) => p.transactionId === grace.transactionId);
      if (graceIdx >= 0) {
        const updated = [...existing];
        updated[graceIdx] = grace;
        snipingPaymentPenalties.value = updated;
      } else {
        snipingPaymentPenalties.value = [...existing, grace];
      }
      showToast(`Insufficient SB – you need ${grace.requiredAmount.toLocaleString()} SB to pay your sniper. You have 24 hours to get the SB.`, "error");
      return true;
    }

    case "sniping_payment_resolved": {
      const { transactionId, resolution } = message.payload;
      snipingPaymentPenalties.value = snipingPaymentPenalties.value.filter(
        (p) => p.transactionId !== transactionId,
      );
      if (resolution === "paid") {
        showToast("Sniping payment completed successfully");
      } else {
        showToast("Account suspended – failed to pay sniper within grace period", "error");
      }
      return true;
    }

    default:
      return false;
  }
}
