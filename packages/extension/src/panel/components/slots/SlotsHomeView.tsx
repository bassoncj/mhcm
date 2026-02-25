import type { HomeMapItem } from "@mhcm/shared";
import { homeData, favouriteMapTypeIds, mapTypes, mapTypeStats, selectedMapTypeId } from "../../signals/slots.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconMap, IconStarFilled, IconArrowLeft } from "../common/Icons.js";
import { formatPrice, padToSix } from "../../utils/format.js";
import { GridPlaceholder } from "../common/GridPlaceholder.js";

function selectMap(mapTypeId: number) {
  if (selectedMapTypeId.value) {
    wsSend({
      type: "unsubscribe_order_book",
      payload: { mapTypeId: selectedMapTypeId.value },
    });
  }
  selectedMapTypeId.value = mapTypeId;
  wsSend({
    type: "subscribe_order_book",
    payload: { mapTypeId },
  });
}

function shortName(mapTypeId: number, displayName: string): string {
  const mt = mapTypes.value.find((t) => t.id === mapTypeId);
  return mt?.alias ?? displayName;
}

function MapGridCard({
  item,
  showStar,
}: {
  item: HomeMapItem;
  showStar?: boolean;
}) {
  const removeFav = (e: MouseEvent) => {
    e.stopPropagation();
    wsSend({ type: "remove_favourite", payload: { mapTypeId: item.mapTypeId } });
  };

  return (
    <div class="home-grid-card" onClick={() => selectMap(item.mapTypeId)}>
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
            alt={item.displayName}
            width={48}
            height={48}
          />
        ) : (
          <div class="home-grid-img-placeholder">
            <IconMap size={24} />
          </div>
        )}
      </div>
      <div class="home-grid-name" title={item.displayName}>
        {shortName(item.mapTypeId, item.displayName)}
      </div>
      <div class="home-grid-price">{formatPrice(item.avgPrice)}</div>
    </div>
  );
}

function MapListRow({ item }: { item: HomeMapItem }) {
  return (
    <div class="home-list-row" onClick={() => selectMap(item.mapTypeId)}>
      <div class="home-list-thumb">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" width={24} height={24} />
        ) : (
          <IconMap size={16} />
        )}
      </div>
      <span class="home-list-name" title={item.displayName}>
        {shortName(item.mapTypeId, item.displayName)}
      </span>
      <span class="home-list-price">{formatPrice(item.avgPrice)}</span>
    </div>
  );
}

export function SlotsHomeView() {
  const data = homeData.value;
  const favIds = favouriteMapTypeIds.value;
  const types = mapTypes.value;
  const stats = mapTypeStats.value;

  // Build favourites from IDs + local catalog data
  const favourites: HomeMapItem[] = [];
  for (const id of favIds) {
    const mt = types.find((t) => t.id === id);
    if (!mt) continue;
    const typeStats = stats[id];
    favourites.push({
      mapTypeId: id,
      displayName: mt.displayName,
      thumbnail: mt.thumbnail,
      avgPrice: typeStats?.avgPrice ?? null,
    });
  }

  const topSelling = data?.topSelling ?? [];
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
              <MapGridCard key={item.mapTypeId} item={item} />
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
              <MapGridCard key={item.mapTypeId} item={item} showStar />
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
              <MapListRow key={item.mapTypeId} item={item} />
            ))
          ) : (
            <div class="home-list-empty">No data yet</div>
          )}
        </div>
        <div class="home-list">
          <div class="home-list-title">In Demand</div>
          {inDemand.length > 0 ? (
            inDemand.map((item) => (
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

export function SlotBackButton() {
  const goHome = () => {
    if (selectedMapTypeId.value) {
      wsSend({
        type: "unsubscribe_order_book",
        payload: { mapTypeId: selectedMapTypeId.value },
      });
    }
    selectedMapTypeId.value = null;
  };

  return (
    <button type="button" class="back-btn" onClick={goHome}>
      <IconArrowLeft size={14} /> Back to Home
    </button>
  );
}
