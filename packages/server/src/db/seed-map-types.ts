import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection.js";

interface MouseRipItem {
  name: string;
  type: string;
  tags?: string[];
  images?: {
    transparent?: string;
  };
}

interface SeedItem {
  name: string;
  type: string;
  thumbnail: string | null;
}

interface ParsedSeedType {
  mapType: string;
  quality: "common" | "rare";
  displayName: string;
  thumbnail: string | null;
}

const MOUSE_RIP_API = "https://api.mouse.rip/items";

function getSeedPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "../../seed/treasure-chests.json");
}

/**
 * Clean up the display name:
 * - Strip "Rare " prefix (for rare items)
 * - Strip " Treasure Chest" / " Chest" suffix
 */
function cleanDisplayName(name: string, isRare: boolean): string {
  let clean = name;
  if (isRare) {
    clean = clean.replace(/^Rare\s+/, "");
  }
  clean = clean.replace(/\s+Treasure Chest$/, "");
  clean = clean.replace(/\s+Chest$/, "");
  return clean;
}

function parseSeedItems(items: SeedItem[]): ParsedSeedType[] {
  return items.map((item) => {
    const isRare = item.type.startsWith("rare_");
    return {
      mapType: item.type,
      quality: isRare ? "rare" : "common",
      displayName: cleanDisplayName(item.name, isRare),
      thumbnail: item.thumbnail,
    };
  });
}

async function fetchFromApi(): Promise<SeedItem[] | null> {
  try {
    console.log(`[seed-maps] fetching from ${MOUSE_RIP_API}...`);
    const res = await fetch(MOUSE_RIP_API);
    if (!res.ok) {
      console.log(`[seed-maps] API returned ${res.status}, will use cache`);
      return null;
    }
    const items: MouseRipItem[] = await res.json();

    // Filter to treasure chest items only
    const chests: SeedItem[] = [];
    for (const item of items) {
      const tags = item.tags ?? [];
      if (!tags.includes("treasure_chests")) continue;

      chests.push({
        name: item.name,
        type: item.type,
        thumbnail: item.images?.transparent || null,
      });
    }

    chests.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`[seed-maps] fetched ${chests.length} treasure chest items from API`);
    return chests;
  } catch (err) {
    console.log(`[seed-maps] API fetch failed: ${err}, will use cache`);
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
    console.log("[seed-maps] failed to parse cached treasure-chests.json");
    return null;
  }
}

function saveToCache(items: SeedItem[]): void {
  try {
    const seedPath = getSeedPath();
    writeFileSync(seedPath, JSON.stringify(items, null, 2) + "\n");
    console.log(`[seed-maps] cached ${items.length} items to seed/treasure-chests.json`);
  } catch (err) {
    console.log(`[seed-maps] failed to cache: ${err}`);
  }
}

/**
 * Seed map_types from mouse.rip API or cached JSON.
 * Uses INSERT OR IGNORE (on UNIQUE(map_type)) so existing rows are untouched.
 * All seeded types default to enabled=0 (disabled).
 * Thumbnails are updated on every restart so new thumbnail data is picked up.
 */
export async function seedMapTypes(): Promise<void> {
  const db = getDb();

  // Check if we already have data
  const count = db.prepare("SELECT COUNT(*) as cnt FROM map_types").get() as { cnt: number };
  const isEmpty = count.cnt === 0;

  // Try API first if table is empty, fall back to cache
  let items: SeedItem[] | null = null;

  if (isEmpty) {
    items = await fetchFromApi();
    if (items) {
      // Save fresh data to cache for future fallback
      saveToCache(items);
    }
  }

  if (!items) {
    // Try cache (either API failed or table not empty)
    items = loadFromCache();
    if (!items) {
      if (isEmpty) {
        console.log("[seed-maps] no map data available (API failed, no cache)");
      }
      return;
    }
    if (isEmpty) {
      console.log(`[seed-maps] loaded ${items.length} items from cache`);
    }
  }

  const mapTypes = parseSeedItems(items);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO map_types (map_type, quality, display_name, thumbnail, enabled)
     VALUES (@mapType, @quality, @displayName, @thumbnail, 0)`
  );

  const updateThumb = db.prepare(
    `UPDATE map_types SET thumbnail = @thumbnail
     WHERE map_type = @mapType AND thumbnail IS NOT @thumbnail`
  );

  const seedAll = db.transaction((types: ParsedSeedType[]) => {
    let inserted = 0;
    let thumbsUpdated = 0;
    for (const mt of types) {
      const result = insert.run(mt);
      if (result.changes > 0) {
        inserted++;
      } else if (mt.thumbnail) {
        const upd = updateThumb.run(mt);
        if (upd.changes > 0) thumbsUpdated++;
      }
    }
    return { inserted, thumbsUpdated };
  });

  const { inserted, thumbsUpdated } = seedAll(mapTypes);
  if (inserted > 0) {
    console.log(`[seed-maps] seeded ${inserted} new map types`);
  }
  if (thumbsUpdated > 0) {
    console.log(`[seed-maps] updated ${thumbsUpdated} map type thumbnails`);
  }
}