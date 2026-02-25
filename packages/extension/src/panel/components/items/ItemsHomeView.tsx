import type { ItemHomeItem } from "@mhcm/shared";
import {
  selectedItemTypeId,
  selectedItemInfo,
  allItemTypes,
  itemHomeData,
  itemFavourites,
  itemOrderBook,
} from "../../signals/items.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconStore, IconStarFilled, IconArrowLeft } from "../common/Icons.js";
import { formatItemDisplayPrice, padToSix } from "../../utils/format.js";
import { GridPlaceholder } from "../common/GridPlaceholder.js";

function selectItem(itemTypeId: number, name: string, thumbnail: string | null) {
  if (selectedItemTypeId.value) {
    wsSend({
      type: "unsubscribe_item_order_book",
      payload: { itemTypeId: selectedItemTypeId.value },
    });
  }
  selectedItemTypeId.value = itemTypeId;
  // Look up the game API slug from the full catalog
  const full = allItemTypes.value.find((t) => t.id === itemTypeId);
  selectedItemInfo.value = { id: itemTypeId, type: full?.type ?? "", name, thumbnail };
  wsSend({
    type: "subscribe_item_order_book",
    payload: { itemTypeId },
  });
}

function ItemGridCard({
  item,
  showStar,
}: {
  item: ItemHomeItem;
  showStar?: boolean;
}) {
  const removeFav = (e: MouseEvent) => {
    e.stopPropagation();
    wsSend({ type: "toggle_item_favourite", payload: { itemTypeId: item.itemTypeId } });
  };

  return (
    <div
      class="home-grid-card"
      onClick={() => selectItem(item.itemTypeId, item.name, item.thumbnail)}
    >
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
            <IconStore size={24} />
          </div>
        )}
      </div>
      <div class="home-grid-name" title={item.name}>
        {item.name}
      </div>
      <div class="home-grid-price">{formatItemDisplayPrice(item.avgPrice)}</div>
    </div>
  );
}

function ItemListRow({ item }: { item: ItemHomeItem }) {
  return (
    <div
      class="home-list-row"
      onClick={() => selectItem(item.itemTypeId, item.name, item.thumbnail)}
    >
      <div class="home-list-thumb">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" width={24} height={24} />
        ) : (
          <IconStore size={16} />
        )}
      </div>
      <span class="home-list-name" title={item.name}>
        {item.name}
      </span>
      <span class="home-list-price">{formatItemDisplayPrice(item.avgPrice)}</span>
    </div>
  );
}

export function ItemsHomeView() {
  const data = itemHomeData.value;
  if (!data) {
    return <div class="home-loading">Loading items...</div>;
  }

  const topSelling = padToSix(data.topSelling);

  // Derive favourites client-side from the live signal so toggles update instantly
  const favIds = itemFavourites.value;
  const serverFavPrices = new Map(
    (data.favourites ?? []).map((f) => [f.itemTypeId, f.avgPrice])
  );
  const favouriteItems: ItemHomeItem[] = allItemTypes.value
    .filter((it) => favIds.has(it.id))
    .slice(0, 6)
    .map((it) => ({
      itemTypeId: it.id,
      name: it.name,
      thumbnail: it.thumbnail,
      avgPrice: serverFavPrices.get(it.id) ?? null,
    }));
  const favourites = padToSix(favouriteItems);

  return (
    <div class="home-view">
      <div class="home-section">
        <h3 class="home-section-title">Top Selling</h3>
        <div class="home-grid">
          {topSelling.map((item, i) =>
            item ? (
              <ItemGridCard key={item.itemTypeId} item={item} />
            ) : (
              <GridPlaceholder key={`ph-ts-${i}`} />
            )
          )}
        </div>
      </div>

      <div class="home-section">
        <h3 class="home-section-title">Favourites</h3>
        <div class="home-grid">
          {favourites.map((item, i) =>
            item ? (
              <ItemGridCard key={item.itemTypeId} item={item} showStar />
            ) : (
              <GridPlaceholder key={`ph-fav-${i}`} />
            )
          )}
        </div>
      </div>

      <div class="home-lists">
        <div class="home-list">
          <div class="home-list-title">High Value</div>
          {data.highValue.length > 0 ? (
            data.highValue.map((item) => (
              <ItemListRow key={item.itemTypeId} item={item} />
            ))
          ) : (
            <div class="home-list-empty">No data yet</div>
          )}
        </div>

        <div class="home-list">
          <div class="home-list-title">In Demand</div>
          {data.inDemand.length > 0 ? (
            data.inDemand.map((item) => (
              <ItemListRow key={item.itemTypeId} item={item} />
            ))
          ) : (
            <div class="home-list-empty">No data yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ItemBackButton() {
  return (
    <button
      class="back-btn"
      onClick={() => {
        if (selectedItemTypeId.value) {
          wsSend({
            type: "unsubscribe_item_order_book",
            payload: { itemTypeId: selectedItemTypeId.value },
          });
        }
        selectedItemTypeId.value = null;
        selectedItemInfo.value = null;
        itemOrderBook.value = null;
      }}
    >
      <IconArrowLeft size={14} /> Back to Items
    </button>
  );
}
