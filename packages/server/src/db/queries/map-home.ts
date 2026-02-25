import type { MapHomeData, MapHomeItem, MapOrderMode } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoOrderFilter, demoTxnFilter } from "../../demo/demo-mode.js";
import { getMapFavourites } from "./map-favourites.js";
import { getMapMarketStatsCached } from "./map-transactions.js";

function getTopSelling(mode: MapOrderMode, limit: number = 6): MapHomeItem[] {
  const rows = getDb()
    .prepare(
      `SELECT mph.map_type_id, mt.display_name, mt.thumbnail,
              ROUND(AVG(mph.price)) as avg_price, SUM(mph.quantity) as volume
       FROM map_price_history mph
       JOIN map_types mt ON mt.id = mph.map_type_id
       WHERE DATE(mph.completed_at) >= DATE('now', '-30 days')
         AND DATE(mph.completed_at) <= DATE('now', '-1 day')
         AND mph.mode = ?${demoTxnFilter("mph", "maps")}
       GROUP BY mph.map_type_id
       ORDER BY volume DESC
       LIMIT ?`
    )
    .all(mode, limit) as Array<{
    map_type_id: number;
    display_name: string;
    thumbnail: string | null;
    avg_price: number | null;
    volume: number;
  }>;

  return rows.map((r) => ({
    mapTypeId: r.map_type_id,
    mapDisplayName: r.display_name,
    mapThumbnail: r.thumbnail,
    avgPrice: r.avg_price,
    volume: r.volume,
  }));
}

function getHighValue(mode: MapOrderMode, limit: number = 5): MapHomeItem[] {
  const rows = getDb()
    .prepare(
      `SELECT mph.map_type_id, mt.display_name, mt.thumbnail,
              ROUND(AVG(mph.price)) as avg_price, COUNT(*) as volume
       FROM map_price_history mph
       JOIN map_types mt ON mt.id = mph.map_type_id
       WHERE DATE(mph.completed_at) >= DATE('now', '-30 days')
         AND DATE(mph.completed_at) <= DATE('now', '-1 day')
         AND mph.mode = ?${demoTxnFilter("mph", "maps")}
       GROUP BY mph.map_type_id
       ORDER BY avg_price DESC
       LIMIT ?`
    )
    .all(mode, limit) as Array<{
    map_type_id: number;
    display_name: string;
    thumbnail: string | null;
    avg_price: number | null;
    volume: number;
  }>;

  return rows.map((r) => ({
    mapTypeId: r.map_type_id,
    mapDisplayName: r.display_name,
    mapThumbnail: r.thumbnail,
    avgPrice: r.avg_price,
    volume: r.volume,
  }));
}

function getInDemand(mode: MapOrderMode, limit: number = 5): MapHomeItem[] {
  const rows = getDb()
    .prepare(
      `SELECT o.map_type_id, mt.display_name, mt.thumbnail,
              SUM(o.quantity - o.filled_quantity) as buy_volume
       FROM map_orders o
       JOIN map_types mt ON mt.id = o.map_type_id
       WHERE o.side = 'buy'
         AND o.mode = ?
         AND o.status IN ('open', 'partially_filled')${demoOrderFilter("o", "maps")}
       GROUP BY o.map_type_id
       ORDER BY buy_volume DESC
       LIMIT ?`
    )
    .all(mode, limit) as Array<{
    map_type_id: number;
    display_name: string;
    thumbnail: string | null;
    buy_volume: number;
  }>;

  return rows.map((r) => {
    const stats = getMapMarketStatsCached(r.map_type_id, mode);
    // Get most recent avg price from priceHistory
    const avgPrice = stats.priceHistory.length > 0
      ? stats.priceHistory[stats.priceHistory.length - 1].avgPrice
      : null;
    return {
      mapTypeId: r.map_type_id,
      mapDisplayName: r.display_name,
      mapThumbnail: r.thumbnail,
      avgPrice,
      volume: r.buy_volume,
    };
  });
}

function getFavourites(userId: number, mode: MapOrderMode, limit: number = 6): MapHomeItem[] {
  const favouriteIds = getMapFavourites(userId, mode);
  if (favouriteIds.length === 0) {
    return [];
  }

  const placeholders = favouriteIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT mt.id as map_type_id, mt.display_name, mt.thumbnail
       FROM map_types mt
       WHERE mt.id IN (${placeholders})
       LIMIT ?`
    )
    .all(...favouriteIds, limit) as Array<{
    map_type_id: number;
    display_name: string;
    thumbnail: string | null;
  }>;

  return rows.map((r) => {
    const stats = getMapMarketStatsCached(r.map_type_id, mode);
    // Get most recent avg price from priceHistory
    const avgPrice = stats.priceHistory.length > 0
      ? stats.priceHistory[stats.priceHistory.length - 1].avgPrice
      : null;
    return {
      mapTypeId: r.map_type_id,
      mapDisplayName: r.display_name,
      mapThumbnail: r.thumbnail,
      avgPrice,
      volume: 0, // No volume for favourites section
    };
  });
}

let mapHomeCacheDate: string | null = null;
const mapHomeCache = new Map<MapOrderMode, {
  topSelling: MapHomeItem[];
  highValue: MapHomeItem[];
  inDemand: MapHomeItem[];
}>();

export function computeMapHomeData(userId: number, mode: MapOrderMode): MapHomeData {
  const today = new Date().toISOString().slice(0, 10);

  // Reset cache at 00:00 UTC boundary
  if (mapHomeCacheDate !== today) {
    mapHomeCache.clear();
    mapHomeCacheDate = today;
  }

  // Get or compute shared sections for this mode
  let sharedSections = mapHomeCache.get(mode);
  if (!sharedSections) {
    sharedSections = {
      topSelling: getTopSelling(mode),
      highValue: getHighValue(mode),
      inDemand: getInDemand(mode),
    };
    mapHomeCache.set(mode, sharedSections);
  }

  return {
    mode,
    ...sharedSections,
    favourites: getFavourites(userId, mode),
  };
}

export function invalidateMapHomeCache(): void {
  mapHomeCacheDate = null;
  mapHomeCache.clear();
}
