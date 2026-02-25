import { useEffect, useRef, useState } from "preact/hooks";
import { myOrders, mapTypes } from "../../signals/slots.js";
import { mySnipingOrders } from "../../signals/sniping.js";
import { myItemOrders, allItemTypes } from "../../signals/items.js";
import { myMapOrders } from "../../signals/maps.js";
import { activeMaps, sbBalance, playerIdentity, availableSb } from "../../signals/game-state.js";
import { wsSend, sendToWorker, refreshAvailableSb } from "../../hooks/useServiceWorker.js";
import { type Order, type OrderTier, type SnipingOrder, type ItemOrder, type MapOrder, formatItemPrice, itemSbTotal, isWholeTotal, getItemMoq } from "@mhcm/shared";
import { IconX, IconEdit, IconCheck, IconEllipsis, IconLightbulb, IconPuzzle, IconMouse, IconLootBag, IconDiamond, IconMap, IconCheckCircle } from "../common/Icons.js";
import { StepperInput } from "../common/StepperInput.js";
import { Callout } from "../common/Callout.js";
import { ConfirmModal } from "../common/ConfirmModal.js";
import { PaginationBar } from "../common/PaginationBar.js";

type OrderFilter = "all" | "slots" | "sniping" | "items" | "maps";

function formatAcceptedTiers(tiers: OrderTier[] | null): string {
  if (!tiers) return "All";
  if (tiers.length === 0) return "None";
  return tiers.map((t) => t ?? "None").join(", ");
}

function formatDate(iso: string): string {
  const d = new Date(iso + "Z");
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mapInfo(mapTypeId: number): { name: string; quality: string; thumbnail: string | null } {
  const mt = mapTypes.value.find((m) => m.id === mapTypeId);
  if (mt) return { name: mt.displayName, quality: mt.quality, thumbnail: mt.thumbnail };
  return { name: `Map #${mapTypeId}`, quality: "", thumbnail: null };
}

function statusLabel(status: string): string {
  switch (status) {
    case "partially_filled":
      return "partial";
    default:
      return status;
  }
}

function resolveMapName(mhMapId: number): string {
  const m = activeMaps.value.find((am) => am.map_id === mhMapId);
  return m ? m.name : `Map #${mhMapId}`;
}

function snipingTargetName(o: SnipingOrder): string {
  return o.mouseName || o.mouseGroupName || o.itemName || o.itemGroupName || "Unknown";
}

function snipingTargetThumb(o: SnipingOrder): string | null | undefined {
  return o.mouseThumbnail ?? o.itemThumbnail;
}

function snipingStatusSummary(orders: SnipingOrder[]): string {
  const matched = orders.filter((o) => o.status === "matched" || o.status === "in_progress").length;
  if (matched > 0) return "in progress";
  const open = orders.filter((o) => o.status === "open").length;
  if (open === orders.length) return "open";
  return "mixed";
}

function SnipingOrdersSection({
  orders,
  onCancel,
}: {
  orders: SnipingOrder[];
  onCancel: (order: SnipingOrder) => void;
}) {
  const [expandedMaps, setExpandedMaps] = useState<Set<number>>(new Set());
  const [cancelAllConfirm, setCancelAllConfirm] = useState<{ mapOrders: SnipingOrder[]; mapName: string } | null>(null);

  const sellOrders = orders.filter((o) => o.side === "sniper_sell");
  const buyOrders = orders.filter((o) => o.side === "sniper_buy");

  // Group buy orders by mhMapId
  const buyByMap = new Map<number, SnipingOrder[]>();
  for (const o of buyOrders) {
    const key = o.mhMapId ?? 0;
    const group = buyByMap.get(key);
    if (group) group.push(o);
    else buyByMap.set(key, [o]);
  }

  const toggleMap = (mapId: number) => {
    setExpandedMaps((prev) => {
      const next = new Set(prev);
      if (next.has(mapId)) next.delete(mapId);
      else next.add(mapId);
      return next;
    });
  };

  const handleCancelAll = (mapOrders: SnipingOrder[]) => {
    const cancellable = mapOrders.filter((o) => o.status === "open");
    if (cancellable.length === 0) return;
    const mapName = resolveMapName(cancellable[0].mhMapId ?? 0);
    setCancelAllConfirm({ mapOrders: cancellable, mapName });
  };

  const confirmCancelAll = () => {
    if (!cancelAllConfirm) return;
    for (const o of cancelAllConfirm.mapOrders) {
      wsSend({ type: "cancel_sniping_order", payload: { orderId: o.id } });
    }
    setCancelAllConfirm(null);
  };

  return (
    <>
      <h4 class="section-label">Sniping Orders</h4>
      <div class="order-list">
        {/* Sell orders: individual cards */}
        {sellOrders.map((order) => (
          <div key={order.id} class="order-card">
            <span class={`market-watermark wm-sniping`}>
              {order.goalType === "item" ? <IconLootBag size={18} /> : <IconMouse size={18} />}
            </span>
            <div class="order-card-header">
              <span class="side-tag sell">Selling</span>
              {snipingTargetThumb(order) && (
                <img class="mouse-thumb-sm" src={snipingTargetThumb(order)!} alt="" />
              )}
              <span class="order-map-name">{snipingTargetName(order)}</span>
            </div>
            <div class="order-card-details">
              <div class="order-detail">
                <span class="order-detail-label">Price</span>
                <span class="order-detail-value">{order.price} SB</span>
              </div>
              <div class="order-detail">
                <span class="order-detail-label">Status</span>
                <span class={`status ${order.status}`}>{order.status}</span>
              </div>
              <div class="order-detail">
                <span class="order-detail-label">Created</span>
                <span class="order-detail-value order-date">
                  {formatDate(order.createdAt)}
                </span>
              </div>
            </div>
            {order.status === "open" && (
              <div class="order-card-actions">
                <button class="btn-cancel" onClick={() => onCancel(order)}>
                  <IconX size={12} /> Cancel
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Buy orders: grouped by map, order-card style with expandable drawer */}
        {[...buyByMap.entries()].map(([mapId, mapOrders]) => {
          const expanded = expandedMaps.has(mapId);
          const mapName = resolveMapName(mapId);
          const totalPrice = mapOrders.reduce((s, o) => s + o.price, 0);
          const completedCount = mapOrders.filter((o) => o.status === "completed").length;
          const cancellable = mapOrders.filter((o) => o.status === "open");
          const oldest = mapOrders.reduce((min, o) => o.createdAt < min ? o.createdAt : min, mapOrders[0].createdAt);
          const summaryStatus = snipingStatusSummary(mapOrders);

          return (
            <div key={mapId} class="order-card">
              <span class={`market-watermark wm-sniping`}>
                {mapOrders[0].goalType === "item" ? <IconLootBag size={18} /> : <IconMouse size={18} />}
              </span>
              <div
                class="order-card-header order-card-header-clickable"
                onClick={() => toggleMap(mapId)}
              >
                <span class="side-tag buy">Buying</span>
                <span class="order-map-name">{mapName}</span>
                <span class="expand-toggle">
                  {expanded ? <IconX size={14} /> : <IconEllipsis size={14} />}
                </span>
              </div>
              <div class="order-card-details">
                <div class="order-detail">
                  <span class="order-detail-label">Total</span>
                  <span class="order-detail-value">{totalPrice.toLocaleString()} SB</span>
                </div>
                <div class="order-detail">
                  <span class="order-detail-label">{mapOrders[0].goalType === "item" ? "Items" : "Mice"}</span>
                  <span class="order-detail-value">
                    {completedCount}
                    <span class="order-detail-sep">/</span>
                    {mapOrders.length}
                  </span>
                </div>
                <div class="order-detail">
                  <span class="order-detail-label">Status</span>
                  <span class={`status ${summaryStatus.replace(" ", "_")}`}>
                    {summaryStatus}
                  </span>
                </div>
                <div class="order-detail">
                  <span class="order-detail-label">Created</span>
                  <span class="order-detail-value order-date">
                    {formatDate(oldest)}
                  </span>
                </div>
              </div>
              {cancellable.length > 0 && (
                <div class="order-card-actions">
                  <button
                    class="btn-cancel"
                    onClick={() => handleCancelAll(mapOrders)}
                  >
                    <IconX size={12} /> Cancel All
                  </button>
                </div>
              )}
              {expanded && (
                <div class="sniping-drawer">
                  {mapOrders.map((order) => (
                    <div key={order.id} class="sniping-drawer-row">
                      {snipingTargetThumb(order) && (
                        <img class="mouse-thumb-sm" src={snipingTargetThumb(order)!} alt="" />
                      )}
                      <span class="sniping-drawer-name">{snipingTargetName(order)}</span>
                      <span class={`status ${order.status}`}>{order.status}</span>
                      <span class="sniping-drawer-price">
                        {order.price} SB
                      </span>
                      {order.status === "open" && (
                        <button
                          class="btn-cancel-sm"
                          onClick={() => onCancel(order)}
                        >
                          <IconX size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {cancelAllConfirm && (
        <ConfirmModal
          title="Cancel Sniping Orders"
          confirmLabel="Cancel Orders"
          confirmClass="danger"
          onConfirm={confirmCancelAll}
          onCancel={() => setCancelAllConfirm(null)}
        >
          <p>Cancel all {cancelAllConfirm.mapOrders.length} sniping order{cancelAllConfirm.mapOrders.length !== 1 ? "s" : ""} for {cancelAllConfirm.mapName}?</p>
        </ConfirmModal>
      )}
    </>
  );
}

export function MyOrders() {
  useEffect(() => {
    wsSend({ type: "get_my_orders" });
  }, []);

  const orders = myOrders.value;
  const snipingOrders = mySnipingOrders.value;
  const itemOrders = myItemOrders.value;
  const mapOrders = myMapOrders.value.filter(
    (o) => o.status !== "filled" && o.status !== "cancelled"
  );
  const [filter, setFilter] = useState<OrderFilter>("all");

  // Edit state
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editQuantity, setEditQuantity] = useState(0);

  // Item edit state (separate to avoid conflict with slot edits)
  const [editingItemOrderId, setEditingItemOrderId] = useState<number | null>(null);
  const [editItemPrice, setEditItemPrice] = useState(0);
  const [editItemQuantity, setEditItemQuantity] = useState(0);

  // Item edit validation state
  const [editItemInventory, setEditItemInventory] = useState<number | null>(null);
  const [editItemValidationLoading, setEditItemValidationLoading] = useState(false);

  // Map edit state
  const [editingMapOrderId, setEditingMapOrderId] = useState<number | null>(null);
  const [editMapPrice, setEditMapPrice] = useState(0);
  const [editMapQuantity, setEditMapQuantity] = useState(0);

  // Cancel confirmation state
  const [cancelConfirm, setCancelConfirm] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Pagination state
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalCount = orders.length + snipingOrders.length + itemOrders.length + mapOrders.length;

  if (totalCount === 0) {
    return (
      <div class="my-orders">
        <h3>My Orders</h3>
        <p class="empty">No active orders.</p>
      </div>
    );
  }

  const showSlots = filter === "all" || filter === "slots";
  const showSniping = filter === "all" || filter === "sniping";
  const showItems = filter === "all" || filter === "items";
  const showMaps = filter === "all" || filter === "maps";

  // Sniping visual groups: each sell order is 1 card, each buy map group is 1 card
  const snipingVisualGroups: SnipingOrder[][] = [];
  if (snipingOrders.length > 0) {
    const buysByMap = new Map<number, SnipingOrder[]>();
    for (const o of snipingOrders) {
      if (o.side === "sniper_sell") {
        snipingVisualGroups.push([o]);
      } else {
        const key = o.mhMapId ?? 0;
        const group = buysByMap.get(key);
        if (group) group.push(o);
        else buysByMap.set(key, [o]);
      }
    }
    for (const group of buysByMap.values()) {
      snipingVisualGroups.push(group);
    }
  }

  // Pagination: compute which orders from each section are visible on the current page
  const PAGE_SIZE = 10;
  const sectionDefs: { kind: string; count: number }[] = [];
  if (showSlots && orders.length > 0) sectionDefs.push({ kind: "slots", count: orders.length });
  if (showSniping && snipingVisualGroups.length > 0) sectionDefs.push({ kind: "sniping", count: snipingVisualGroups.length });
  if (showItems && itemOrders.length > 0) sectionDefs.push({ kind: "items", count: itemOrders.length });
  if (showMaps && mapOrders.length > 0) sectionDefs.push({ kind: "maps", count: mapOrders.length });
  const totalFiltered = sectionDefs.reduce((s, sec) => s + sec.count, 0);
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageStart = safePage * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;

  let offset = 0;
  const slices = new Map<string, [number, number]>();
  for (const { kind, count } of sectionDefs) {
    const from = Math.max(0, pageStart - offset);
    const to = Math.min(count, pageEnd - offset);
    if (to > from) slices.set(kind, [from, to]);
    offset += count;
  }

  const handlePageChange = (p: number) => {
    setPage(p);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const handleCancel = (order: Order) => {
    const { name } = mapInfo(order.mapTypeId);
    const remaining = order.quantity - order.filledQuantity;
    setCancelConfirm({
      message: `Cancel ${order.side} order for ${remaining} slot${remaining !== 1 ? "s" : ""} of ${name} at ${order.price} SB?`,
      onConfirm: () => {
        wsSend({ type: "cancel_order", payload: { orderId: order.id } });
        setCancelConfirm(null);
      },
    });
  };

  const handleStartEdit = (order: Order) => {
    setEditingOrderId(order.id);
    setEditPrice(order.price);
    setEditQuantity(order.quantity);
    if (order.side === "buy") refreshAvailableSb();
  };

  const handleCancelEdit = () => {
    setEditingOrderId(null);
  };

  const handleSaveEdit = (order: Order) => {
    // Only send if something changed
    const priceChanged = editPrice !== order.price;
    const quantityChanged = editQuantity !== order.quantity;

    if (!priceChanged && !quantityChanged) {
      setEditingOrderId(null);
      return;
    }

    // Validate cost increase against available SB for buy orders
    if (order.side === "buy") {
      const avail = availableSb.value;
      const oldRemaining = order.quantity - order.filledQuantity;
      const oldCost = order.price * oldRemaining;
      const newCost = editPrice * (editQuantity - order.filledQuantity);
      const delta = newCost - oldCost;
      if (delta > 0 && avail != null && delta > avail) {
        return;
      }
    }

    wsSend({
      type: "adjust_order",
      payload: {
        orderId: order.id,
        ...(priceChanged && { price: editPrice }),
        ...(quantityChanged && { quantity: editQuantity }),
        ...(order.side === "buy" && sbBalance.value != null && { sbBalance: sbBalance.value }),
      },
    });
    setEditingOrderId(null);
  };

  // Partially filled: sell can only lower price, buy can only raise
  const getPriceConstraints = (order: Order) => {
    const isPartiallyFilled = order.filledQuantity > 0;
    if (!isPartiallyFilled) {
      // Unfilled: can change price either direction
      return { min: 1, max: undefined };
    }
    // Partially filled: sell can only lower, buy can only raise
    if (order.side === "sell") {
      return { min: 1, max: order.price };
    } else {
      return { min: order.price, max: undefined };
    }
  };

  const handleSnipingCancel = (order: SnipingOrder) => {
    const side = order.side === "sniper_sell" ? "sell" : "buy";
    setCancelConfirm({
      message: `Cancel sniping ${side} order for ${snipingTargetName(order)} at ${order.price} SB?`,
      onConfirm: () => {
        wsSend({ type: "cancel_sniping_order", payload: { orderId: order.id } });
        setCancelConfirm(null);
      },
    });
  };

  const handleItemCancel = (order: ItemOrder) => {
    const remaining = order.quantity - order.filledQuantity;
    setCancelConfirm({
      message: `Cancel ${order.side} order for ${remaining} ${order.itemName} at ${formatItemPrice(order.price)} SB each?`,
      onConfirm: () => {
        wsSend({ type: "cancel_item_order", payload: { orderId: order.id } });
        setCancelConfirm(null);
      },
    });
  };

  const handleItemStartEdit = (order: ItemOrder) => {
    setEditingItemOrderId(order.id);
    setEditItemPrice(order.price);
    setEditItemQuantity(order.quantity);
    setEditItemInventory(null);

    const uh = playerIdentity.value?.uniqueHash;
    if (!uh) return;

    if (order.side === "buy") {
      refreshAvailableSb();
    } else {
      // Fetch item inventory for sell order validation
      const itemType = allItemTypes.value.find((it) => it.id === order.itemTypeId);
      if (!itemType) return;
      setEditItemValidationLoading(true);
      sendToWorker({
        type: "execute_api_via_content",
        payload: { method: "getItemQuantity", args: [uh, itemType.type] },
      })
        .then((result) => {
          if (result?.success && typeof result.data === "number") {
            setEditItemInventory(result.data);
          }
        })
        .catch(() => setEditItemInventory(null))
        .finally(() => setEditItemValidationLoading(false));
    }
  };

  const handleItemCancelEdit = () => {
    setEditingItemOrderId(null);
    setEditItemInventory(null);
  };

  const handleItemSaveEdit = (order: ItemOrder) => {
    const priceChanged = editItemPrice !== order.price;
    const quantityChanged = editItemQuantity !== order.quantity;
    if (!priceChanged && !quantityChanged) {
      setEditingItemOrderId(null);
      setEditItemInventory(null);
      return;
    }

    // Validate whole total
    if (!isWholeTotal(editItemPrice, editItemQuantity)) return;

    // Validate buy order cost increase against available SB
    if (order.side === "buy") {
      const avail = availableSb.value;
      const oldRemaining = order.quantity - order.filledQuantity;
      const oldCost = itemSbTotal(order.price, oldRemaining);
      const newCost = itemSbTotal(editItemPrice, editItemQuantity - order.filledQuantity);
      const delta = newCost - oldCost;
      if (delta > 0 && avail != null && delta > avail) {
        return;
      }
    }

    // Validate sell order quantity against inventory
    if (order.side === "sell" && editItemInventory != null) {
      if (editItemQuantity > editItemInventory) return;
    }

    wsSend({
      type: "adjust_item_order",
      payload: {
        orderId: order.id,
        ...(priceChanged && { price: editItemPrice }),
        ...(quantityChanged && { quantity: editItemQuantity }),
        ...(order.side === "buy" && sbBalance.value != null && { sbBalance: sbBalance.value }),
      },
    });
    setEditingItemOrderId(null);
    setEditItemInventory(null);
  };

  const handleMapCancel = (order: MapOrder) => {
    const remaining = order.quantity - order.filledQuantity;
    const label = order.mode === "unopened" ? "Unopened" : "Completed";
    setCancelConfirm({
      message: `Cancel ${order.side} order for ${remaining} ${order.mapDisplayName} (${label}) at ${order.price} SB?`,
      onConfirm: () => {
        wsSend({ type: "cancel_map_order", payload: { orderId: order.id } });
        setCancelConfirm(null);
      },
    });
  };

  const handleMapStartEdit = (order: MapOrder) => {
    setEditingMapOrderId(order.id);
    setEditMapPrice(order.price);
    setEditMapQuantity(order.quantity);
    if (order.side === "buy") refreshAvailableSb();
  };

  const handleMapCancelEdit = () => {
    setEditingMapOrderId(null);
  };

  const handleMapSaveEdit = (order: MapOrder) => {
    const priceChanged = editMapPrice !== order.price;
    const quantityChanged = editMapQuantity !== order.quantity;
    if (!priceChanged && !quantityChanged) {
      setEditingMapOrderId(null);
      return;
    }

    // Validate SB for buy order cost increases
    if (order.side === "buy") {
      const available = availableSb.value;
      const oldRemaining = order.quantity - order.filledQuantity;
      const oldCost = order.price * oldRemaining;
      const newCost = editMapPrice * (editMapQuantity - order.filledQuantity);
      const delta = newCost - oldCost;
      if (delta > 0 && available != null && delta > available) {
        return;
      }
    }

    wsSend({
      type: "adjust_map_order",
      payload: {
        orderId: order.id,
        ...(priceChanged && { price: editMapPrice }),
        ...(quantityChanged && { quantity: editMapQuantity }),
        ...(order.side === "buy" && sbBalance.value != null && { sbBalance: sbBalance.value }),
      },
    });
    setEditingMapOrderId(null);
  };

  return (
    <div class="my-orders">
      <h3>My Orders</h3>

      {/* Filter chips */}
      <div class="order-filter-chips">
        {(["all", "slots", "sniping", "items", "maps"] as const).map((f) => (
          <button
            key={f}
            class={`pill${filter === f ? " active" : ""}`}
            onClick={() => { setFilter(f); setPage(0); }}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "slots" && orders.length > 0 && ` (${orders.length})`}
            {f === "sniping" && snipingOrders.length > 0 && ` (${snipingOrders.length})`}
            {f === "items" && itemOrders.length > 0 && ` (${itemOrders.length})`}
            {f === "maps" && mapOrders.length > 0 && ` (${mapOrders.length})`}
          </button>
        ))}
      </div>

      <div class="paginated-scroll" ref={scrollRef}>
      {slices.has("slots") && <div class="order-list">
        {orders.slice(...slices.get("slots")!).map((order) => {
          const { name, quality, thumbnail } = mapInfo(order.mapTypeId);
          const canCancel =
            order.status === "open" || order.status === "partially_filled";

          return (
            <div key={order.id} class="order-card">
              <span class="market-watermark wm-slot"><IconPuzzle size={18} /></span>
              <div class="order-card-header">
                <span class={`side-tag ${order.side}`}>
                  {order.side === "sell" ? "Selling" : "Buying"}
                </span>
                {thumbnail && <img class="map-thumb-sm" src={thumbnail} alt="" />}
                <span class="order-map-name">{name}</span>
                <span class={`quality ${quality}`}>{quality}</span>
                {order.side === "sell" && order.tier && (
                  <span class={`tier tier-${order.tier.toLowerCase()}`}>{order.tier}</span>
                )}
                {order.side === "buy" && (
                  <span class="accepted-tiers-mini">
                    {order.acceptedTiers ? (
                      order.acceptedTiers.filter((t): t is NonNullable<typeof t> => t !== null).map((t) => (
                        <span key={t} class={`tier-mini tier-mini-${t.toLowerCase()}`}>
                          {t}
                        </span>
                      ))
                    ) : (
                      <span class="tier-mini tier-mini-all">All</span>
                    )}
                  </span>
                )}
              </div>
              <div class="order-card-details">
                <div class="order-detail">
                  <span class="order-detail-label">Price</span>
                  <span class="order-detail-value">{order.price} SB</span>
                </div>
                <div class="order-detail">
                  <span class="order-detail-label">Filled</span>
                  <span class="order-detail-value">
                    {order.filledQuantity}
                    <span class="order-detail-sep">/</span>
                    {order.quantity}
                  </span>
                </div>
                <div class="order-detail">
                  <span class="order-detail-label">Status</span>
                  <span class={`status ${order.status}`}>
                    {statusLabel(order.status)}
                  </span>
                </div>
                <div class="order-detail">
                  <span class="order-detail-label">Created</span>
                  <span class="order-detail-value order-date">
                    {formatDate(order.createdAt)}
                  </span>
                </div>
              </div>
              {canCancel && editingOrderId !== order.id && (
                <div class="order-card-actions">
                  <button
                    class="btn-edit"
                    onClick={() => handleStartEdit(order)}
                  >
                    <IconEdit size={12} /> Edit
                  </button>
                  <button
                    class="btn-cancel"
                    onClick={() => handleCancel(order)}
                  >
                    <IconX size={12} /> Cancel
                  </button>
                </div>
              )}
              {editingOrderId === order.id && (() => {
                const isBuyEdit = order.side === "buy";
                const avail = availableSb.value;
                const bal = sbBalance.value;
                return (
                <div class="order-card-edit">
                  {isBuyEdit && avail != null && bal != null && (
                    <Callout variant="info">
                      {avail.toLocaleString()} SB available
                      <span class="callout-info-trigger">
                        <IconLightbulb size={12} />
                        <span class="callout-tooltip">
                          {bal.toLocaleString()} total &minus; {(bal - avail).toLocaleString()} in open orders
                        </span>
                      </span>
                    </Callout>
                  )}
                  <div class="edit-field">
                    <label>Price (SB)</label>
                    <StepperInput
                      value={editPrice}
                      onChange={setEditPrice}
                      min={getPriceConstraints(order).min}
                      max={getPriceConstraints(order).max}
                    />
                  </div>
                  <div class="edit-field">
                    <label>Qty</label>
                    <StepperInput
                      value={editQuantity}
                      onChange={setEditQuantity}
                      min={Math.max(1, order.filledQuantity)}
                    />
                  </div>
                  <div class="edit-actions">
                    <span class="edit-total">
                      Total: {(editPrice * editQuantity).toLocaleString()} SB
                    </span>
                    <button
                      class="btn-save"
                      onClick={() => handleSaveEdit(order)}
                    >
                      <IconCheck size={12} /> Save
                    </button>
                    <button
                      class="btn-cancel-edit"
                      onClick={handleCancelEdit}
                    >
                      <IconX size={12} /> Cancel
                    </button>
                  </div>
                </div>
                );
              })()}
            </div>
          );
        })}
      </div>}

      {slices.has("sniping") && (
        <SnipingOrdersSection
          orders={snipingVisualGroups.slice(...slices.get("sniping")!).flat()}
          onCancel={handleSnipingCancel}
        />
      )}

      {slices.has("items") && (
        <>
          <h4 class="section-label">Item Orders</h4>
          <div class="order-list">
            {itemOrders.slice(...slices.get("items")!).map((order) => {
              const remaining = order.quantity - order.filledQuantity;
              const canCancel =
                order.status === "open" || order.status === "partially_filled";

              return (
                <div key={order.id} class="order-card">
                  <span class="market-watermark wm-item"><IconDiamond size={18} /></span>
                  <div class="order-card-header">
                    <span class={`side-tag ${order.side}`}>
                      {order.side === "sell" ? "Selling" : "Buying"}
                    </span>
                    {order.itemThumbnail && (
                      <img class="map-thumb-sm" src={order.itemThumbnail} alt="" />
                    )}
                    <span class="order-map-name">{order.itemName}</span>
                  </div>
                  <div class="order-card-details">
                    <div class="order-detail">
                      <span class="order-detail-label">Price</span>
                      <span class="order-detail-value">{formatItemPrice(order.price)} SB</span>
                    </div>
                    <div class="order-detail">
                      <span class="order-detail-label">Remaining</span>
                      <span class="order-detail-value">
                        {remaining}
                        <span class="order-detail-sep">/</span>
                        {order.quantity}
                      </span>
                    </div>
                    <div class="order-detail">
                      <span class="order-detail-label">Status</span>
                      <span class={`status ${order.status}`}>
                        {statusLabel(order.status)}
                      </span>
                    </div>
                    <div class="order-detail">
                      <span class="order-detail-label">Created</span>
                      <span class="order-detail-value order-date">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                  </div>
                  {canCancel && editingItemOrderId !== order.id && (
                    <div class="order-card-actions">
                      <button
                        class="btn-edit"
                        onClick={() => handleItemStartEdit(order)}
                      >
                        <IconEdit size={12} /> Edit
                      </button>
                      <button
                        class="btn-cancel"
                        onClick={() => handleItemCancel(order)}
                      >
                        <IconX size={12} /> Cancel
                      </button>
                    </div>
                  )}
                  {editingItemOrderId === order.id && (() => {
                    const editMoq = getItemMoq(editItemPrice);
                    const editTotal = itemSbTotal(editItemPrice, editItemQuantity);
                    const editWhole = isWholeTotal(editItemPrice, editItemQuantity);
                    const isBuyOrder = order.side === "buy";
                    const avail = availableSb.value;
                    const bal = sbBalance.value;
                    const oldRemaining = order.quantity - order.filledQuantity;
                    const oldCost = itemSbTotal(order.price, oldRemaining);
                    const newCost = itemSbTotal(editItemPrice, editItemQuantity - order.filledQuantity);
                    const delta = newCost - oldCost;
                    const insufficientAvailable = isBuyOrder && delta > 0 && avail != null && delta > avail;
                    const inventoryKnown = !isBuyOrder && editItemInventory != null;
                    const overInventory = inventoryKnown && editItemQuantity > editItemInventory!;
                    const saveDisabled =
                      editItemValidationLoading ||
                      insufficientAvailable ||
                      overInventory ||
                      !editWhole;

                    return (
                      <div class="order-card-edit">
                        {editItemValidationLoading && (
                          <div class="sell-inventory-info loading">
                            Checking inventory...
                          </div>
                        )}
                        {isBuyOrder && avail != null && bal != null && (
                          <Callout variant="info">
                            {avail.toLocaleString()} SB available
                            <span class="callout-info-trigger">
                              <IconLightbulb size={12} />
                              <span class="callout-tooltip">
                                {bal.toLocaleString()} total &minus; {(bal - avail).toLocaleString()} in open orders
                              </span>
                            </span>
                          </Callout>
                        )}
                        {!isBuyOrder && !editItemValidationLoading && inventoryKnown && (
                          <div class={`sell-inventory-info${editItemInventory === 0 ? " none" : ""}`}>
                            {editItemInventory === 0
                              ? `You don't have any ${order.itemName} to sell`
                              : `You have: ${editItemInventory!.toLocaleString()}`}
                          </div>
                        )}
                        <div class="edit-field">
                          <label>Price (SB)</label>
                          <StepperInput
                            value={editItemPrice}
                            onChange={setEditItemPrice}
                            min={0.1}
                            step={0.1}
                            decimal
                          />
                        </div>
                        <div class="edit-field">
                          <label>Qty</label>
                          <StepperInput
                            value={editItemQuantity}
                            onChange={(v) => {
                              if (inventoryKnown && v > editItemInventory!) {
                                setEditItemQuantity(editItemInventory!);
                              } else {
                                setEditItemQuantity(v);
                              }
                            }}
                            min={Math.max(editMoq, order.filledQuantity)}
                            step={editMoq}
                            max={inventoryKnown ? editItemInventory! : undefined}
                          />
                        </div>
                        <div class="edit-actions">
                          <span class={`edit-total${insufficientAvailable || !editWhole ? " insufficient" : ""}`}>
                            Total: {editTotal.toLocaleString()} SB
                            {!editWhole && " (invalid)"}
                          </span>
                          <button
                            class="btn-save"
                            disabled={saveDisabled}
                            onClick={() => handleItemSaveEdit(order)}
                          >
                            <IconCheck size={12} /> Save
                          </button>
                          <button
                            class="btn-cancel-edit"
                            onClick={handleItemCancelEdit}
                          >
                            <IconX size={12} /> Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Maps marketplace orders */}
      {slices.has("maps") && (
        <>
          <h4 class="section-label">Map Orders</h4>
          <div class="order-list">
            {mapOrders.slice(...slices.get("maps")!).map((order) => {
              const canCancel =
                order.status === "open" || order.status === "partially_filled";
              const isCompletedSell = order.side === "sell" && order.mode === "completed";

              return (
                <div key={order.id} class="order-card">
                  <span class={`market-watermark wm-map`}>
                    {order.mode === "completed" ? <IconCheckCircle size={18} /> : <IconMap size={18} />}
                  </span>
                  <div class="order-card-header">
                    <span class={`side-tag ${order.side}`}>
                      {order.side === "sell" ? "Selling" : "Buying"}
                    </span>
                    {order.mapThumbnail && (
                      <img class="map-thumb-sm" src={order.mapThumbnail} alt="" />
                    )}
                    <span class="order-map-name">{order.mapDisplayName}</span>
                    <span class={`quality ${order.mode}`}>
                      {order.mode === "unopened" ? "Unopened" : "Completed"}
                    </span>
                    {order.side === "sell" && order.tier && (
                      <span class={`tier tier-${order.tier.toLowerCase()}`}>{order.tier}</span>
                    )}
                    {order.side === "buy" && order.mode === "completed" && (
                      <span class="accepted-tiers-mini">
                        {order.acceptedTiers ? (
                          order.acceptedTiers.map((t) => (
                            <span key={t} class={`tier-mini tier-mini-${t.toLowerCase()}`}>
                              {t}
                            </span>
                          ))
                        ) : (
                          <span class="tier-mini tier-mini-all">All</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div class="order-card-details">
                    <div class="order-detail">
                      <span class="order-detail-label">Price</span>
                      <span class="order-detail-value">{order.price} SB</span>
                    </div>
                    <div class="order-detail">
                      <span class="order-detail-label">Filled</span>
                      <span class="order-detail-value">
                        {order.filledQuantity}
                        <span class="order-detail-sep">/</span>
                        {order.quantity}
                      </span>
                    </div>
                    <div class="order-detail">
                      <span class="order-detail-label">Status</span>
                      <span class={`status ${order.status}`}>
                        {statusLabel(order.status)}
                      </span>
                    </div>
                    <div class="order-detail">
                      <span class="order-detail-label">Created</span>
                      <span class="order-detail-value order-date">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                  </div>
                  {canCancel && editingMapOrderId !== order.id && (
                    <div class="order-card-actions">
                      <button
                        class="btn-edit"
                        onClick={() => handleMapStartEdit(order)}
                      >
                        <IconEdit size={12} /> Edit
                      </button>
                      <button
                        class="btn-cancel"
                        onClick={() => handleMapCancel(order)}
                      >
                        <IconX size={12} /> Cancel
                      </button>
                    </div>
                  )}
                  {editingMapOrderId === order.id && (() => {
                    const isBuyEdit = order.side === "buy";
                    const avail = availableSb.value;
                    const bal = sbBalance.value;
                    return (
                    <div class="order-card-edit">
                      {isBuyEdit && avail != null && bal != null && (
                        <Callout variant="info">
                          {avail.toLocaleString()} SB available
                          <span class="callout-info-trigger">
                            <IconLightbulb size={12} />
                            <span class="callout-tooltip">
                              {bal.toLocaleString()} total &minus; {(bal - avail).toLocaleString()} in open orders
                            </span>
                          </span>
                        </Callout>
                      )}
                      <div class="edit-field">
                        <label>Price (SB)</label>
                        <StepperInput
                          value={editMapPrice}
                          onChange={setEditMapPrice}
                          min={1}
                        />
                      </div>
                      {!isCompletedSell && (
                        <div class="edit-field">
                          <label>Qty</label>
                          <StepperInput
                            value={editMapQuantity}
                            onChange={setEditMapQuantity}
                            min={Math.max(1, order.filledQuantity)}
                          />
                        </div>
                      )}
                      <div class="edit-actions">
                        <span class="edit-total">
                          Total: {(editMapPrice * editMapQuantity).toLocaleString()} SB
                        </span>
                        <button
                          class="btn-save"
                          onClick={() => handleMapSaveEdit(order)}
                        >
                          <IconCheck size={12} /> Save
                        </button>
                        <button
                          class="btn-cancel-edit"
                          onClick={handleMapCancelEdit}
                        >
                          <IconX size={12} /> Cancel
                        </button>
                      </div>
                    </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </>
      )}
      </div>

      <div class="pagination-fixed">
        <PaginationBar page={safePage} totalPages={totalPages} onPageChange={handlePageChange} />
      </div>

      {cancelConfirm && (
        <ConfirmModal
          title="Cancel Order"
          confirmLabel="Cancel Order"
          confirmClass="danger"
          onConfirm={cancelConfirm.onConfirm}
          onCancel={() => setCancelConfirm(null)}
        >
          <p>{cancelConfirm.message}</p>
        </ConfirmModal>
      )}
    </div>
  );
}
