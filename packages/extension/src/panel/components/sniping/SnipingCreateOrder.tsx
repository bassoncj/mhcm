import { useState, useEffect } from "preact/hooks";
import type { SnipingOrderSide } from "@mhcm/shared";
import {
  selectedMouseTypeId, selectedMouseGroupId,
  selectedItemTypeId, selectedItemGroupId,
  snipingGoalMode, snipingError, snipingOrderBook,
} from "../../signals/sniping.js";
import { sbBalance, activeMaps, availableSb } from "../../signals/game-state.js";
import { allMapTypes } from "../../signals/maps.js";
import { wsSend, refreshAvailableSb } from "../../hooks/useServiceWorker.js";
import { StepperInput } from "../common/StepperInput.js";
import { IconPlus, IconLightbulb, IconCheese } from "../common/Icons.js";
import { ConfirmModal } from "../common/ConfirmModal.js";
import { Callout } from "../common/Callout.js";

export function SnipingCreateOrder() {
  const isItemMode = snipingGoalMode.value === "item";
  const mouseTypeId = selectedMouseTypeId.value;
  const mouseGroupId = selectedMouseGroupId.value;
  const itemTypeId = selectedItemTypeId.value;
  const itemGroupId = selectedItemGroupId.value;
  const goalTypeId = isItemMode ? itemTypeId : mouseTypeId;
  const goalGroupId = isItemMode ? itemGroupId : mouseGroupId;
  const isGroup = goalGroupId != null;
  const [side, setSide] = useState<SnipingOrderSide>("sniper_buy");
  const [price, setPrice] = useState(5);
  const [showConfirm, setShowConfirm] = useState(false);

  // Pre-populate price from 7-day average when order book loads
  const book = snipingOrderBook.value;
  useEffect(() => {
    if (!book?.stats?.priceHistory?.length) return;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const recent = book.stats.priceHistory.filter(
      (p) => p.date >= sevenDaysAgo
    );
    if (recent.length === 0) return;
    const totalWeighted = recent.reduce(
      (sum, p) => sum + p.avgPrice * p.volume,
      0
    );
    const totalVol = recent.reduce((sum, p) => sum + p.volume, 0);
    if (totalVol > 0) {
      setPrice(Math.round(totalWeighted / totalVol));
    }
  }, [book]);

  // Fetch SB balance when switching to buy mode
  useEffect(() => {
    if (side === "sniper_buy") {
      refreshAvailableSb();
    }
  }, [side]);

  if (!goalTypeId && !goalGroupId) return null;

  // Find owned active maps for buy orders (maptain needs a map)
  const ownedMaps = activeMaps.value.filter((m) => m.is_owner);
  const selectedMap = ownedMaps.length > 0 ? ownedMaps[0] : null;
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null);

  const effectiveMapId =
    selectedMapId && ownedMaps.some((m) => m.map_id === selectedMapId)
      ? selectedMapId
      : selectedMap?.map_id ?? null;
  const effectiveMap = ownedMaps.find((m) => m.map_id === effectiveMapId) ?? null;

  const balance = sbBalance.value;
  const available = availableSb.value;
  const insufficientBalance =
    side === "sniper_buy" && balance != null && price > 0 && price > balance;
  const insufficientAvailable =
    side === "sniper_buy" && available != null && price > 0 && price > available;

  const isBuy = side === "sniper_buy";
  const buyRequiresMap = isBuy && ownedMaps.length === 0;

  // Validate goal is on the user's map (buy side only)
  const remainingGoalIds = effectiveMap?.remaining_goals?.map((m) => m.uniqueId) ?? [];
  const mapEnriched = effectiveMap?.remaining_goals != null;
  let goalNotOnMap = false;
  if (isBuy && effectiveMap && mapEnriched) {
    if (isGroup) {
      const members = book?.groupMembers ?? [];
      if (members.length > 0) {
        // groupMembers has mouseTypeId for mouse groups, itemTypeId for item groups
        const memberIds = isItemMode
          ? members.map((m) => (m as any).itemTypeId).filter(Boolean)
          : members.map((m) => m.mouseTypeId).filter(Boolean);
        goalNotOnMap = memberIds.length > 0 && !memberIds.some((id) => remainingGoalIds.includes(id));
      }
    } else if (goalTypeId != null) {
      goalNotOnMap = !remainingGoalIds.includes(goalTypeId);
    }
  }

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (price <= 0) {
      snipingError.value = "Price must be a positive number";
      return;
    }

    if (side === "sniper_buy" && !effectiveMapId) {
      snipingError.value = "No owned map detected";
      return;
    }

    if (side === "sniper_buy" && (insufficientBalance || insufficientAvailable)) {
      snipingError.value = "Insufficient SB balance";
      return;
    }

    if (goalNotOnMap) {
      snipingError.value = isGroup
        ? `None of the ${isItemMode ? "items" : "mice"} in this group are on your map`
        : `This ${isItemMode ? "item" : "mouse"} is not on your map`;
      return;
    }

    setShowConfirm(true);
  };

  const submitOrder = () => {
    const payload: any = {
      side,
      price,
      goalType: isItemMode ? "item" : "mouse",
    };

    if (isItemMode) {
      if (isGroup) {
        payload.itemGroupId = goalGroupId;
      } else {
        payload.itemTypeId = goalTypeId;
      }
    } else {
      if (isGroup) {
        payload.mouseGroupId = goalGroupId;
      } else {
        payload.mouseTypeId = goalTypeId;
      }
    }

    if (side === "sniper_buy" && effectiveMapId) {
      payload.mhMapId = effectiveMapId;
      const mapInfo = activeMaps.value.find((m) => m.map_id === effectiveMapId);
      if (mapInfo?.map_class) {
        payload.mapClass = mapInfo.map_class;
      }
      if (mapInfo?.reward_type) {
        const mt = allMapTypes.value.find((t) => t.mapType === mapInfo.reward_type);
        if (mt?.minRank != null) {
          payload.minRankId = mt.minRank;
        }
      }
    }
    if (side === "sniper_buy" && balance != null) {
      payload.sbBalance = balance;
    }

    wsSend({ type: "create_sniping_order", payload });

    setShowConfirm(false);
  };

  return (
    <form class="create-order" onSubmit={handleSubmit}>
      <h3>Create Sniping Order</h3>
      {snipingError.value && <div class="error">{snipingError.value}</div>}

      <div class="side-toggle">
        <button
          type="button"
          class={side === "sniper_buy" ? "active buy" : ""}
          onClick={() => setSide("sniper_buy")}
        >
          Buy (Maptain)
        </button>
        <button
          type="button"
          class={side === "sniper_sell" ? "active sell" : ""}
          onClick={() => setSide("sniper_sell")}
        >
          Sell (Sniper)
        </button>
      </div>

      {/* Buy-side map + mouse validation callouts */}
      {buyRequiresMap && (
        <Callout variant="warning">No owned map detected. Open a map you own in-game to place buy orders.</Callout>
      )}
      {isBuy && !buyRequiresMap && goalNotOnMap && (
        <Callout variant="error">
          {isGroup
            ? `None of the ${isItemMode ? "items" : "mice"} in this group are on your map`
            : `This ${isItemMode ? "item" : "mouse"} is not on your map`}
        </Callout>
      )}

      {isBuy && !buyRequiresMap && !goalNotOnMap && available == null && (
        <Callout loading>Loading SB balance...</Callout>
      )}
      {isBuy && !buyRequiresMap && !goalNotOnMap && available != null && balance != null && (
        <Callout variant="info">
          {available.toLocaleString()} SB available
          <span class="callout-info-trigger">
            <IconLightbulb size={12} />
            <span class="callout-tooltip">
              {balance.toLocaleString()} total &minus; {(balance - available).toLocaleString()} in open orders
            </span>
          </span>
        </Callout>
      )}

      {isBuy && ownedMaps.length > 1 && (
        <label>
          Select map
          <select
            value={effectiveMapId ?? ""}
            onChange={(e) =>
              setSelectedMapId(parseInt((e.target as HTMLSelectElement).value, 10))
            }
          >
            {ownedMaps.map((m) => (
              <option key={m.map_id} value={m.map_id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <StepperInput
        label="SB"
        icon={<IconCheese size={14} />}
        value={price}
        onChange={setPrice}
        min={1}
        inline
      />

      {isBuy && price > 0 && (
        <div class={`total-cost${insufficientBalance || insufficientAvailable ? " insufficient" : ""}`}>
          Cost: {price.toLocaleString()} SB
          {insufficientBalance && " (insufficient balance)"}
          {!insufficientBalance && insufficientAvailable && " (insufficient available SB)"}
        </div>
      )}

      <button
        type="submit"
        disabled={(isBuy && balance == null) || insufficientBalance || insufficientAvailable || buyRequiresMap || goalNotOnMap}
      >
        <IconPlus size={14} />{" "}
        {isBuy ? "Place Buy Order" : "Place Sell Order"}
      </button>

      {showConfirm && (
        <ConfirmModal
          title={`Confirm ${isBuy ? "Buy" : "Sell"} Order`}
          confirmLabel={isBuy ? "Place Buy Order" : "Place Sell Order"}
          confirmClass={isBuy ? "buy" : "sell"}
          onConfirm={submitOrder}
          onCancel={() => setShowConfirm(false)}
        >
          <div class="order-confirm-details">
            <div class="order-confirm-row">
              <span class="label">Type</span>
              <span class={`value ${isBuy ? "buy" : "sell"}`}>
                {isBuy ? "Buy (Maptain)" : "Sell (Sniper)"}
              </span>
            </div>
            <div class="order-confirm-row">
              <span class="label">Price</span>
              <span class="value">{price.toLocaleString()} SB</span>
            </div>
            {isBuy && selectedMap && (
              <div class="order-confirm-row">
                <span class="label">Map</span>
                <span class="value">{selectedMap.name}</span>
              </div>
            )}
          </div>
        </ConfirmModal>
      )}
    </form>
  );
}
