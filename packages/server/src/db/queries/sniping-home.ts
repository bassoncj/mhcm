import type { SnipingHomeGoalItem, SnipingHomeMouseItem } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoOrderFilter, demoTxnFilter } from "../../demo/demo-mode.js";
import { getGroupThumbDataUrl } from "../../util/group-thumb.js";

interface TopSellingRow {
  mouse_type_id: number;
  name: string;
  thumbnail: string | null;
  avg_price: number | null;
  volume: number;
}

/**
 * Mice/groups with the most completed snipe volume in the last 7 days.
 * Groups appear mixed in alongside individual mice.
 */
function getTopSelling(limit = 6): SnipingHomeMouseItem[] {
  const db = getDb();

  // Individual mice – try live data first, fall back to seed
  let mouseRows = db
    .prepare(
      `SELECT ph.mouse_type_id, mt.name, mt.thumbnail,
              ROUND(AVG(ph.price)) as avg_price, COUNT(*) as volume
       FROM sniping_price_history ph
       JOIN mouse_types mt ON mt.id = ph.mouse_type_id
       WHERE DATE(ph.completed_at) >= DATE('now', '-7 days')
         AND DATE(ph.completed_at) <= DATE('now', '-1 day')${demoTxnFilter("ph", "sniping")}
       GROUP BY ph.mouse_type_id
       ORDER BY volume DESC
       LIMIT ?`
    )
    .all(limit) as TopSellingRow[];

  if (mouseRows.length === 0) {
    mouseRows = db
      .prepare(
        `SELECT ps.mouse_type_id, mt.name, mt.thumbnail,
                ROUND(AVG(ps.price)) as avg_price, COUNT(*) as volume
         FROM sniping_price_seeds ps
         JOIN mouse_types mt ON mt.id = ps.mouse_type_id
         GROUP BY ps.mouse_type_id
         ORDER BY volume DESC
         LIMIT ?`
      )
      .all(limit) as TopSellingRow[];
  }

  const items: Array<SnipingHomeMouseItem & { _volume: number }> = mouseRows.map((r) => ({
    mouseTypeId: r.mouse_type_id,
    name: r.name,
    thumbnail: r.thumbnail,
    avgPrice: r.avg_price,
    _volume: r.volume,
  }));

  // Groups from sniping_group_price_history
  const groupRows = db
    .prepare(
      `SELECT gph.group_id, g.name,
              ROUND(AVG(gph.price)) as avg_price, COUNT(*) as volume
       FROM sniping_group_price_history gph
       JOIN sniping_mouse_groups g ON g.id = gph.group_id
       WHERE g.enabled = 1 AND g.archived = 0
         AND DATE(gph.completed_at) >= DATE('now', '-7 days')
         AND DATE(gph.completed_at) <= DATE('now', '-1 day')${demoTxnFilter("gph", "sniping")}
       GROUP BY gph.group_id
       ORDER BY volume DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ group_id: number; name: string; avg_price: number | null; volume: number }>;

  for (const r of groupRows) {
    items.push({
      mouseGroupId: r.group_id,
      isGroup: true,
      name: r.name,
      thumbnail: getGroupThumbDataUrl(r.group_id),
      avgPrice: r.avg_price,
      _volume: r.volume,
    });
  }

  // Merge by volume, take top N
  items.sort((a, b) => b._volume - a._volume);
  return items.slice(0, limit).map(({ _volume, ...item }) => item);
}

interface HighValueRow {
  mouse_type_id: number;
  name: string;
  thumbnail: string | null;
  avg_price: number | null;
}

function getHighValue(limit = 5): SnipingHomeMouseItem[] {
  const db = getDb();

  let mouseRows = db
    .prepare(
      `SELECT ph.mouse_type_id, mt.name, mt.thumbnail,
              ROUND(AVG(ph.price)) as avg_price
       FROM sniping_price_history ph
       JOIN mouse_types mt ON mt.id = ph.mouse_type_id
       WHERE DATE(ph.completed_at) >= DATE('now', '-7 days')
         AND DATE(ph.completed_at) <= DATE('now', '-1 day')${demoTxnFilter("ph", "sniping")}
       GROUP BY ph.mouse_type_id
       ORDER BY avg_price DESC
       LIMIT ?`
    )
    .all(limit) as HighValueRow[];

  if (mouseRows.length === 0) {
    mouseRows = db
      .prepare(
        `SELECT ps.mouse_type_id, mt.name, mt.thumbnail,
                ROUND(AVG(ps.price)) as avg_price
         FROM sniping_price_seeds ps
         JOIN mouse_types mt ON mt.id = ps.mouse_type_id
         GROUP BY ps.mouse_type_id
         ORDER BY avg_price DESC
         LIMIT ?`
      )
      .all(limit) as HighValueRow[];
  }

  const items: Array<SnipingHomeMouseItem & { _avgPrice: number }> = mouseRows
    .filter((r) => r.avg_price != null)
    .map((r) => ({
      mouseTypeId: r.mouse_type_id,
      name: r.name,
      thumbnail: r.thumbnail,
      avgPrice: r.avg_price,
      _avgPrice: r.avg_price!,
    }));

  // Groups
  const groupRows = db
    .prepare(
      `SELECT gph.group_id, g.name,
              ROUND(AVG(gph.price)) as avg_price
       FROM sniping_group_price_history gph
       JOIN sniping_mouse_groups g ON g.id = gph.group_id
       WHERE g.enabled = 1 AND g.archived = 0
         AND DATE(gph.completed_at) >= DATE('now', '-7 days')
         AND DATE(gph.completed_at) <= DATE('now', '-1 day')${demoTxnFilter("gph", "sniping")}
       GROUP BY gph.group_id
       ORDER BY avg_price DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ group_id: number; name: string; avg_price: number | null }>;

  for (const r of groupRows) {
    if (r.avg_price != null) {
      items.push({
        mouseGroupId: r.group_id,
        isGroup: true,
        name: r.name,
        thumbnail: getGroupThumbDataUrl(r.group_id),
        avgPrice: r.avg_price,
        _avgPrice: r.avg_price,
      });
    }
  }

  items.sort((a, b) => b._avgPrice - a._avgPrice);
  return items.slice(0, limit).map(({ _avgPrice, ...item }) => item);
}

interface InDemandRow {
  mouse_type_id: number;
  name: string;
  thumbnail: string | null;
  buy_volume: number;
}

function getInDemand(limit = 5): SnipingHomeMouseItem[] {
  const db = getDb();

  const mouseRows = db
    .prepare(
      `SELECT so.mouse_type_id, mt.name, mt.thumbnail,
              COUNT(*) as buy_volume
       FROM sniping_orders so
       JOIN mouse_types mt ON mt.id = so.mouse_type_id
       WHERE so.side = 'sniper_buy'
         AND so.status = 'open'
         AND so.mouse_type_id IS NOT NULL${demoOrderFilter("so", "sniping")}
       GROUP BY so.mouse_type_id
       ORDER BY buy_volume DESC
       LIMIT ?`
    )
    .all(limit) as InDemandRow[];

  const items: Array<SnipingHomeMouseItem & { _volume: number }> = mouseRows.map((r) => ({
    mouseTypeId: r.mouse_type_id,
    name: r.name,
    thumbnail: r.thumbnail,
    avgPrice: null,
    _volume: r.buy_volume,
  }));

  // Groups with open buy orders
  const groupRows = db
    .prepare(
      `SELECT so.mouse_group_id as group_id, g.name,
              COUNT(*) as buy_volume
       FROM sniping_orders so
       JOIN sniping_mouse_groups g ON g.id = so.mouse_group_id
       WHERE so.side = 'sniper_buy'
         AND so.status = 'open'
         AND so.mouse_group_id IS NOT NULL
         AND g.enabled = 1 AND g.archived = 0${demoOrderFilter("so", "sniping")}
       GROUP BY so.mouse_group_id
       ORDER BY buy_volume DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ group_id: number; name: string; buy_volume: number }>;

  for (const r of groupRows) {
    items.push({
      mouseGroupId: r.group_id,
      isGroup: true,
      name: r.name,
      thumbnail: getGroupThumbDataUrl(r.group_id),
      avgPrice: null,
      _volume: r.buy_volume,
    });
  }

  items.sort((a, b) => b._volume - a._volume);
  return items.slice(0, limit).map(({ _volume, ...item }) => item);
}

interface SnipingHomeCacheData {
  topSelling: SnipingHomeMouseItem[];
  highValue: SnipingHomeMouseItem[];
  inDemand: SnipingHomeMouseItem[];
}

let snipingHomeCacheDate: string | null = null;
let snipingHomeCache: SnipingHomeCacheData | null = null;

export function computeSnipingHomeData(): SnipingHomeCacheData {
  const today = new Date().toISOString().slice(0, 10);
  if (snipingHomeCacheDate === today && snipingHomeCache) {
    return snipingHomeCache;
  }

  snipingHomeCache = {
    topSelling: getTopSelling(),
    highValue: getHighValue(),
    inDemand: getInDemand(),
  };
  snipingHomeCacheDate = today;
  return snipingHomeCache;
}

export function invalidateSnipingHomeCache(): void {
  snipingHomeCacheDate = null;
  snipingHomeCache = null;
}

interface ItemTopSellingRow {
  item_type_id: number;
  name: string;
  thumbnail: string | null;
  avg_price: number | null;
  volume: number;
}

/**
 * Items/item-groups with the most completed snipe volume in the last 7 days.
 * No seed fallback – items don't have sniping_price_seeds.
 */
function getItemTopSelling(limit = 6): SnipingHomeGoalItem[] {
  const db = getDb();

  // Individual items
  const itemRows = db
    .prepare(
      `SELECT ph.item_type_id, it.name, it.thumbnail,
              ROUND(AVG(ph.price)) as avg_price, COUNT(*) as volume
       FROM sniping_item_price_history ph
       JOIN item_types it ON it.id = ph.item_type_id
       WHERE DATE(ph.completed_at) >= DATE('now', '-7 days')
         AND DATE(ph.completed_at) <= DATE('now', '-1 day')${demoTxnFilter("ph", "sniping")}
       GROUP BY ph.item_type_id
       ORDER BY volume DESC
       LIMIT ?`
    )
    .all(limit) as ItemTopSellingRow[];

  const items: Array<SnipingHomeGoalItem & { _volume: number }> = itemRows.map((r) => ({
    itemTypeId: r.item_type_id,
    name: r.name,
    thumbnail: r.thumbnail,
    avgPrice: r.avg_price,
    _volume: r.volume,
  }));

  // Item groups from sniping_item_group_price_history
  const groupRows = db
    .prepare(
      `SELECT gph.item_group_id as group_id, g.name,
              ROUND(AVG(gph.price)) as avg_price, COUNT(*) as volume
       FROM sniping_item_group_price_history gph
       JOIN sniping_item_groups g ON g.id = gph.item_group_id
       WHERE g.enabled = 1 AND g.archived = 0
         AND DATE(gph.completed_at) >= DATE('now', '-7 days')
         AND DATE(gph.completed_at) <= DATE('now', '-1 day')${demoTxnFilter("gph", "sniping")}
       GROUP BY gph.item_group_id
       ORDER BY volume DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ group_id: number; name: string; avg_price: number | null; volume: number }>;

  for (const r of groupRows) {
    items.push({
      itemGroupId: r.group_id,
      isGroup: true,
      name: r.name,
      thumbnail: getGroupThumbDataUrl(r.group_id, "item"),
      avgPrice: r.avg_price,
      _volume: r.volume,
    });
  }

  // Merge by volume, take top N
  items.sort((a, b) => b._volume - a._volume);
  return items.slice(0, limit).map(({ _volume, ...item }) => item);
}

interface ItemHighValueRow {
  item_type_id: number;
  name: string;
  thumbnail: string | null;
  avg_price: number | null;
}

function getItemHighValue(limit = 5): SnipingHomeGoalItem[] {
  const db = getDb();

  const itemRows = db
    .prepare(
      `SELECT ph.item_type_id, it.name, it.thumbnail,
              ROUND(AVG(ph.price)) as avg_price
       FROM sniping_item_price_history ph
       JOIN item_types it ON it.id = ph.item_type_id
       WHERE DATE(ph.completed_at) >= DATE('now', '-7 days')
         AND DATE(ph.completed_at) <= DATE('now', '-1 day')${demoTxnFilter("ph", "sniping")}
       GROUP BY ph.item_type_id
       ORDER BY avg_price DESC
       LIMIT ?`
    )
    .all(limit) as ItemHighValueRow[];

  const items: Array<SnipingHomeGoalItem & { _avgPrice: number }> = itemRows
    .filter((r) => r.avg_price != null)
    .map((r) => ({
      itemTypeId: r.item_type_id,
      name: r.name,
      thumbnail: r.thumbnail,
      avgPrice: r.avg_price,
      _avgPrice: r.avg_price!,
    }));

  // Item groups
  const groupRows = db
    .prepare(
      `SELECT gph.item_group_id as group_id, g.name,
              ROUND(AVG(gph.price)) as avg_price
       FROM sniping_item_group_price_history gph
       JOIN sniping_item_groups g ON g.id = gph.item_group_id
       WHERE g.enabled = 1 AND g.archived = 0
         AND DATE(gph.completed_at) >= DATE('now', '-7 days')
         AND DATE(gph.completed_at) <= DATE('now', '-1 day')${demoTxnFilter("gph", "sniping")}
       GROUP BY gph.item_group_id
       ORDER BY avg_price DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ group_id: number; name: string; avg_price: number | null }>;

  for (const r of groupRows) {
    if (r.avg_price != null) {
      items.push({
        itemGroupId: r.group_id,
        isGroup: true,
        name: r.name,
        thumbnail: getGroupThumbDataUrl(r.group_id, "item"),
        avgPrice: r.avg_price,
        _avgPrice: r.avg_price,
      });
    }
  }

  items.sort((a, b) => b._avgPrice - a._avgPrice);
  return items.slice(0, limit).map(({ _avgPrice, ...item }) => item);
}

interface ItemInDemandRow {
  item_type_id: number;
  name: string;
  thumbnail: string | null;
  buy_volume: number;
}

function getItemInDemand(limit = 5): SnipingHomeGoalItem[] {
  const db = getDb();

  const itemRows = db
    .prepare(
      `SELECT so.item_type_id, it.name, it.thumbnail,
              COUNT(*) as buy_volume
       FROM sniping_orders so
       JOIN item_types it ON it.id = so.item_type_id
       WHERE so.side = 'sniper_buy'
         AND so.status = 'open'
         AND so.item_type_id IS NOT NULL${demoOrderFilter("so", "sniping")}
       GROUP BY so.item_type_id
       ORDER BY buy_volume DESC
       LIMIT ?`
    )
    .all(limit) as ItemInDemandRow[];

  const items: Array<SnipingHomeGoalItem & { _volume: number }> = itemRows.map((r) => ({
    itemTypeId: r.item_type_id,
    name: r.name,
    thumbnail: r.thumbnail,
    avgPrice: null,
    _volume: r.buy_volume,
  }));

  // Item groups with open buy orders
  const groupRows = db
    .prepare(
      `SELECT so.item_group_id as group_id, g.name,
              COUNT(*) as buy_volume
       FROM sniping_orders so
       JOIN sniping_item_groups g ON g.id = so.item_group_id
       WHERE so.side = 'sniper_buy'
         AND so.status = 'open'
         AND so.item_group_id IS NOT NULL
         AND g.enabled = 1 AND g.archived = 0${demoOrderFilter("so", "sniping")}
       GROUP BY so.item_group_id
       ORDER BY buy_volume DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ group_id: number; name: string; buy_volume: number }>;

  for (const r of groupRows) {
    items.push({
      itemGroupId: r.group_id,
      isGroup: true,
      name: r.name,
      thumbnail: getGroupThumbDataUrl(r.group_id, "item"),
      avgPrice: null,
      _volume: r.buy_volume,
    });
  }

  items.sort((a, b) => b._volume - a._volume);
  return items.slice(0, limit).map(({ _volume, ...item }) => item);
}

interface SnipingItemHomeCacheData {
  topSelling: SnipingHomeGoalItem[];
  highValue: SnipingHomeGoalItem[];
  inDemand: SnipingHomeGoalItem[];
}

let snipingItemHomeCacheDate: string | null = null;
let snipingItemHomeCache: SnipingItemHomeCacheData | null = null;

export function computeSnipingItemHomeData(): SnipingItemHomeCacheData {
  const today = new Date().toISOString().slice(0, 10);
  if (snipingItemHomeCacheDate === today && snipingItemHomeCache) {
    return snipingItemHomeCache;
  }

  snipingItemHomeCache = {
    topSelling: getItemTopSelling(),
    highValue: getItemHighValue(),
    inDemand: getItemInDemand(),
  };
  snipingItemHomeCacheDate = today;
  return snipingItemHomeCache;
}

export function invalidateSnipingItemHomeCache(): void {
  snipingItemHomeCacheDate = null;
  snipingItemHomeCache = null;
}
