import {
  selectedMouseTypeId, selectedMouseGroupId, selectedMouseInfo,
  selectedItemTypeId, selectedItemGroupId, selectedItemInfo,
  snipingGoalMode, snipingOrderBook, snipingHomeData,
} from "../../signals/sniping.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconMouse, IconLootBag } from "../common/Icons.js";
import { SnipingMouseSelector } from "./SnipingMouseSelector.js";
import { SnipingItemSelector } from "./SnipingItemSelector.js";
import { SnipingOrderBook } from "./SnipingOrderBook.js";
import { SnipingCreateOrder } from "./SnipingCreateOrder.js";
import { SnipingHomeView, SnipingBackButton } from "./SnipingHomeView.js";
import { SnipingWizard } from "./SnipingWizard.js";
import type { GoalType } from "@mhcm/shared";

function unsubscribeCurrent() {
  if (selectedMouseTypeId.value) {
    wsSend({ type: "unsubscribe_sniping_order_book", payload: { mouseTypeId: selectedMouseTypeId.value } });
  } else if (selectedMouseGroupId.value) {
    wsSend({ type: "unsubscribe_sniping_order_book", payload: { mouseGroupId: selectedMouseGroupId.value } });
  } else if (selectedItemTypeId.value) {
    wsSend({ type: "unsubscribe_sniping_order_book", payload: { itemTypeId: selectedItemTypeId.value } });
  } else if (selectedItemGroupId.value) {
    wsSend({ type: "unsubscribe_sniping_order_book", payload: { itemGroupId: selectedItemGroupId.value } });
  }
}

export function SnipingView() {
  const mode = snipingGoalMode.value;
  const hasMouseSelection = selectedMouseTypeId.value || selectedMouseGroupId.value;
  const hasItemSelection = selectedItemTypeId.value || selectedItemGroupId.value;
  const hasSelection = mode === "mouse" ? hasMouseSelection : hasItemSelection;

  const setMode = (newMode: GoalType) => {
    if (newMode === snipingGoalMode.value) return;

    // Unsubscribe from current order book
    unsubscribeCurrent();

    // Clear selection for the old mode
    selectedMouseTypeId.value = null;
    selectedMouseGroupId.value = null;
    selectedMouseInfo.value = null;
    selectedItemTypeId.value = null;
    selectedItemGroupId.value = null;
    selectedItemInfo.value = null;
    snipingOrderBook.value = null;

    snipingGoalMode.value = newMode;

    // Load home data for new mode
    snipingHomeData.value = null;
    wsSend({ type: "get_sniping_home_data", payload: { goalType: newMode } });
    wsSend({ type: "get_sniping_favourites" });
  };

  return (
    <div class="marketplace-view">
      <div class="mode-tabs">
        <button
          type="button"
          class={mode === "mouse" ? "active" : ""}
          onClick={() => setMode("mouse")}
        >
          <IconMouse size={14} /> Mice
        </button>
        <button
          type="button"
          class={mode === "item" ? "active" : ""}
          onClick={() => setMode("item")}
        >
          <IconLootBag size={14} /> Items
        </button>
      </div>

      <div class="selector-row">
        {mode === "mouse" ? <SnipingMouseSelector /> : <SnipingItemSelector />}
        <SnipingWizard />
      </div>
      {hasSelection ? (
        <>
          <SnipingOrderBook />
          <SnipingCreateOrder />
          <SnipingBackButton />
        </>
      ) : (
        <SnipingHomeView />
      )}
    </div>
  );
}
