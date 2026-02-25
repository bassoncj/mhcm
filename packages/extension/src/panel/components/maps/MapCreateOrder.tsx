import { useState, useEffect } from "preact/hooks";
import type { OrderTier } from "@mhcm/shared";
import { selectedMapTypeId, selectedMapMode, mapOrderBook, allMapTypes, myMapOrders, sellMapTier, sellMapTierLoading } from "../../signals/maps.js";
import { sbBalance, activeMaps, playerIdentity, availableSb, playerTitleId } from "../../signals/game-state.js";
import { wsSend, refreshAvailableSb, sendToWorker } from "../../hooks/useServiceWorker.js";
import { StepperInput } from "../common/StepperInput.js";
import { IconPlus, IconLightbulb, IconCheese, IconListOrdered } from "../common/Icons.js";
import { ConfirmModal } from "../common/ConfirmModal.js";
import { Callout } from "../common/Callout.js";

export function MapCreateOrder() {
  const book = mapOrderBook.value;
  const mapTypeId = selectedMapTypeId.value;
  const mode = selectedMapMode.value;
  const balance = sbBalance.value;
  const available = availableSb.value;

  // Get full MapType object for scroll info and rank requirements
  const mapType = allMapTypes.value.find(m => m.id === mapTypeId);

  const [side, setSide] = useState<"sell" | "buy">("buy");
  const [price, setPrice] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [tier, setTier] = useState<OrderTier | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sell-side: scroll inventory state
  const [scrollInventory, setScrollInventory] = useState<number | null>(null);
  const [scrollInventoryLoading, setScrollInventoryLoading] = useState(false);

  const isBuy = side === "buy";

  // Fetch SB balance when switching to buy mode
  useEffect(() => {
    if (isBuy) {
      refreshAvailableSb();
    }
  }, [isBuy]);

  // Fetch scroll inventory when selling unopened maps
  useEffect(() => {
    if (side !== "sell" || mode !== "unopened" || !mapType?.scrollItemType) {
      setScrollInventory(null);
      return;
    }

    const uh = playerIdentity.value?.uniqueHash;
    if (!uh) return;

    setScrollInventoryLoading(true);
    sendToWorker({
      type: "execute_api_via_content",
      payload: { method: "getItemQuantity", args: [uh, mapType.scrollItemType] },
    })
      .then((result) => {
        if (result?.success && typeof result.data === "number") {
          setScrollInventory(result.data);
        } else {
          setScrollInventory(null);
        }
      })
      .catch(() => setScrollInventory(null))
      .finally(() => setScrollInventoryLoading(false));
  }, [side, mode, mapType?.scrollItemType]);

  if (!book || !mapTypeId || !mapType) return null;

  // Find matching map for sell completed orders
  const matchingMaps = activeMaps.value.filter(
    (m) => mapType && m.reward_type && m.reward_type === mapType.mapType && m.is_owner
      && (!m.goalType || m.goalType === mapType.goal)
  );
  const currentMap = matchingMaps[0];

  // Check LM/LL condition for sell completed
  const goalsRemaining = currentMap?.remaining_goals?.length ?? 0;
  const maxAllowedGoals = mapType.lastGoalCount;
  const lmSatisfied = goalsRemaining > 0 && goalsRemaining <= maxAllowedGoals;
  const goalPrefix = mapType.goal === "item" ? "I" : "M";
  const lmLabel = maxAllowedGoals === 1 ? `L${goalPrefix}` : `L${maxAllowedGoals}${goalPrefix}`;

  // Request tier from server when sell completed + LM satisfied
  const tierValue = sellMapTier.value;
  const tierLoading = sellMapTierLoading.value;

  useEffect(() => {
    if (side !== "sell" || mode !== "completed" || !lmSatisfied || !currentMap?.remaining_goals) {
      sellMapTier.value = null;
      sellMapTierLoading.value = false;
      return;
    }

    const goalIds = currentMap.remaining_goals.map(g => g.uniqueId);
    sellMapTier.value = null;
    sellMapTierLoading.value = true;
    wsSend({ type: "get_map_tier", payload: { mapTypeId, goalIds } });
  }, [side, mode, lmSatisfied, mapTypeId, currentMap?.remaining_goals?.length]);

  // Sell unopened: compute available scrolls (subtract open sell orders)
  const openScrollSellQty = myMapOrders.value
    .filter(o => o.mapTypeId === mapTypeId && o.side === "sell"
      && o.mode === "unopened"
      && (o.status === "open" || o.status === "partially_filled"))
    .reduce((sum, o) => sum + (o.quantity - o.filledQuantity), 0);
  const availableScrolls = scrollInventory != null ? Math.max(0, scrollInventory - openScrollSellQty) : null;

  // Rank check: sell unopened + buy orders (NULL rank = conservative block)
  const playerRank = playerTitleId.value;
  const rankNotMet = mapType.minRank != null && (playerRank == null || playerRank < mapType.minRank);

  const totalCost = price * quantity;

  // Buy order validation
  const insufficientBalance = isBuy && balance != null && totalCost > balance;
  const insufficientAvailable = isBuy && available != null && totalCost > available;

  // Sell unopened validation (using availableScrolls)
  const scrollInventoryKnown = side === "sell" && mode === "unopened" && availableScrolls !== null;
  const noScrolls = scrollInventoryKnown && scrollInventory === 0;
  const allScrollsListed = scrollInventoryKnown && scrollInventory! > 0 && availableScrolls === 0;
  const quantityOverScrollInventory = scrollInventoryKnown && quantity > availableScrolls!;

  // Sell completed validation
  const noMatchingMap = side === "sell" && mode === "completed" && !currentMap;
  const lmNotSatisfied = side === "sell" && mode === "completed" && currentMap && !lmSatisfied;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    setError(null);

    if (price < 1) {
      setError("Price must be at least 1 SB");
      return;
    }
    if (quantity < 1) {
      setError("Quantity must be at least 1");
      return;
    }
    if (isBuy && balance == null) {
      setError("SB balance not available - cannot validate order");
      return;
    }
    if (isBuy && (insufficientBalance || insufficientAvailable)) {
      setError("Insufficient SB balance");
      return;
    }
    if (isBuy && rankNotMet) return;
    if (side === "sell" && mode === "unopened" && rankNotMet) return;
    if (side === "sell" && mode === "unopened" && (noScrolls || allScrollsListed || quantityOverScrollInventory)) {
      setError(noScrolls ? "You don't have any scrolls" : allScrollsListed ? "All scrolls already listed" : `Only ${availableScrolls} scrolls available`);
      return;
    }
    if (side === "sell" && mode === "completed" && (noMatchingMap || lmNotSatisfied)) return;

    setShowConfirm(true);
  };

  const submitOrder = () => {
    const payload: Record<string, unknown> = {
      mapTypeId,
      mode,
      side,
      price,
      quantity,
      tier: isBuy && mode === "completed" ? tier : null,
    };
    if (isBuy && balance != null) {
      payload.sbBalance = balance;
    }
    if (!isBuy && mode === "completed" && currentMap) {
      payload.mhMapId = currentMap.map_id;
      if (currentMap.remaining_goals) {
        payload.remainingGoals = currentMap.remaining_goals;
      }
    }
    wsSend({ type: "create_map_order", payload });

    // Reset form
    setPrice(price);
    setQuantity(1);
    setTier(null);
    setShowConfirm(false);
    setError(null);
  };

  const submitDisabled =
    (isBuy && balance == null) ||
    insufficientBalance ||
    insufficientAvailable ||
    noScrolls ||
    allScrollsListed ||
    quantityOverScrollInventory ||
    noMatchingMap ||
    lmNotSatisfied ||
    (rankNotMet && (isBuy || (side === "sell" && mode === "unopened"))) ||
    (side === "sell" && mode === "unopened" && scrollInventoryLoading);

  return (
    <form class="create-order" onSubmit={handleSubmit}>
      <h3>Place Order</h3>
      {error && <div class="error">{error}</div>}

      {/* Side toggle */}
      <div class="side-toggle">
        <button
          type="button"
          class={isBuy ? "active buy" : ""}
          onClick={() => setSide("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          class={side === "sell" ? "active sell" : ""}
          onClick={() => setSide("sell")}
        >
          Sell
        </button>
      </div>

      {/* Available SB (buy side only) */}
      {isBuy && available == null && (
        <Callout loading>Loading SB balance...</Callout>
      )}
      {isBuy && available != null && balance != null && (
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
      {isBuy && rankNotMet && (
        <Callout variant="warning">
          Your rank does not meet the minimum requirement ({mapType.minRankName ?? "Unknown"}) for this map type
        </Callout>
      )}

      {/* Sell completed mode callout */}
      {side === "sell" && mode === "completed" && (() => {
        if (!currentMap) {
          return <Callout variant="error">No matching map detected. Open a map of this type in-game to sell.</Callout>;
        }
        if (goalsRemaining === 0) {
          return <Callout variant="error">Map is complete. No goals remaining.</Callout>;
        }
        if (!lmSatisfied) {
          return <Callout variant="warning">{lmLabel} conditions not met &ndash; {goalsRemaining} remaining</Callout>;
        }
        if (tierLoading || tierValue == null) {
          return <Callout loading>Computing tier...</Callout>;
        }
        return <Callout variant="info">Tier {tierValue}</Callout>;
      })()}

      {/* Sell unopened mode callout */}
      {side === "sell" && mode === "unopened" && (() => {
        if (!mapType.scrollItemType) {
          return <Callout variant="error">No matching scrolls configured for this map type.</Callout>;
        }
        if (rankNotMet) {
          return <Callout variant="warning">You do not meet rank requirements &ndash; {mapType.minRankName} or higher</Callout>;
        }
        if (scrollInventoryLoading) {
          return <Callout loading>Checking scroll inventory...</Callout>;
        }
        if (noScrolls) {
          return <Callout variant="warning">You have no scrolls in inventory</Callout>;
        }
        if (allScrollsListed) {
          return <Callout variant="warning">All scrolls already listed</Callout>;
        }
        if (availableScrolls != null) {
          return <Callout variant="info">You have {availableScrolls.toLocaleString()} scrolls available</Callout>;
        }
        return null;
      })()}

      {/* Tier selector (buy completed mode only) */}
      {isBuy && mode === "completed" && (
        <div class="form-field">
          <label>Tiers</label>
          <div class="tier-pills">
            <button
              type="button"
              class={`pill${tier === null ? " active" : ""}`}
              onClick={() => setTier(null)}
            >
              Any
            </button>
            {(["S", "A", "B"] as const).map((t) => (
              <button
                type="button"
                key={t}
                class={`pill${tier === t ? " active" : ""}`}
                onClick={() => setTier(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Price input */}
      <StepperInput label="SB" icon={<IconCheese size={14} />} value={price} onChange={setPrice} min={1} inline />

      {/* Quantity input */}
      <StepperInput
          label="Qty"
          icon={<IconListOrdered size={14} />}
          value={side === "sell" && mode === "completed" ? 1 : quantity}
          onChange={
            side === "sell" && mode === "completed"
              ? () => {}
              : (v) => {
                  if (scrollInventoryKnown && v > availableScrolls!) {
                    setQuantity(availableScrolls!);
                  } else {
                    setQuantity(v);
                  }
                }
          }
          min={1}
          max={
            side === "sell" && mode === "completed"
              ? 1
              : scrollInventoryKnown
                ? availableScrolls!
                : undefined
          }
          inline
        />

      {/* Total cost */}
      {totalCost > 0 && (
        <div class={`total-cost${isBuy && (insufficientBalance || insufficientAvailable) ? " insufficient" : ""}`}>
          Total: {totalCost.toLocaleString()} SB
          {isBuy && insufficientBalance && " (insufficient balance)"}
          {isBuy && !insufficientBalance && insufficientAvailable && " (insufficient available SB)"}
        </div>
      )}

      {/* Submit button */}
      <button type="submit" disabled={submitDisabled}>
        <IconPlus size={14} /> {isBuy ? "Place Buy Order" : "Place Sell Order"}
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
              <span class={`value ${side}`}>{isBuy ? "Buy" : "Sell"}</span>
            </div>
            <div class="order-confirm-row">
              <span class="label">Map</span>
              <span class="value">{mapType.displayName}</span>
            </div>
            <div class="order-confirm-row">
              <span class="label">Mode</span>
              <span class="value">{mode === "unopened" ? "Unopened" : "Completed"}</span>
            </div>
            {isBuy && mode === "completed" && (
              <div class="order-confirm-row">
                <span class="label">Tier</span>
                <span class="value">{tier ?? "Any"}</span>
              </div>
            )}
            <div class="order-confirm-row">
              <span class="label">Price</span>
              <span class="value">{price.toLocaleString()} SB per map</span>
            </div>
            <div class="order-confirm-row">
              <span class="label">Quantity</span>
              <span class="value">{quantity.toLocaleString()} map{quantity !== 1 ? "s" : ""}</span>
            </div>
            <div class="order-confirm-total">
              <span class="label">Total</span>
              <span class="value">{totalCost.toLocaleString()} SB</span>
            </div>
          </div>
        </ConfirmModal>
      )}
    </form>
  );
}
