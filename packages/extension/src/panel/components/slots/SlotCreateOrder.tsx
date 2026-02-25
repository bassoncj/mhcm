import { useState, useRef, useEffect } from "preact/hooks";
import type { OrderSide, OrderTier } from "@mhcm/shared";
import { selectedMapTypeId, orderError, myOrders, mapTypes } from "../../signals/slots.js";
import { sbBalance, activeMaps, availableSb, playerTitleId } from "../../signals/game-state.js";
import { allowAnyGoalCount } from "../../signals/admin.js";
import { wsSend, refreshAvailableSb } from "../../hooks/useServiceWorker.js";
import { StepperInput } from "../common/StepperInput.js";
import { IconPlus, IconChevronDown, IconLightbulb, IconCheese, IconBag, IconListOrdered } from "../common/Icons.js";
import { ConfirmModal } from "../common/ConfirmModal.js";
import { Callout } from "../common/Callout.js";

type SelectableTier = "S" | "A" | "B";
const SELECTABLE_TIERS: SelectableTier[] = ["S", "A", "B"];

const TIER_INFO: Record<SelectableTier, { label: string; description: string }> = {
  S: { label: "S Tier", description: "100% attraction & catch rate" },
  A: { label: "A Tier", description: "100% attraction, imperfect catch" },
  B: { label: "B Tier", description: "Everything else (includes untiered)" },
};

export function CreateOrder() {
  const mapTypeId = selectedMapTypeId.value;
  const [side, setSide] = useState<OrderSide>("buy");
  const [price, setPrice] = useState(5);
  const [quantity, setQuantity] = useState(1);
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
  // For buy orders: which tiers to accept (default: all three)
  const [acceptedTiers, setAcceptedTiers] = useState<Set<SelectableTier>>(new Set(SELECTABLE_TIERS));
  const [tierDropdownOpen, setTierDropdownOpen] = useState(false);
  const tierDropdownRef = useRef<HTMLDivElement>(null);
  // RT (Return Tradables) state
  const [rtEnabled, setRtEnabled] = useState(false);
  const [rtPrice, setRtPrice] = useState(5);
  const [rtOnly, setRtOnly] = useState(false);
  const [isRt, setIsRt] = useState(false);
  // Confirmation modal state
  const [showConfirm, setShowConfirm] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tierDropdownRef.current && !tierDropdownRef.current.contains(e.target as Node)) {
        setTierDropdownOpen(false);
      }
    };
    if (tierDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [tierDropdownOpen]);

  // Fetch SB balance when switching to buy mode
  useEffect(() => {
    if (side === "buy") {
      refreshAvailableSb();
    }
  }, [side]);

  if (!mapTypeId) return null;

  // Look up the selected map type from the catalog to match by reward_type
  const selectedType = mapTypes.value.find((mt) => mt.id === mapTypeId);

  // Find matching maps the user owns for this map type
  const matchingMaps = activeMaps.value.filter(
    (m) => selectedType && m.reward_type && m.reward_type === selectedType.mapType && m.is_owner
      && (!m.goalType || m.goalType === selectedType.goal)
  );

  // Check if maps are detected but not yet enriched (no reward_type yet)
  const hasUnenrichedMaps = activeMaps.value.some((m) => !m.reward_type);

  // Auto-select first matching map if none selected
  const effectiveMapId =
    selectedMapId && matchingMaps.some((m) => m.map_id === selectedMapId)
      ? selectedMapId
      : matchingMaps[0]?.map_id ?? null;

  const selectedMap = matchingMaps.find((m) => m.map_id === effectiveMapId);

  // RT availability
  const supportsRt = selectedType?.supportsRt ?? false;

  const effectivePrice = side === "sell" && rtOnly ? rtPrice : price;
  const totalCost = effectivePrice * quantity;
  const balance = sbBalance.value;
  const available = availableSb.value;
  const insufficientBalance =
    side === "buy" && balance != null && totalCost > 0 && totalCost > balance;
  const insufficientAvailable =
    side === "buy" && available != null && totalCost > 0 && totalCost > available;

  // For sell orders: compute available slots (physical capacity minus already-listed)
  const mapCapacitySlots = selectedMap
    ? (selectedMap.max_hunters ?? 0) -
      (selectedMap.num_active_hunters ?? 0) -
      (selectedMap.invited_hunters?.length ?? 0)
    : 0;

  // Check LM/LL requirement for sell orders (admin can bypass via setting)
  const goalsRemaining = selectedMap?.remaining_goals?.length ?? 0;
  const maxAllowedGoals = selectedType?.lastGoalCount ?? 1;
  const meetsListingRequirement = allowAnyGoalCount.value || (goalsRemaining > 0 && goalsRemaining <= maxAllowedGoals);

  // Subtract slots already listed in active sell orders for this specific map
  const alreadyListedSlots = effectiveMapId
    ? myOrders.value
        .filter(
          (o) =>
            o.mhMapId === effectiveMapId &&
            o.side === "sell" &&
            (o.status === "open" || o.status === "partially_filled")
        )
        .reduce((sum, o) => sum + (o.quantity - o.filledQuantity), 0)
    : 0;

  const availableSlots = Math.max(0, mapCapacitySlots - alreadyListedSlots);

  const hasMatchingMap = side === "sell" && matchingMaps.length > 0 && effectiveMapId != null;
  const canSell = hasMatchingMap && meetsListingRequirement;
  const noSlotsLeft = side === "sell" && canSell && availableSlots === 0;
  const sellDisabled = side === "sell" && (!canSell || noSlotsLeft);
  const quantityOverLimit = side === "sell" && availableSlots > 0 && quantity > availableSlots;
  // True when user has map but doesn't meet LM/L2M
  const hasMapButNotListable = hasMatchingMap && !meetsListingRequirement;

  // For buy orders: must accept at least one tier
  const noTiersSelected = side === "buy" && acceptedTiers.size === 0;

  // Rank check: buyer must meet map's minimum rank
  const playerRank = playerTitleId.value;
  const rankNotMet = side === "buy" && selectedType?.minRank != null
    && (playerRank == null || playerRank < selectedType.minRank);

  const toggleTier = (tier: SelectableTier) => {
    const newSet = new Set(acceptedTiers);
    if (newSet.has(tier)) {
      newSet.delete(tier);
    } else {
      newSet.add(tier);
    }
    setAcceptedTiers(newSet);
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (!(side === "sell" && rtOnly) && price <= 0) {
      orderError.value = "Price must be a positive number";
      return;
    }
    if (quantity <= 0) {
      orderError.value = "Quantity must be a positive number";
      return;
    }

    if (side === "buy" && (insufficientBalance || insufficientAvailable)) {
      orderError.value = `Insufficient SB: need ${totalCost.toLocaleString()}, have ${(available ?? balance ?? 0).toLocaleString()} available`;
      return;
    }

    if (side === "sell") {
      if (!effectiveMapId) {
        orderError.value = "No matching map detected";
        return;
      }
      if (availableSlots < quantity) {
        orderError.value = `Only ${availableSlots} slot${availableSlots !== 1 ? "s" : ""} available`;
        return;
      }
      // RT validation for sell orders
      if (rtEnabled && rtPrice <= 0) {
        orderError.value = "RT price must be a positive number";
        return;
      }
    }

    // Show confirmation modal
    setShowConfirm(true);
  };

  const submitOrder = () => {
    const payload: any = {
      mapTypeId,
      side,
      price: side === "sell" && rtOnly ? 0 : price,
      quantity,
    };

    if (side === "sell" && selectedMap) {
      payload.mhMapId = effectiveMapId;
      // Include remaining goals for tier calculation
      if (selectedMap.remaining_goals) {
        payload.remainingGoals = selectedMap.remaining_goals;
      }
      // RT fields
      if (rtEnabled) {
        payload.rtPrice = rtPrice;
        payload.rtOnly = rtOnly;
      }
    }

    if (side === "buy") {
      // Include accepted tiers (convert Set to array)
      // If all tiers selected, send null to mean "accept all"
      if (acceptedTiers.size === SELECTABLE_TIERS.length) {
        payload.acceptedTiers = null;
      } else {
        // B tier also matches untiered (null) orders for backwards compatibility
        const tiersToSend: OrderTier[] = Array.from(acceptedTiers);
        if (acceptedTiers.has("B")) {
          tiersToSend.push(null);
        }
        payload.acceptedTiers = tiersToSend;
      }
    }

    if (side === "buy" && balance != null) {
      payload.sbBalance = balance;
    }

    // RT flag for buy orders
    if (side === "buy" && isRt) {
      payload.isRt = true;
    }

    wsSend({ type: "create_order", payload });

    // Reset form and close modal
    setPrice(5);
    setQuantity(1);
    setRtEnabled(false);
    setRtPrice(5);
    setRtOnly(false);
    setIsRt(false);
    setShowConfirm(false);
  };

  return (
    <form class="create-order" onSubmit={handleSubmit}>
      <h3>Create Order</h3>
      {orderError.value && <div class="error">{orderError.value}</div>}

      <div class="side-toggle">
        <button
          type="button"
          class={side === "buy" ? "active buy" : ""}
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
      {side === "buy" && available == null && (
        <Callout loading>Loading SB balance...</Callout>
      )}
      {side === "buy" && available != null && balance != null && (
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
      {rankNotMet && (
        <Callout variant="warning">
          Your rank does not meet the minimum requirement ({selectedType?.minRankName ?? "Unknown"}) for this map type
        </Callout>
      )}

      {/* Sell-side callouts */}
      {side === "sell" && matchingMaps.length === 0 && (
        hasUnenrichedMaps
          ? <Callout loading>Detecting your maps...</Callout>
          : <Callout variant="warning">No matching map detected. Open a map of this type in-game to sell slots.</Callout>
      )}

      {side === "sell" && hasMapButNotListable && (
        goalsRemaining === 0
          ? <Callout variant="error">Map is complete. No goals remaining.</Callout>
          : <Callout variant="warning">
              {(() => { const p = selectedType?.goal === "item" ? "I" : "M"; return maxAllowedGoals === 1 ? `L${p}` : `L${maxAllowedGoals}${p}`; })()} conditions not met – {goalsRemaining} remaining
            </Callout>
      )}

      {side === "sell" && canSell && (
        availableSlots === 0
          ? <Callout variant="warning">All slots already listed</Callout>
          : <Callout variant="info">{availableSlots} slot{availableSlots !== 1 ? "s" : ""} available</Callout>
      )}

      {side === "sell" && matchingMaps.length > 1 && meetsListingRequirement && (
        <label>
          Select map
          <select
            value={effectiveMapId ?? ""}
            onChange={(e) =>
              setSelectedMapId(parseInt((e.target as HTMLSelectElement).value, 10))
            }
          >
            {matchingMaps.map((m) => {
              const capacity =
                (m.max_hunters ?? 0) -
                (m.num_active_hunters ?? 0) -
                (m.invited_hunters?.length ?? 0);
              const listed = myOrders.value
                .filter(
                  (o) =>
                    o.mhMapId === m.map_id &&
                    o.side === "sell" &&
                    (o.status === "open" || o.status === "partially_filled")
                )
                .reduce((sum, o) => sum + (o.quantity - o.filledQuantity), 0);
              const slots = Math.max(0, capacity - listed);
              return (
                <option key={m.map_id} value={m.map_id}>
                  {m.name} ({slots} slot{slots !== 1 ? "s" : ""} available)
                </option>
              );
            })}
          </select>
        </label>
      )}

      <StepperInput
        label="SB"
        icon={<IconCheese size={14} />}
        value={side === "sell" && rtOnly ? 0 : price}
        onChange={setPrice}
        min={1}
        disabled={side === "sell" && rtOnly}
        inline
        suffix={supportsRt ? (
          <div
            class="rt-toggle-suffix"
            title={side === "buy" ? "I agree to return all tradable chest items to the seller after map completion" : undefined}
          >
            <label class="toggle-switch-sm">
              <input
                type="checkbox"
                checked={side === "sell" ? rtEnabled : isRt}
                disabled={side === "sell" && rtOnly}
                onChange={() => {
                  if (side === "sell") {
                    setRtEnabled(!rtEnabled);
                    if (rtEnabled) setRtOnly(false);
                  } else {
                    setIsRt(!isRt);
                  }
                }}
              />
              <span class="toggle-slider" />
            </label>
            <span class="rt-toggle-label">RT</span>
          </div>
        ) : undefined}
      />

      {side === "sell" && rtEnabled && (
        <StepperInput
          label="RT SB"
          icon={<IconBag size={14} />}
          value={rtPrice}
          onChange={setRtPrice}
          min={1}
          inline
          suffix={
            <div class="rt-toggle-suffix">
              <label class="toggle-switch-sm">
                <input
                  type="checkbox"
                  checked={rtOnly}
                  onChange={() => setRtOnly(!rtOnly)}
                />
                <span class="toggle-slider" />
              </label>
              <span class="rt-toggle-label">RT</span>
              <span class="rt-toggle-label">only</span>
            </div>
          }
        />
      )}

      {side === "sell" && rtEnabled && !rtOnly && rtPrice >= price && price > 0 && (
        <Callout variant="warning">RT price is not lower than regular price</Callout>
      )}

      <StepperInput
        label="Qty"
        icon={<IconListOrdered size={14} />}
        value={quantity}
        onChange={(v) => {
          if (side === "sell" && availableSlots > 0 && v > availableSlots) {
            setQuantity(availableSlots);
          } else {
            setQuantity(v);
          }
        }}
        min={1}
        max={side === "sell" && availableSlots > 0 ? availableSlots : undefined}
        inline
      />

      {side === "buy" && (
        <div class="tier-selector" ref={tierDropdownRef}>
          <span class="tier-selector-label">{selectedType?.goal === "item" ? "Last item" : "Last mouse"} conditions:</span>
          <button
            type="button"
            class={`tier-dropdown-trigger${tierDropdownOpen ? " open" : ""}${noTiersSelected ? " error" : ""}`}
            onClick={() => setTierDropdownOpen(!tierDropdownOpen)}
          >
            <span class="tier-dropdown-value">
              {acceptedTiers.size === 0 ? (
                <span class="tier-dropdown-placeholder">Select tiers...</span>
              ) : acceptedTiers.size === SELECTABLE_TIERS.length ? (
                <span class="tier-dropdown-all">All tiers</span>
              ) : (
                <span class="tier-dropdown-selected">
                  {SELECTABLE_TIERS.filter((t) => acceptedTiers.has(t)).map((tier) => (
                    <span key={tier} class={`tier-badge-inline tier-${tier.toLowerCase()}`}>
                      {tier}
                    </span>
                  ))}
                </span>
              )}
            </span>
            <IconChevronDown size={14} />
          </button>
          {tierDropdownOpen && (
            <div class="tier-dropdown-menu">
              {SELECTABLE_TIERS.map((tier) => (
                <label key={tier} class="tier-dropdown-option">
                  <div class="tier-option-col-a">
                    <input
                      type="checkbox"
                      checked={acceptedTiers.has(tier)}
                      onChange={() => toggleTier(tier)}
                    />
                  </div>
                  <div class="tier-option-col-b">
                    <div class="tier-option-row1">
                      <span class={`tier-badge-option tier-${tier.toLowerCase()}`}>{tier}</span>
                      <span class="tier-option-label">{TIER_INFO[tier].label}</span>
                    </div>
                    <div class="tier-option-row2">{TIER_INFO[tier].description}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
          {noTiersSelected && (
            <div class="tier-error">Select at least one tier</div>
          )}
        </div>
      )}

      {totalCost > 0 && (
        <div class={`total-cost${side === "buy" && (insufficientBalance || insufficientAvailable) ? " insufficient" : ""}`}>
          Total: {totalCost.toLocaleString()} SB
          {side === "buy" && (insufficientBalance || insufficientAvailable) && " (insufficient)"}
        </div>
      )}

      <button type="submit" disabled={(side === "buy" && sbBalance.value == null) || insufficientBalance || insufficientAvailable || sellDisabled || quantityOverLimit || noTiersSelected || rankNotMet}>
        <IconPlus size={14} /> {side === "buy" ? "Place Buy Order" : "Place Sell Order"}
      </button>

      {showConfirm && (
        <ConfirmModal
          title={`Confirm ${side === "buy" ? "Buy" : "Sell"} Order`}
          confirmLabel={side === "buy" ? "Place Buy Order" : "Place Sell Order"}
          confirmClass={side}
          onConfirm={submitOrder}
          onCancel={() => setShowConfirm(false)}
        >
          <div class="order-confirm-details">
            <div class="order-confirm-row">
              <span class="label">Type</span>
              <span class={`value ${side}`}>{side === "buy" ? "Buy" : "Sell"}</span>
            </div>
            <div class="order-confirm-row">
              <span class="label">Map</span>
              <span class="value">{selectedType?.displayName ?? "Unknown"}</span>
            </div>
            <div class="order-confirm-row">
              <span class="label">Price</span>
              <span class="value">
                {side === "sell" && rtOnly
                  ? <span class="rt-price-text">{rtPrice.toLocaleString()} SB per slot (RT Only)</span>
                  : `${price.toLocaleString()} SB per slot`}
              </span>
            </div>
            {side === "sell" && rtEnabled && !rtOnly && (
              <div class="order-confirm-row">
                <span class="label">RT SB</span>
                <span class="value rt-price-text">{rtPrice.toLocaleString()} SB per slot</span>
              </div>
            )}
            {side === "buy" && isRt && (
              <div class="order-confirm-row">
                <span class="label">RT</span>
                <span class="value rt-price-text">Will return tradable items</span>
              </div>
            )}
            <div class="order-confirm-row">
              <span class="label">Quantity</span>
              <span class="value">{quantity} slot{quantity !== 1 ? "s" : ""}</span>
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
