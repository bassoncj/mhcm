import { useState, useEffect } from "preact/hooks";
import type { ItemOrderSide } from "@mhcm/shared";
import { getItemMoq, itemSbTotal, isWholeTotal, formatItemPrice } from "@mhcm/shared";
import { selectedItemTypeId, selectedItemInfo, itemOrderBook, myItemOrders } from "../../signals/items.js";
import { sbBalance, playerIdentity, availableSb } from "../../signals/game-state.js";
import { wsSend, sendToWorker, refreshAvailableSb } from "../../hooks/useServiceWorker.js";
import { StepperInput } from "../common/StepperInput.js";
import { IconPlus, IconLightbulb, IconCheese, IconListOrdered } from "../common/Icons.js";
import { ConfirmModal } from "../common/ConfirmModal.js";
import { Callout } from "../common/Callout.js";

export function ItemCreateOrder() {
  const itemTypeId = selectedItemTypeId.value;
  const info = selectedItemInfo.value;
  const [side, setSide] = useState<ItemOrderSide>("buy");
  const [price, setPrice] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sell-side inventory state
  const [inventory, setInventory] = useState<number | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // Pre-populate price from 7-day average when order book loads
  const book = itemOrderBook.value;
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
      const avg = Math.round((totalWeighted / totalVol) * 10) / 10;
      if (avg >= 0.1) setPrice(avg);
    }
  }, [book]);

  // Snap quantity to valid MOQ multiple when price changes
  useEffect(() => {
    const m = getItemMoq(price);
    if (quantity % m !== 0) {
      setQuantity(Math.max(m, Math.round(quantity / m) * m));
    }
  }, [price]);

  // Fetch inventory when switching to sell mode or when item changes
  useEffect(() => {
    if (side !== "sell" || !info) {
      setInventory(null);
      return;
    }

    const uh = playerIdentity.value?.uniqueHash;
    if (!uh) return;

    setInventoryLoading(true);
    sendToWorker({
      type: "execute_api_via_content",
      payload: { method: "getItemQuantity", args: [uh, info.type] },
    })
      .then((result) => {
        if (result?.success && typeof result.data === "number") {
          setInventory(result.data);
        } else {
          setInventory(null);
        }
      })
      .catch(() => setInventory(null))
      .finally(() => setInventoryLoading(false));
  }, [side, info?.type]);

  // Fetch SB balance when switching to buy mode
  useEffect(() => {
    if (side === "buy") {
      refreshAvailableSb();
    }
  }, [side]);

  if (!itemTypeId || !info) return null;

  const moq = getItemMoq(price);
  const totalCost = itemSbTotal(price, quantity);
  const wholeTotal = isWholeTotal(price, quantity);
  const balance = sbBalance.value;
  const available = availableSb.value;
  const insufficientBalance =
    side === "buy" && balance != null && totalCost > 0 && totalCost > balance;
  const insufficientAvailable =
    side === "buy" && available != null && totalCost > 0 && totalCost > available;

  // Sell-side: subtract open sell orders from raw inventory to get available count
  const openSellQty = myItemOrders.value
    .filter(o => o.itemTypeId === itemTypeId && o.side === "sell"
      && (o.status === "open" || o.status === "partially_filled"))
    .reduce((sum, o) => sum + (o.quantity - o.filledQuantity), 0);
  const availableInventory = inventory != null ? Math.max(0, inventory - openSellQty) : null;

  const inventoryKnown = side === "sell" && availableInventory != null;
  const noInventory = side === "sell" && inventory != null && inventory === 0;
  const allCommitted = side === "sell" && inventory != null && inventory > 0 && availableInventory === 0;
  const quantityOverInventory = inventoryKnown && quantity > availableInventory!;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    setError(null);

    if (price < 0.1) {
      setError("Price must be at least 0.1 SB");
      return;
    }
    if (quantity < 1) {
      setError("Quantity must be at least 1");
      return;
    }
    if (!wholeTotal) {
      setError("Total must be a whole number of SB");
      return;
    }

    if (side === "buy" && balance == null) {
      setError("SB balance not available – cannot validate order");
      return;
    }
    if (side === "buy" && (insufficientBalance || insufficientAvailable)) {
      setError("Insufficient SB balance");
      return;
    }

    if (side === "sell" && inventoryKnown && quantity > availableInventory!) {
      setError(`Only ${availableInventory} available in your inventory`);
      return;
    }

    setShowConfirm(true);
  };

  const submitOrder = () => {
    const payload: Record<string, unknown> = { itemTypeId, side, price, quantity };
    if (side === "buy" && balance != null) {
      payload.sbBalance = balance;
    }
    wsSend({ type: "create_item_order", payload });

    // Reset form
    setPrice(price);
    setQuantity(1);
    setShowConfirm(false);
    setError(null);
  };

  const isBuy = side === "buy";
  const balanceUnknown = isBuy && balance == null;
  const submitDisabled =
    insufficientBalance ||
    insufficientAvailable ||
    balanceUnknown ||
    noInventory ||
    allCommitted ||
    quantityOverInventory ||
    !wholeTotal ||
    (side === "sell" && inventoryLoading);

  return (
    <form class="create-order" onSubmit={handleSubmit}>
      <h3>Place Order</h3>
      {error && <div class="error">{error}</div>}

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

      {/* Sell-side inventory callout */}
      {side === "sell" && inventoryLoading && (
        <Callout loading>Checking inventory...</Callout>
      )}
      {side === "sell" && !inventoryLoading && noInventory && (
        <Callout variant="error">You don't have any {info.name} to sell</Callout>
      )}
      {side === "sell" && !inventoryLoading && allCommitted && (
        <Callout variant="warning">All inventory already listed</Callout>
      )}
      {side === "sell" && !inventoryLoading && inventoryKnown && !noInventory && !allCommitted && (
        <Callout variant="info">You have {availableInventory!.toLocaleString()} available</Callout>
      )}

      <StepperInput
        label="SB"
        icon={<IconCheese size={14} />}
        value={price}
        onChange={setPrice}
        min={0.1}
        step={0.1}
        decimal
        inline
      />

      <StepperInput
        label="Qty"
        icon={<IconListOrdered size={14} />}
        value={quantity}
        onChange={(v) => {
          if (inventoryKnown && availableInventory! > 0 && v > availableInventory!) {
            setQuantity(availableInventory!);
          } else {
            setQuantity(v);
          }
        }}
        min={moq}
        step={moq}
        max={inventoryKnown && availableInventory! > 0 ? availableInventory! : undefined}
        inline
      />

      {isBuy && totalCost > 0 && (
        <div class={`total-cost${insufficientBalance || insufficientAvailable || !wholeTotal ? " insufficient" : ""}`}>
          Total: {totalCost.toLocaleString()} SB
          {insufficientBalance && " (insufficient balance)"}
          {!insufficientBalance && insufficientAvailable && " (insufficient available SB)"}
        </div>
      )}

      {!isBuy && totalCost > 0 && !noInventory && (
        <div class={`total-cost${!wholeTotal ? " insufficient" : ""}`}>
          Total: {totalCost.toLocaleString()} SB
        </div>
      )}

      {!wholeTotal && (
        <Callout variant="warning">Total must be a whole number of SB</Callout>
      )}
      {wholeTotal && moq > 1 && (
        <Callout variant="info">Fills in multiples of {moq}</Callout>
      )}

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
              <span class="label">Item</span>
              <span class="value">{info.name}</span>
            </div>
            <div class="order-confirm-row">
              <span class="label">Price</span>
              <span class="value">{formatItemPrice(price)} SB per unit</span>
            </div>
            <div class="order-confirm-row">
              <span class="label">Quantity</span>
              <span class="value">{quantity.toLocaleString()} unit{quantity !== 1 ? "s" : ""}</span>
            </div>
            <div class="order-confirm-total">
              <span class="label">Total</span>
              <span class="value">{totalCost.toLocaleString()} SB</span>
            </div>
            {moq > 1 && (
              <div class="order-confirm-note">
                This order fills in multiples of {moq} items
              </div>
            )}
          </div>
        </ConfirmModal>
      )}
    </form>
  );
}
