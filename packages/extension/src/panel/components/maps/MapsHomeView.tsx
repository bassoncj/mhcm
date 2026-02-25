import type { MapHomeItem } from "@mhcm/shared";
import {
  mapHomeData,
  selectedMapTypeId,
  selectedMapMode,
  selectedMapInfo,
  mapOrderBook,
  allMapTypes,
  mapFavourites,
} from "../../signals/maps.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconMap, IconStarFilled, IconArrowLeft } from "../common/Icons.js";
import { formatPrice, padToSix } from "../../utils/format.js";
import { GridPlaceholder } from "../common/GridPlaceholder.js";

function selectMap(mapTypeId: number, displayName: string, thumbnail: string | null) {
  if (selectedMapTypeId.value != null) {
    wsSend({
      type: "unsubscribe_map_order_book",
      payload: { mapTypeId: selectedMapTypeId.value, mode: selectedMapMode.value },
    });
  }
  selectedMapTypeId.value = mapTypeId;
  selectedMapInfo.value = {
    id: mapTypeId,
    display_name: displayName,
    thumbnail,
  };
  mapOrderBook.value = null;
  wsSend({
    type: "subscribe_map_order_book",
    payload: { mapTypeId, mode: selectedMapMode.value },
  });
}

function MapGridCard({
  item,
  showStar,
}: {
  item: MapHomeItem;
  showStar?: boolean;
}) {
  const removeFav = (e: MouseEvent) => {
    e.stopPropagation();
    wsSend({
      type: "toggle_map_favourite",
      payload: { mapTypeId: item.mapTypeId, mode: selectedMapMode.value },
    });
  };

  return (
    <div
      class="home-grid-card"
      onClick={() => selectMap(item.mapTypeId, item.mapDisplayName, item.mapThumbnail)}
    >
      {showStar && (
        <span class="home-grid-star" onClick={removeFav}>
          <IconStarFilled size={14} />
        </span>
      )}
      <div class="home-grid-thumb">
        {item.mapThumbnail ? (
          <img
            class="home-grid-img"
            src={item.mapThumbnail}
            alt={item.mapDisplayName}
            width={48}
            height={48}
          />
        ) : (
          <div class="home-grid-img-placeholder">
            <IconMap size={24} />
          </div>
        )}
      </div>
      <div class="home-grid-name" title={item.mapDisplayName}>
        {item.mapDisplayName}
      </div>
      <div class="home-grid-price">{formatPrice(item.avgPrice)}</div>
    </div>
  );
}

function MapListRow({ item }: { item: MapHomeItem }) {
  return (
    <div
      class="home-list-row"
      onClick={() => selectMap(item.mapTypeId, item.mapDisplayName, item.mapThumbnail)}
    >
      <div class="home-list-thumb">
        {item.mapThumbnail ? (
          <img src={item.mapThumbnail} alt="" width={24} height={24} />
        ) : (
          <IconMap size={16} />
        )}
      </div>
      <span class="home-list-name" title={item.mapDisplayName}>
        {item.mapDisplayName}
      </span>
      <span class="home-list-price">{formatPrice(item.avgPrice)}</span>
    </div>
  );
}

export function MapsHomeView() {
  const data = mapHomeData.value;
  if (!data) {
    return <div class="home-loading">Loading maps...</div>;
  }

  const topSelling = padToSix(data.topSelling);

  // Derive favourites client-side from the live signal so toggles update instantly
  const favIds = mapFavourites.value;
  const serverFavPrices = new Map(
    (data.favourites ?? []).map((f) => [f.mapTypeId, f.avgPrice])
  );
  const favouriteItems: MapHomeItem[] = allMapTypes.value
    .filter((mt) => favIds.has(mt.id))
    .slice(0, 6)
    .map((mt) => ({
      mapTypeId: mt.id,
      mapDisplayName: mt.displayName,
      mapThumbnail: mt.thumbnail,
      avgPrice: serverFavPrices.get(mt.id) ?? null,
      volume: 0,
    }));
  const favourites = padToSix(favouriteItems);

  return (
    <div class="home-view">
      <div class="home-section">
        <h3 class="home-section-title">Top Selling</h3>
        <div class="home-grid">
          {topSelling.map((item, i) =>
            item ? (
              <MapGridCard key={item.mapTypeId} item={item} />
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
              <MapGridCard key={item.mapTypeId} item={item} showStar />
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
              <MapListRow key={item.mapTypeId} item={item} />
            ))
          ) : (
            <div class="home-list-empty">No data yet</div>
          )}
        </div>

        <div class="home-list">
          <div class="home-list-title">In Demand</div>
          {data.inDemand.length > 0 ? (
            data.inDemand.map((item) => (
              <MapListRow key={item.mapTypeId} item={item} />
            ))
          ) : (
            <div class="home-list-empty">No data yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MapBackButton() {
  return (
    <button
      class="back-btn"
      onClick={() => {
        if (selectedMapTypeId.value != null) {
          wsSend({
            type: "unsubscribe_map_order_book",
            payload: { mapTypeId: selectedMapTypeId.value, mode: selectedMapMode.value },
          });
        }
        selectedMapTypeId.value = null;
        selectedMapInfo.value = null;
        mapOrderBook.value = null;
      }}
    >
      <IconArrowLeft size={14} /> Back to Home
    </button>
  );
}
