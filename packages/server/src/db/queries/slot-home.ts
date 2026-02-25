import type { HomeData, HomeMapItem } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { getAvgPriceByMapType } from "./slot-transactions.js";
import { demoOrderFilter, demoTxnFilter } from "../../demo/demo-mode.js";

interface TopSellingRow {
  map_type_id: number;
  display_name: string;
  thumbnail: string | null;
  avg_price: number | null;
  volume: number;
}

function getTopSelling(limit: number = 6): HomeMapItem[] {
  const rows = getDb()
    .prepare(
      `SELECT o.map_type_id, mt.display_name, mt.thumbnail,
              ROUND(AVG(t.price)) as avg_price, SUM(t.quantity) as volume
       FROM transactions t
       JOIN orders o ON o.id = t.sell_order_id
       JOIN map_types mt ON mt.id = o.map_type_id
       WHERE t.state = 'completed'
         AND DATE(t.created_at) >= DATE('now', '-7 days')
         AND DATE(t.created_at) <= DATE('now', '-1 day')
         AND mt.enabled_slots = 1
         ${demoTxnFilter("t", "slots")}
       GROUP BY o.map_type_id
       ORDER BY volume DESC
       LIMIT ?`
    )
    .all(limit) as TopSellingRow[];

  return rows.map((r) => ({
    mapTypeId: r.map_type_id,
    displayName: r.display_name,
    thumbnail: r.thumbnail,
    avgPrice: r.avg_price,
  }));
}

interface HighValueRow {
  map_type_id: number;
  display_name: string;
  thumbnail: string | null;
  avg_price: number | null;
}

function getHighValue(limit: number = 5): HomeMapItem[] {
  const rows = getDb()
    .prepare(
      `SELECT o.map_type_id, mt.display_name, mt.thumbnail,
              ROUND(AVG(t.price)) as avg_price
       FROM transactions t
       JOIN orders o ON o.id = t.sell_order_id
       JOIN map_types mt ON mt.id = o.map_type_id
       WHERE t.state = 'completed'
         AND DATE(t.created_at) >= DATE('now', '-7 days')
         AND DATE(t.created_at) <= DATE('now', '-1 day')
         AND mt.enabled_slots = 1
         ${demoTxnFilter("t", "slots")}
       GROUP BY o.map_type_id
       ORDER BY avg_price DESC
       LIMIT ?`
    )
    .all(limit) as HighValueRow[];

  return rows.map((r) => ({
    mapTypeId: r.map_type_id,
    displayName: r.display_name,
    thumbnail: r.thumbnail,
    avgPrice: r.avg_price,
  }));
}

interface InDemandRow {
  map_type_id: number;
  display_name: string;
  thumbnail: string | null;
  buy_volume: number;
}

function getInDemand(limit: number = 5): HomeMapItem[] {
  const rows = getDb()
    .prepare(
      `SELECT o.map_type_id, mt.display_name, mt.thumbnail,
              SUM(o.quantity - o.filled_quantity) as buy_volume
       FROM orders o
       JOIN map_types mt ON mt.id = o.map_type_id
       WHERE o.side = 'buy'
         AND o.status IN ('open', 'partially_filled')
         AND DATE(o.created_at) >= DATE('now', '-7 days')
         AND mt.enabled_slots = 1
         ${demoOrderFilter("o", "slots")}
       GROUP BY o.map_type_id
       ORDER BY buy_volume DESC
       LIMIT ?`
    )
    .all(limit) as InDemandRow[];

  // Enrich with avg price from the existing cached price data
  const avgPrices = getAvgPriceByMapType();

  return rows.map((r) => ({
    mapTypeId: r.map_type_id,
    displayName: r.display_name,
    thumbnail: r.thumbnail,
    avgPrice: avgPrices[r.map_type_id] ?? null,
  }));
}

let homeCacheDate: string | null = null;
let homeCache: HomeData | null = null;

export function computeHomeData(): HomeData {
  const today = new Date().toISOString().slice(0, 10);
  if (homeCacheDate === today && homeCache) {
    return homeCache;
  }

  homeCache = {
    topSelling: getTopSelling(),
    highValue: getHighValue(),
    inDemand: getInDemand(),
  };
  homeCacheDate = today;
  return homeCache;
}

export function invalidateHomeCache(): void {
  homeCacheDate = null;
  homeCache = null;
}
