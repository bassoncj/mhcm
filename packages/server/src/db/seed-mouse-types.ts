import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection.js";

interface MouseRipEntry {
  id: number;
  type: string;
  name: string;
  abbreviated_name: string;
  images?: {
    square?: string;
    thumbnail?: string;
    silhouette_thumbnail?: string;
  };
}

interface SeedMouse {
  id: number;
  type: string;
  name: string;
  abbreviatedName: string;
  thumbnail: string | null;
}

const MOUSE_RIP_API = "https://api.mouse.rip/mice";

function getSeedPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "../../seed/mice.json");
}

function parseMouseRipData(mice: MouseRipEntry[]): SeedMouse[] {
  return mice.map((m) => ({
    id: m.id,
    type: m.type,
    name: m.name,
    abbreviatedName: m.abbreviated_name,
    thumbnail: m.images?.square || m.images?.thumbnail || null,
  }));
}

async function fetchFromApi(): Promise<SeedMouse[] | null> {
  try {
    console.log(`[seed-mice] fetching from ${MOUSE_RIP_API}...`);
    const res = await fetch(MOUSE_RIP_API);
    if (!res.ok) {
      console.log(`[seed-mice] API returned ${res.status}, will use cache`);
      return null;
    }
    const data: MouseRipEntry[] = await res.json();
    return parseMouseRipData(data);
  } catch (err) {
    console.log(`[seed-mice] API fetch failed: ${err}, will use cache`);
    return null;
  }
}

function loadFromCache(): SeedMouse[] | null {
  const seedPath = getSeedPath();
  if (!existsSync(seedPath)) {
    return null;
  }
  try {
    const raw = readFileSync(seedPath, "utf-8");
    return JSON.parse(raw) as SeedMouse[];
  } catch {
    console.log("[seed-mice] failed to parse cached mice.json");
    return null;
  }
}

function saveToCache(mice: SeedMouse[]): void {
  try {
    const seedPath = getSeedPath();
    writeFileSync(seedPath, JSON.stringify(mice, null, 2));
    console.log(`[seed-mice] cached ${mice.length} mice to seed/mice.json`);
  } catch (err) {
    console.log(`[seed-mice] failed to cache: ${err}`);
  }
}

/**
 * Seed mouse_types from mouse.rip API or cached JSON.
 * Uses INSERT OR IGNORE so existing rows are untouched.
 * Also backfills missing thumbnails on existing rows.
 */
export async function seedMouseTypes(): Promise<void> {
  const db = getDb();

  const count = db.prepare("SELECT COUNT(*) as cnt FROM mouse_types").get() as { cnt: number };
  const isEmpty = count.cnt === 0;

  // Check if we need to backfill thumbnails (old cache had null thumbnails)
  const nullThumbs = isEmpty
    ? 0
    : (db.prepare("SELECT COUNT(*) as cnt FROM mouse_types WHERE thumbnail IS NULL").get() as { cnt: number }).cnt;

  if (!isEmpty && nullThumbs === 0) {
    // Table has data and all thumbnails populated – nothing to do
    return;
  }

  // Try API first, fall back to cache
  let mice = await fetchFromApi();

  if (mice) {
    saveToCache(mice);
  } else {
    mice = loadFromCache();
    if (!mice) {
      console.log("[seed-mice] no mice data available (API failed, no cache)");
      return;
    }
    console.log(`[seed-mice] loaded ${mice.length} mice from cache`);
  }

  if (isEmpty) {
    // Fresh insert
    const insert = db.prepare(
      `INSERT OR IGNORE INTO mouse_types (id, type, name, abbreviated_name, thumbnail)
       VALUES (@id, @type, @name, @abbreviatedName, @thumbnail)`
    );

    const seedAll = db.transaction((items: SeedMouse[]) => {
      let inserted = 0;
      for (const m of items) {
        const result = insert.run(m);
        if (result.changes > 0) inserted++;
      }
      return inserted;
    });

    const inserted = seedAll(mice);
    if (inserted > 0) {
      console.log(`[seed-mice] seeded ${inserted} mouse types`);
    }
  } else if (nullThumbs > 0) {
    // Backfill thumbnails on existing rows
    const update = db.prepare(
      "UPDATE mouse_types SET thumbnail = @thumbnail WHERE id = @id AND thumbnail IS NULL"
    );

    const backfill = db.transaction((items: SeedMouse[]) => {
      let updated = 0;
      for (const m of items) {
        if (!m.thumbnail) continue;
        const result = update.run({ id: m.id, thumbnail: m.thumbnail });
        if (result.changes > 0) updated++;
      }
      return updated;
    });

    const updated = backfill(mice);
    if (updated > 0) {
      console.log(`[seed-mice] backfilled thumbnails for ${updated} mice`);
    }
  }
}
