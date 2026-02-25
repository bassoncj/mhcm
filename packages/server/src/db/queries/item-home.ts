import type { ItemHomeData, ItemHomeItem } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoOrderFilter, demoTxnFilter } from "../../demo/demo-mode.js";
import { getAvgPriceByItemType } from "./item-transactions.js";

function getTopSelling(limit: number = 6): ItemHomeItem[] {
  const rows = getDb()
    .prepare(
      `SELECT iph.item_type_id, it.name, it.thumbnail,
              ROUND(AVG(iph.price), 1) as avg_price, SUM(iph.quantity) as volume
       FROM item_price_history iph
       JOIN item_types it ON it.id = iph.item_type_id
       WHERE DATE(iph.completed_at) >= DATE('now', '-7 days')
         AND DATE(iph.completed_at) <= DATE('now', '-1 day')
         AND it.enabled = 1${demoTxnFilter("iph", "items")}
       GROUP BY iph.item_type_id
       ORDER BY volume DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    item_type_id: number;
    name: string;
    thumbnail: string | null;
    avg_price: number | null;
  }>;

  return rows.map((r) => ({
    itemTypeId: r.item_type_id,
    name: r.name,
    thumbnail: r.thumbnail,
    avgPrice: r.avg_price,
  }));
}

function getHighValue(limit: number = 5): ItemHomeItem[] {
  const rows = getDb()
    .prepare(
      `SELECT iph.item_type_id, it.name, it.thumbnail,
              ROUND(AVG(iph.price), 1) as avg_price
       FROM item_price_history iph
       JOIN item_types it ON it.id = iph.item_type_id
       WHERE DATE(iph.completed_at) >= DATE('now', '-7 days')
         AND DATE(iph.completed_at) <= DATE('now', '-1 day')
         AND it.enabled = 1${demoTxnFilter("iph", "items")}
       GROUP BY iph.item_type_id
       ORDER BY avg_price DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    item_type_id: number;
    name: string;
    thumbnail: string | null;
    avg_price: number | null;
  }>;

  return rows.map((r) => ({
    itemTypeId: r.item_type_id,
    name: r.name,
    thumbnail: r.thumbnail,
    avgPrice: r.avg_price,
  }));
}

function getInDemand(limit: number = 5): ItemHomeItem[] {
  const rows = getDb()
    .prepare(
      `SELECT o.item_type_id, it.name, it.thumbnail,
              SUM(o.quantity - o.filled_quantity) as buy_volume
       FROM item_orders o
       JOIN item_types it ON it.id = o.item_type_id
       WHERE o.side = 'buy'
         AND o.status IN ('open', 'partially_filled')
         AND it.enabled = 1${demoOrderFilter("o", "items")}
       GROUP BY o.item_type_id
       ORDER BY buy_volume DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    item_type_id: number;
    name: string;
    thumbnail: string | null;
  }>;

  const avgPrices = getAvgPriceByItemType();

  return rows.map((r) => ({
    itemTypeId: r.item_type_id,
    name: r.name,
    thumbnail: r.thumbnail,
    avgPrice: avgPrices[r.item_type_id] ?? null,
  }));
}

function getFavourites(userId: number, limit: number = 6): ItemHomeItem[] {
  const rows = getDb()
    .prepare(
      `SELECT it.id as item_type_id, it.name, it.thumbnail
       FROM user_item_favourites uif
       JOIN item_types it ON it.id = uif.item_type_id
       WHERE uif.user_id = ? AND it.enabled = 1
       ORDER BY uif.created_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as Array<{
    item_type_id: number;
    name: string;
    thumbnail: string | null;
  }>;

  const avgPrices = getAvgPriceByItemType();

  return rows.map((r) => ({
    itemTypeId: r.item_type_id,
    name: r.name,
    thumbnail: r.thumbnail,
    avgPrice: avgPrices[r.item_type_id] ?? null,
  }));
}

let itemHomeCacheDate: string | null = null;
let sharedSectionsCache: {
  topSelling: ItemHomeItem[];
  highValue: ItemHomeItem[];
  inDemand: ItemHomeItem[];
} | null = null;

export function computeItemHomeData(userId: number): ItemHomeData {
  const today = new Date().toISOString().slice(0, 10);
  if (itemHomeCacheDate !== today || !sharedSectionsCache) {
    sharedSectionsCache = {
      topSelling: getTopSelling(),
      highValue: getHighValue(),
      inDemand: getInDemand(),
    };
    itemHomeCacheDate = today;
  }

  return {
    ...sharedSectionsCache,
    favourites: getFavourites(userId),
  };
}

export function invalidateItemHomeCache(): void {
  itemHomeCacheDate = null;
  sharedSectionsCache = null;
}
