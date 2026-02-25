import type { SnipingHomeGoalItem } from "@mhcm/shared";
import {
  snipingHomeData, snipingGoalMode,
  selectedMouseTypeId, selectedMouseGroupId, selectedMouseInfo,
  selectedItemTypeId, selectedItemGroupId, selectedItemInfo,
  snipingOrderBook,
} from "../../signals/sniping.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconCrosshair, IconStarFilled, IconArrowLeft, IconUsers } from "../common/Icons.js";
import { formatPrice, padToSix } from "../../utils/format.js";
import { GridPlaceholder } from "../common/GridPlaceholder.js";

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

function selectGoalItem(item: SnipingHomeGoalItem) {
  unsubscribeCurrent();
  const isGroup = !!item.isGroup;
  const goalMode = snipingGoalMode.value;

  if (goalMode === "item") {
    const id = (isGroup ? item.itemGroupId : item.itemTypeId)!;
    selectedItemTypeId.value = isGroup ? null : id;
    selectedItemGroupId.value = isGroup ? id : null;
    selectedItemInfo.value = { id, name: item.name, thumbnail: item.thumbnail, isGroup };
    selectedMouseTypeId.value = null;
    selectedMouseGroupId.value = null;
    selectedMouseInfo.value = null;
    snipingOrderBook.value = null;
    wsSend({
      type: "subscribe_sniping_order_book",
      payload: isGroup ? { itemGroupId: id } : { itemTypeId: id },
    });
  } else {
    const id = (isGroup ? item.mouseGroupId : item.mouseTypeId)!;
    selectedMouseTypeId.value = isGroup ? null : id;
    selectedMouseGroupId.value = isGroup ? id : null;
    selectedMouseInfo.value = { id, name: item.name, thumbnail: item.thumbnail, isGroup };
    selectedItemTypeId.value = null;
    selectedItemGroupId.value = null;
    selectedItemInfo.value = null;
    snipingOrderBook.value = null;
    wsSend({
      type: "subscribe_sniping_order_book",
      payload: isGroup ? { mouseGroupId: id } : { mouseTypeId: id },
    });
  }
}

/** Derive a unique key for a goal item (works for both mouse and item goals). */
function goalItemKey(item: SnipingHomeGoalItem): string {
  if (item.mouseGroupId) return `mg${item.mouseGroupId}`;
  if (item.mouseTypeId) return `m${item.mouseTypeId}`;
  if (item.itemGroupId) return `ig${item.itemGroupId}`;
  if (item.itemTypeId) return `i${item.itemTypeId}`;
  return item.name;
}

function removeFavPayload(item: SnipingHomeGoalItem): { goalType: string; goalId: number } {
  if (item.mouseGroupId) return { goalType: "mouse_group", goalId: item.mouseGroupId };
  if (item.mouseTypeId) return { goalType: "mouse", goalId: item.mouseTypeId };
  if (item.itemGroupId) return { goalType: "item_group", goalId: item.itemGroupId };
  return { goalType: "item", goalId: item.itemTypeId! };
}

function GoalGridCard({
  item,
  showStar,
}: {
  item: SnipingHomeGoalItem;
  showStar?: boolean;
}) {
  const removeFav = (e: MouseEvent) => {
    e.stopPropagation();
    wsSend({ type: "remove_sniping_favourite", payload: removeFavPayload(item) });
  };

  return (
    <div class="home-grid-card" onClick={() => selectGoalItem(item)}>
      {showStar && (
        <span class="home-grid-star" onClick={removeFav}>
          <IconStarFilled size={14} />
        </span>
      )}
      <div class="home-grid-thumb">
        {item.thumbnail ? (
          <img
            class="home-grid-img"
            src={item.thumbnail}
            alt={item.name}
            width={48}
            height={48}
          />
        ) : (
          <div class="home-grid-img-placeholder">
            <IconCrosshair size={24} />
          </div>
        )}
        {item.isGroup && <span class="group-overlay"><IconUsers size={12} /></span>}
      </div>
      <div class="home-grid-name" title={item.name}>
        {item.name}
      </div>
      <div class="home-grid-price">{formatPrice(item.avgPrice)}</div>
    </div>
  );
}

function GoalListRow({ item }: { item: SnipingHomeGoalItem }) {
  return (
    <div class="home-list-row" onClick={() => selectGoalItem(item)}>
      <div class="home-list-thumb">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" width={24} height={24} />
        ) : (
          <IconCrosshair size={16} />
        )}
        {item.isGroup && <span class="group-overlay group-overlay-sm"><IconUsers size={10} /></span>}
      </div>
      <span class="home-list-name" title={item.name}>
        {item.name}
      </span>
      <span class="home-list-price">{formatPrice(item.avgPrice)}</span>
    </div>
  );
}

export function SnipingHomeView() {
  const data = snipingHomeData.value;

  const topSelling = data?.topSelling ?? [];
  const favourites = data?.favourites ?? [];
  const highValue = data?.highValue ?? [];
  const inDemand = data?.inDemand ?? [];

  return (
    <div class="home-view">
      {/* Top Selling */}
      <div class="home-section">
        <h3 class="home-section-title">Top Selling</h3>
        <div class="home-grid">
          {padToSix(topSelling).map((item, i) =>
            item ? (
              <GoalGridCard key={goalItemKey(item)} item={item} />
            ) : (
              <GridPlaceholder key={`ts-ph-${i}`} />
            )
          )}
        </div>
      </div>

      {/* Favourites */}
      <div class="home-section">
        <h3 class="home-section-title">Favourites</h3>
        <div class="home-grid">
          {padToSix(favourites).map((item, i) =>
            item ? (
              <GoalGridCard key={goalItemKey(item)} item={item} showStar />
            ) : (
              <GridPlaceholder key={`fav-ph-${i}`} />
            )
          )}
        </div>
      </div>

      {/* High Value + In Demand side-by-side */}
      <div class="home-lists">
        <div class="home-list">
          <div class="home-list-title">High Value</div>
          {highValue.length > 0 ? (
            highValue.map((item) => (
              <GoalListRow key={goalItemKey(item)} item={item} />
            ))
          ) : (
            <div class="home-list-empty">No data yet</div>
          )}
        </div>
        <div class="home-list">
          <div class="home-list-title">In Demand</div>
          {inDemand.length > 0 ? (
            inDemand.map((item) => (
              <GoalListRow key={goalItemKey(item)} item={item} />
            ))
          ) : (
            <div class="home-list-empty">No data yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SnipingBackButton() {
  const goHome = () => {
    unsubscribeCurrent();
    selectedMouseTypeId.value = null;
    selectedMouseGroupId.value = null;
    selectedMouseInfo.value = null;
    selectedItemTypeId.value = null;
    selectedItemGroupId.value = null;
    selectedItemInfo.value = null;
    snipingOrderBook.value = null;
    // Refresh home data for the current mode
    wsSend({ type: "get_sniping_home_data", payload: { goalType: snipingGoalMode.value } });
  };

  return (
    <button type="button" class="back-btn" onClick={goHome}>
      <IconArrowLeft size={14} /> Back to Home
    </button>
  );
}
