import { useEffect } from "preact/hooks";
import { selectedMapTypeId, selectedMapMode } from "../../signals/maps.js";
import { MapSelector } from "./MapSelector.js";
import { MapOrderBook } from "./MapOrderBook.js";
import { MapCreateOrder } from "./MapCreateOrder.js";
import { MapsHomeView, MapBackButton } from "./MapsHomeView.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconMap, IconCheckCircle, IconStar } from "../common/Icons.js";
import type { MapOrderMode } from "@mhcm/shared";

export function MapView() {
  const setMode = (newMode: MapOrderMode) => {
    const currentMode = selectedMapMode.value;
    if (currentMode === newMode) return;

    selectedMapMode.value = newMode;

    // Re-subscribe with new mode if a map is selected
    if (selectedMapTypeId.value != null) {
      wsSend({
        type: "unsubscribe_map_order_book",
        payload: { mapTypeId: selectedMapTypeId.value, mode: currentMode },
      });
      wsSend({
        type: "subscribe_map_order_book",
        payload: { mapTypeId: selectedMapTypeId.value, mode: newMode },
      });
    }

    // Reload home data for new mode
    wsSend({ type: "get_map_home_data", payload: { mode: newMode } });
    wsSend({ type: "get_map_favourites", payload: { mode: newMode } });
    wsSend({ type: "get_map_notifications", payload: { mode: newMode } });
  };

  const mode = selectedMapMode.value;

  // Load initial home data, favourites, and notifications on mount
  useEffect(() => {
    wsSend({ type: "get_map_home_data", payload: { mode } });
    wsSend({ type: "get_map_favourites", payload: { mode } });
    wsSend({ type: "get_map_notifications", payload: { mode } });
  }, []); // Empty deps - only on mount

  return (
    <div class="marketplace-view">
      {/* Mode tabs at top */}
      <div class="mode-tabs">
        <button
          type="button"
          class={mode === "unopened" ? "active" : ""}
          onClick={() => setMode("unopened")}
        >
          <IconMap size={14} /> Unopened
        </button>
        <button
          type="button"
          class={mode === "completed" ? "active" : ""}
          onClick={() => setMode("completed")}
        >
          <IconCheckCircle size={14} /> Completed
        </button>
        <button
          type="button"
          class="has-tooltip"
          disabled
        >
          <IconStar size={14} /> Fresh
          <span class="icon-tooltip">Coming in a future update</span>
        </button>
      </div>

      {/* Map selector below mode tabs */}
      <MapSelector />

      {selectedMapTypeId.value ? (
        <>
          <MapOrderBook />
          <MapCreateOrder />
          <MapBackButton />
        </>
      ) : (
        <MapsHomeView />
      )}
    </div>
  );
}
