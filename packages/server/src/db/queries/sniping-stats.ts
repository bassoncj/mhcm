import type { SnipingTarget } from "@mhcm/shared";
import { getDb } from "../connection.js";
import { demoTxnFilter } from "../../demo/demo-mode.js";

export interface SnipingPriceHistoryPoint {
  date: string;
  avgPrice: number;
  volume: number;
}

export interface SnipingSalesStats {
  yesterday: number;
  week: number;
  month: number;
}

export interface SnipingMarketStatsResult {
  priceHistory: SnipingPriceHistoryPoint[];
  sales: SnipingSalesStats;
}

/**
 * Market stats for a sniping target: daily price history + snipe volume.
 * Group and individual price histories are completely independent.
 * - Mouse targets: sniping_price_history with fallback to seed data
 * - Group targets: sniping_group_price_history (no seed fallback)
 * Bounded to complete days only (through end of yesterday) for cacheability.
 */
export function getSnipingMarketStats(target: SnipingTarget): SnipingMarketStatsResult {
  if (target.mouseGroupId != null) return getGroupStats(target.mouseGroupId);
  if (target.itemTypeId != null) return getItemStats(target.itemTypeId);
  if (target.itemGroupId != null) return getItemGroupStats(target.itemGroupId);
  return getMouseStats(target.mouseTypeId!);
}

function getMouseStats(mouseTypeId: number): SnipingMarketStatsResult {
  const db = getDb();

  // Check if we have live price history
  const liveCount = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM sniping_price_history
       WHERE mouse_type_id = ? AND DATE(completed_at) >= DATE('now', '-31 days')${demoTxnFilter("sniping_price_history", "sniping")}`
    )
    .get(mouseTypeId) as { cnt: number };

  if (liveCount.cnt > 0) {
    return getLiveStats(mouseTypeId);
  }

  // Fall back to seed data
  return getSeedStats(mouseTypeId);
}

function getGroupStats(groupId: number): SnipingMarketStatsResult {
  const db = getDb();

  const priceHistory = db
    .prepare(
      `SELECT DATE(completed_at) as date,
              ROUND(AVG(price)) as avg_price,
              COUNT(*) as volume
       FROM sniping_group_price_history
       WHERE group_id = ?
         AND DATE(completed_at) >= DATE('now', '-31 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("sniping_group_price_history", "sniping")}
       GROUP BY DATE(completed_at)
       ORDER BY date ASC`
    )
    .all(groupId) as Array<{ date: string; avg_price: number; volume: number }>;

  const salesRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(completed_at) = DATE('now', '-1 day') THEN 1 ELSE 0 END), 0) as yesterday,
         COALESCE(SUM(CASE WHEN DATE(completed_at) >= DATE('now', '-7 days') THEN 1 ELSE 0 END), 0) as week,
         COALESCE(COUNT(*), 0) as month
       FROM sniping_group_price_history
       WHERE group_id = ?
         AND DATE(completed_at) >= DATE('now', '-31 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("sniping_group_price_history", "sniping")}`
    )
    .get(groupId) as { yesterday: number; week: number; month: number };

  return {
    priceHistory: priceHistory.map((r) => ({
      date: r.date,
      avgPrice: r.avg_price,
      volume: r.volume,
    })),
    sales: {
      yesterday: salesRow.yesterday,
      week: salesRow.week,
      month: salesRow.month,
    },
  };
}

function getLiveStats(mouseTypeId: number): SnipingMarketStatsResult {
  const db = getDb();

  const priceHistory = db
    .prepare(
      `SELECT DATE(completed_at) as date,
              ROUND(AVG(price)) as avg_price,
              COUNT(*) as volume
       FROM sniping_price_history
       WHERE mouse_type_id = ?
         AND DATE(completed_at) >= DATE('now', '-31 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("sniping_price_history", "sniping")}
       GROUP BY DATE(completed_at)
       ORDER BY date ASC`
    )
    .all(mouseTypeId) as Array<{ date: string; avg_price: number; volume: number }>;

  const salesRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(completed_at) = DATE('now', '-1 day') THEN 1 ELSE 0 END), 0) as yesterday,
         COALESCE(SUM(CASE WHEN DATE(completed_at) >= DATE('now', '-7 days') THEN 1 ELSE 0 END), 0) as week,
         COALESCE(COUNT(*), 0) as month
       FROM sniping_price_history
       WHERE mouse_type_id = ?
         AND DATE(completed_at) >= DATE('now', '-31 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("sniping_price_history", "sniping")}`
    )
    .get(mouseTypeId) as { yesterday: number; week: number; month: number };

  return {
    priceHistory: priceHistory.map((r) => ({
      date: r.date,
      avgPrice: r.avg_price,
      volume: r.volume,
    })),
    sales: {
      yesterday: salesRow.yesterday,
      week: salesRow.week,
      month: salesRow.month,
    },
  };
}

function getSeedStats(mouseTypeId: number): SnipingMarketStatsResult {
  const db = getDb();

  // Find the most recent date in seed data to anchor relative time windows
  const maxDateRow = db
    .prepare(
      `SELECT MAX(DATE(recorded_at)) as max_date
       FROM sniping_price_seeds WHERE mouse_type_id = ?`
    )
    .get(mouseTypeId) as { max_date: string | null } | undefined;

  const maxDate = maxDateRow?.max_date;
  if (!maxDate) {
    return { priceHistory: [], sales: { yesterday: 0, week: 0, month: 0 } };
  }

  const priceHistory = db
    .prepare(
      `SELECT DATE(recorded_at) as date,
              ROUND(AVG(price)) as avg_price,
              COUNT(*) as volume
       FROM sniping_price_seeds
       WHERE mouse_type_id = ?
         AND DATE(recorded_at) >= DATE(?, '-31 days')
         AND DATE(recorded_at) <= DATE(?)
       GROUP BY DATE(recorded_at)
       ORDER BY date ASC`
    )
    .all(mouseTypeId, maxDate, maxDate) as Array<{
    date: string;
    avg_price: number;
    volume: number;
  }>;

  // Compute yesterday/week/month relative to the most recent seed date
  const salesRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(recorded_at) = DATE(?) THEN 1 ELSE 0 END), 0) as yesterday,
         COALESCE(SUM(CASE WHEN DATE(recorded_at) >= DATE(?, '-6 days') THEN 1 ELSE 0 END), 0) as week,
         COALESCE(COUNT(*), 0) as month
       FROM sniping_price_seeds
       WHERE mouse_type_id = ?
         AND DATE(recorded_at) >= DATE(?, '-31 days')
         AND DATE(recorded_at) <= DATE(?)`
    )
    .get(maxDate, maxDate, mouseTypeId, maxDate, maxDate) as {
    yesterday: number;
    week: number;
    month: number;
  };

  return {
    priceHistory: priceHistory.map((r) => ({
      date: r.date,
      avgPrice: r.avg_price,
      volume: r.volume,
    })),
    sales: {
      yesterday: salesRow.yesterday,
      week: salesRow.week,
      month: salesRow.month,
    },
  };
}

function getItemStats(itemTypeId: number): SnipingMarketStatsResult {
  const db = getDb();

  const priceHistory = db
    .prepare(
      `SELECT DATE(completed_at) as date,
              ROUND(AVG(price)) as avg_price,
              COUNT(*) as volume
       FROM sniping_item_price_history
       WHERE item_type_id = ?
         AND DATE(completed_at) >= DATE('now', '-31 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("sniping_item_price_history", "sniping")}
       GROUP BY DATE(completed_at)
       ORDER BY date ASC`
    )
    .all(itemTypeId) as Array<{ date: string; avg_price: number; volume: number }>;

  const salesRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(completed_at) = DATE('now', '-1 day') THEN 1 ELSE 0 END), 0) as yesterday,
         COALESCE(SUM(CASE WHEN DATE(completed_at) >= DATE('now', '-7 days') THEN 1 ELSE 0 END), 0) as week,
         COALESCE(COUNT(*), 0) as month
       FROM sniping_item_price_history
       WHERE item_type_id = ?
         AND DATE(completed_at) >= DATE('now', '-31 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("sniping_item_price_history", "sniping")}`
    )
    .get(itemTypeId) as { yesterday: number; week: number; month: number };

  return {
    priceHistory: priceHistory.map((r) => ({
      date: r.date,
      avgPrice: r.avg_price,
      volume: r.volume,
    })),
    sales: {
      yesterday: salesRow.yesterday,
      week: salesRow.week,
      month: salesRow.month,
    },
  };
}

function getItemGroupStats(groupId: number): SnipingMarketStatsResult {
  const db = getDb();

  const priceHistory = db
    .prepare(
      `SELECT DATE(completed_at) as date,
              ROUND(AVG(price)) as avg_price,
              COUNT(*) as volume
       FROM sniping_item_group_price_history
       WHERE item_group_id = ?
         AND DATE(completed_at) >= DATE('now', '-31 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("sniping_item_group_price_history", "sniping")}
       GROUP BY DATE(completed_at)
       ORDER BY date ASC`
    )
    .all(groupId) as Array<{ date: string; avg_price: number; volume: number }>;

  const salesRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(completed_at) = DATE('now', '-1 day') THEN 1 ELSE 0 END), 0) as yesterday,
         COALESCE(SUM(CASE WHEN DATE(completed_at) >= DATE('now', '-7 days') THEN 1 ELSE 0 END), 0) as week,
         COALESCE(COUNT(*), 0) as month
       FROM sniping_item_group_price_history
       WHERE item_group_id = ?
         AND DATE(completed_at) >= DATE('now', '-31 days')
         AND DATE(completed_at) <= DATE('now', '-1 day')${demoTxnFilter("sniping_item_group_price_history", "sniping")}`
    )
    .get(groupId) as { yesterday: number; week: number; month: number };

  return {
    priceHistory: priceHistory.map((r) => ({
      date: r.date,
      avgPrice: r.avg_price,
      volume: r.volume,
    })),
    sales: {
      yesterday: salesRow.yesterday,
      week: salesRow.week,
      month: salesRow.month,
    },
  };
}

let snipingStatsCacheDate: string | null = null;
const snipingStatsCache = new Map<string, SnipingMarketStatsResult>();

function statsCacheKey(target: SnipingTarget): string {
  if (target.mouseGroupId != null) return `g:${target.mouseGroupId}`;
  if (target.itemTypeId != null) return `i:${target.itemTypeId}`;
  if (target.itemGroupId != null) return `ig:${target.itemGroupId}`;
  return `m:${target.mouseTypeId}`;
}

export function getSnipingMarketStatsCached(target: SnipingTarget): SnipingMarketStatsResult {
  const today = new Date().toISOString().slice(0, 10);
  if (snipingStatsCacheDate !== today) {
    snipingStatsCache.clear();
    snipingStatsCacheDate = today;
  }

  const key = statsCacheKey(target);
  const cached = snipingStatsCache.get(key);
  if (cached) return cached;

  const stats = getSnipingMarketStats(target);
  snipingStatsCache.set(key, stats);
  return stats;
}

export function invalidateSnipingStatsCache(): void {
  snipingStatsCacheDate = null;
  snipingStatsCache.clear();
}
