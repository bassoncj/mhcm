import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection.js";
import { MH_SB_ITEM_TYPE } from "@mhcm/shared";

interface MouseRipItem {
  id: number;
  type: string;
  name: string;
  classification: string;
  is_tradable: boolean;
  tags?: string[];
  images?: {
    transparent?: string;
    thumbnail?: string;
  };
}

interface SeedItem {
  id: number;
  type: string;
  name: string;
  classification: string;
  thumbnail: string | null;
  is_tradable: number;
  system_hidden: number;
}

const MOUSE_RIP_API = "https://api.mouse.rip/items";

/** Classifications that are never map goals – hide from mod tier UI. */
const HIDDEN_CLASSIFICATIONS = new Set([
  "achievement",
  "adventure",
  "base",
  "map_piece",
  "torn_page",
  "trinket_slot",
]);

/** API tags that indicate non-goal items – hide from mod tier UI. */
const HIDDEN_TAGS = new Set([
  "scroll_case",
  "treasure_chests",
  "theme_scraps",
  "codex",
]);

function isSystemHidden(classification: string, tags?: string[]): boolean {
  if (HIDDEN_CLASSIFICATIONS.has(classification)) return true;
  if (tags) {
    for (const tag of tags) {
      if (HIDDEN_TAGS.has(tag)) return true;
    }
  }
  return false;
}

function getSeedPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "../../seed/items.json");
}

async function fetchFromApi(): Promise<SeedItem[] | null> {
  try {
    console.log(`[seed-items] fetching from ${MOUSE_RIP_API}...`);
    const res = await fetch(MOUSE_RIP_API);
    if (!res.ok) {
      console.log(`[seed-items] API returned ${res.status}, will use cache`);
      return null;
    }
    const items: MouseRipItem[] = await res.json();

    const result: SeedItem[] = [];
    for (const item of items) {
      // Exclude SB – it's the currency, not a tradable good or goal
      if (item.type === MH_SB_ITEM_TYPE) continue;

      const transparent = item.images?.transparent || "";
      const thumbnail = transparent || item.images?.thumbnail || null;

      result.push({
        id: item.id,
        type: item.type,
        name: item.name,
        classification: item.classification,
        thumbnail,
        is_tradable: item.is_tradable ? 1 : 0,
        system_hidden: isSystemHidden(item.classification, item.tags) ? 1 : 0,
      });
    }

    result.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`[seed-items] fetched ${result.length} items from API`);
    return result;
  } catch (err) {
    console.log(`[seed-items] API fetch failed: ${err}, will use cache`);
    return null;
  }
}

function loadFromCache(): SeedItem[] | null {
  const seedPath = getSeedPath();
  if (!existsSync(seedPath)) {
    return null;
  }
  try {
    const raw = readFileSync(seedPath, "utf-8");
    return JSON.parse(raw) as SeedItem[];
  } catch {
    console.log("[seed-items] failed to parse cached items.json");
    return null;
  }
}

function saveToCache(items: SeedItem[]): void {
  try {
    const seedPath = getSeedPath();
    writeFileSync(seedPath, JSON.stringify(items, null, 2) + "\n");
    console.log(`[seed-items] cached ${items.length} items to seed/items.json`);
  } catch (err) {
    console.log(`[seed-items] failed to cache: ${err}`);
  }
}

/**
 * Seed item_types from mouse.rip API or cached JSON.
 * Uses INSERT OR IGNORE (on UNIQUE(type)) so existing rows are untouched.
 * All seeded types default to enabled=1.
 */
export async function seedItemTypes(): Promise<void> {
  const db = getDb();

  const count = db.prepare("SELECT COUNT(*) as cnt FROM item_types").get() as { cnt: number };
  const isEmpty = count.cnt === 0;

  let items: SeedItem[] | null = null;

  if (isEmpty) {
    items = await fetchFromApi();
    if (items) {
      saveToCache(items);
    }
  }

  if (!items) {
    items = loadFromCache();
    if (!items) {
      if (isEmpty) {
        console.log("[seed-items] no item data available (API failed, no cache)");
      }
      return;
    }
    if (isEmpty) {
      console.log(`[seed-items] loaded ${items.length} items from cache`);
    }
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO item_types (id, type, name, classification, thumbnail, is_tradable, system_hidden)
     VALUES (@id, @type, @name, @classification, @thumbnail, @is_tradable, @system_hidden)`
  );

  const seedAll = db.transaction((rows: SeedItem[]) => {
    let inserted = 0;
    for (const row of rows) {
      const result = insert.run(row);
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = seedAll(items);
  if (inserted > 0) {
    console.log(`[seed-items] seeded ${inserted} new item types`);
  }
}

/**
 * Incremental sync: fetch from API, insert new items, update is_tradable and system_hidden.
 * Returns the number of new items added.
 */
export async function incrementalSyncItemTypes(): Promise<number> {
  const items = await fetchFromApi();
  if (!items) return 0;

  // Update cache
  saveToCache(items);

  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO item_types (id, type, name, classification, thumbnail, is_tradable, system_hidden)
     VALUES (@id, @type, @name, @classification, @thumbnail, @is_tradable, @system_hidden)`
  );
  const updateFlags = db.prepare(
    `UPDATE item_types SET is_tradable = @is_tradable, system_hidden = @system_hidden WHERE id = @id`
  );

  const syncAll = db.transaction((rows: SeedItem[]) => {
    let inserted = 0;
    for (const row of rows) {
      const result = insert.run(row);
      if (result.changes > 0) {
        inserted++;
      } else {
        // Existing row – update flags in case they changed
        updateFlags.run({ id: row.id, is_tradable: row.is_tradable, system_hidden: row.system_hidden });
      }
    }
    return inserted;
  });

  const inserted = syncAll(items);
  if (inserted > 0) {
    console.log(`[seed-items] incremental sync: added ${inserted} new item types`);
  }
  return inserted;
}
