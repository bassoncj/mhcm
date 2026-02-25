import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection.js";

interface MouseRipItem {
  id: number;
  type: string;
  name: string;
  tags?: string[];
  images?: {
    transparent?: string;
    thumbnail?: string;
  };
}

interface SeedScroll {
  id: number;
  type: string;
  name: string;
  thumbnail: string | null;
}

const MOUSE_RIP_API = "https://api.mouse.rip/items";

function getSeedPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "../../seed/scrolls.json");
}

async function fetchFromApi(): Promise<SeedScroll[] | null> {
  try {
    console.log(`[seed-scrolls] fetching from ${MOUSE_RIP_API}...`);
    const res = await fetch(MOUSE_RIP_API);
    if (!res.ok) {
      console.log(`[seed-scrolls] API returned ${res.status}, will use cache`);
      return null;
    }
    const items: MouseRipItem[] = await res.json();

    const scrolls: SeedScroll[] = [];
    for (const item of items) {
      // Filter for scroll_case tag (not is_tradable)
      if (!item.tags?.includes("scroll_case")) continue;

      const transparent = item.images?.transparent || "";
      const thumbnail = transparent || item.images?.thumbnail || null;

      scrolls.push({
        id: item.id,
        type: item.type,
        name: item.name,
        thumbnail,
      });
    }

    scrolls.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`[seed-scrolls] fetched ${scrolls.length} scroll cases from API`);
    return scrolls;
  } catch (err) {
    console.log(`[seed-scrolls] API fetch failed: ${err}, will use cache`);
    return null;
  }
}

function loadFromCache(): SeedScroll[] | null {
  const seedPath = getSeedPath();
  if (!existsSync(seedPath)) {
    return null;
  }
  try {
    const raw = readFileSync(seedPath, "utf-8");
    return JSON.parse(raw) as SeedScroll[];
  } catch {
    console.log("[seed-scrolls] failed to parse cached scrolls.json");
    return null;
  }
}

function saveToCache(scrolls: SeedScroll[]): void {
  try {
    const seedPath = getSeedPath();
    writeFileSync(seedPath, JSON.stringify(scrolls, null, 2) + "\n");
    console.log(`[seed-scrolls] cached ${scrolls.length} scrolls to seed/scrolls.json`);
  } catch (err) {
    console.log(`[seed-scrolls] failed to cache: ${err}`);
  }
}

/**
 * Seed scrolls from mouse.rip API or cached JSON.
 * Uses INSERT OR IGNORE (on UNIQUE(type)) so existing rows are untouched.
 */
export async function seedScrolls(): Promise<void> {
  const db = getDb();

  const count = db.prepare("SELECT COUNT(*) as cnt FROM scrolls").get() as { cnt: number };
  const isEmpty = count.cnt === 0;

  let scrolls: SeedScroll[] | null = null;

  if (isEmpty) {
    scrolls = await fetchFromApi();
    if (scrolls) {
      saveToCache(scrolls);
    }
  }

  if (!scrolls) {
    scrolls = loadFromCache();
    if (!scrolls) {
      if (isEmpty) {
        console.log("[seed-scrolls] no scroll data available (API failed, no cache)");
      }
      return;
    }
    if (isEmpty) {
      console.log(`[seed-scrolls] loaded ${scrolls.length} scrolls from cache`);
    }
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO scrolls (id, type, name, thumbnail)
     VALUES (@id, @type, @name, @thumbnail)`
  );

  const seedAll = db.transaction((rows: SeedScroll[]) => {
    let inserted = 0;
    for (const row of rows) {
      const result = insert.run(row);
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = seedAll(scrolls);
  if (inserted > 0) {
    console.log(`[seed-scrolls] seeded ${inserted} new scroll types`);
  }
}

/**
 * Incremental sync: fetch from API and INSERT OR IGNORE new scrolls only.
 * Returns the number of new scrolls added.
 */
export async function incrementalSyncScrolls(): Promise<number> {
  const scrolls = await fetchFromApi();
  if (!scrolls) return 0;

  // Update cache
  saveToCache(scrolls);

  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO scrolls (id, type, name, thumbnail)
     VALUES (@id, @type, @name, @thumbnail)`
  );

  const syncAll = db.transaction((rows: SeedScroll[]) => {
    let inserted = 0;
    for (const row of rows) {
      const result = insert.run(row);
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = syncAll(scrolls);
  if (inserted > 0) {
    console.log(`[seed-scrolls] incremental sync: added ${inserted} new scroll types`);
  }
  return inserted;
}
