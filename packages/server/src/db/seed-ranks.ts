import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection.js";

interface MHTitle {
  name: string;
  icon?: string;
  large_image?: string;
  num_title_locations?: number;
  num_total_locations?: number;
}

interface SeedRank {
  name: string;
  icon: string | null;
  large_image: string | null;
  num_title_locations: number;
  num_total_locations: number;
}

const MH_API = "https://www.mousehuntgame.com/managers/ajax/pages/page.php";

function getSeedPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "../../seed/ranks.json");
}

async function fetchFromApi(): Promise<SeedRank[] | null> {
  try {
    console.log(`[seed-ranks] fetching from ${MH_API}...`);

    // Note: This requires a valid uh token, which we don't have server-side
    // In practice, this will be called via admin sync with a real user session
    // For startup seeding, we'll rely on the cached JSON

    const res = await fetch(MH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({
        sn: "Hitgrab",
        hg_is_ajax: "1",
        page_class: "Title",
        last_read_journal_entry_id: "0",
        uh: "", // Empty uh - will fail but allows fallback to cache
      }),
    });

    if (!res.ok) {
      console.log(`[seed-ranks] API returned ${res.status}, will use cache`);
      return null;
    }

    const data = await res.json();
    const titles = data?.page?.titles as MHTitle[] | undefined;

    if (!titles || !Array.isArray(titles)) {
      console.log("[seed-ranks] API response missing titles array, will use cache");
      return null;
    }

    const ranks: SeedRank[] = titles.map((title) => ({
      name: title.name,
      icon: title.icon || null,
      large_image: title.large_image || null,
      num_title_locations: title.num_title_locations || 0,
      num_total_locations: title.num_total_locations || 0,
    }));

    console.log(`[seed-ranks] fetched ${ranks.length} ranks from API`);
    return ranks;
  } catch (err) {
    console.log(`[seed-ranks] API fetch failed: ${err}, will use cache`);
    return null;
  }
}

function loadFromCache(): SeedRank[] | null {
  const seedPath = getSeedPath();
  if (!existsSync(seedPath)) {
    return null;
  }
  try {
    const raw = readFileSync(seedPath, "utf-8");
    return JSON.parse(raw) as SeedRank[];
  } catch {
    console.log("[seed-ranks] failed to parse cached ranks.json");
    return null;
  }
}

function saveToCache(ranks: SeedRank[]): void {
  try {
    const seedPath = getSeedPath();
    writeFileSync(seedPath, JSON.stringify(ranks, null, 2) + "\n");
    console.log(`[seed-ranks] cached ${ranks.length} ranks to seed/ranks.json`);
  } catch (err) {
    console.log(`[seed-ranks] failed to cache: ${err}`);
  }
}

/**
 * Seed ranks from MH API or cached JSON.
 * Uses INSERT OR IGNORE (on UNIQUE(name)) so existing rows are untouched.
 */
export async function seedRanks(): Promise<void> {
  const db = getDb();

  const count = db.prepare("SELECT COUNT(*) as cnt FROM ranks").get() as { cnt: number };
  const isEmpty = count.cnt === 0;

  let ranks: SeedRank[] | null = null;

  if (isEmpty) {
    ranks = await fetchFromApi();
    if (ranks) {
      saveToCache(ranks);
    }
  }

  if (!ranks) {
    ranks = loadFromCache();
    if (!ranks) {
      if (isEmpty) {
        console.log("[seed-ranks] no rank data available (API failed, no cache), using hardcoded defaults");
        // Fallback to hardcoded 20 ranks if no cache exists
        ranks = [
          { name: "Novice", icon: null, large_image: null, num_title_locations: 1, num_total_locations: 69 },
          { name: "Recruit", icon: null, large_image: null, num_title_locations: 2, num_total_locations: 69 },
          { name: "Apprentice", icon: null, large_image: null, num_title_locations: 5, num_total_locations: 69 },
          { name: "Initiate", icon: null, large_image: null, num_title_locations: 6, num_total_locations: 69 },
          { name: "Journeyman/Journeywoman", icon: null, large_image: null, num_title_locations: 8, num_total_locations: 69 },
          { name: "Master", icon: null, large_image: null, num_title_locations: 12, num_total_locations: 69 },
          { name: "Grandmaster", icon: null, large_image: null, num_title_locations: 18, num_total_locations: 69 },
          { name: "Legendary", icon: null, large_image: null, num_title_locations: 26, num_total_locations: 69 },
          { name: "Hero", icon: null, large_image: null, num_title_locations: 28, num_total_locations: 69 },
          { name: "Knight", icon: null, large_image: null, num_title_locations: 30, num_total_locations: 69 },
          { name: "Lord/Lady", icon: null, large_image: null, num_title_locations: 37, num_total_locations: 69 },
          { name: "Baron/Baroness", icon: null, large_image: null, num_title_locations: 43, num_total_locations: 69 },
          { name: "Count/Countess", icon: null, large_image: null, num_title_locations: 50, num_total_locations: 69 },
          { name: "Duke/Duchess", icon: null, large_image: null, num_title_locations: 55, num_total_locations: 69 },
          { name: "Grand Duke/Grand Duchess", icon: null, large_image: null, num_title_locations: 58, num_total_locations: 69 },
          { name: "Archduke/Archduchess", icon: null, large_image: null, num_title_locations: 63, num_total_locations: 69 },
          { name: "Viceroy", icon: null, large_image: null, num_title_locations: 69, num_total_locations: 69 },
          { name: "Elder", icon: null, large_image: null, num_title_locations: 69, num_total_locations: 69 },
          { name: "Sage", icon: null, large_image: null, num_title_locations: 69, num_total_locations: 69 },
          { name: "Fabled", icon: null, large_image: null, num_title_locations: 69, num_total_locations: 69 },
        ];
      } else {
        return;
      }
    }
    if (isEmpty) {
      console.log(`[seed-ranks] loaded ${ranks.length} ranks from ${ranks === loadFromCache() ? "cache" : "defaults"}`);
    }
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO ranks (name, icon, large_image, num_title_locations, num_total_locations)
     VALUES (@name, @icon, @large_image, @num_title_locations, @num_total_locations)`
  );

  const seedAll = db.transaction((rows: SeedRank[]) => {
    let inserted = 0;
    for (const row of rows) {
      const result = insert.run(row);
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = seedAll(ranks);
  if (inserted > 0) {
    console.log(`[seed-ranks] seeded ${inserted} new ranks`);
  }
}

/**
 * Incremental sync: fetch from API with provided credentials and INSERT OR IGNORE new ranks only.
 * Returns the number of new ranks added.
 * This will be called from the admin handler with a real user session (uh token).
 */
export async function incrementalSyncRanks(uh: string): Promise<number> {
  try {
    console.log(`[seed-ranks] incremental sync: fetching from ${MH_API}...`);

    const res = await fetch(MH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({
        sn: "Hitgrab",
        hg_is_ajax: "1",
        page_class: "Title",
        last_read_journal_entry_id: "0",
        uh,
      }),
    });

    if (!res.ok) {
      console.log(`[seed-ranks] API returned ${res.status}`);
      return 0;
    }

    const data = await res.json();
    const titles = data?.page?.titles as MHTitle[] | undefined;

    if (!titles || !Array.isArray(titles)) {
      console.log("[seed-ranks] API response missing titles array");
      return 0;
    }

    const ranks: SeedRank[] = titles.map((title) => ({
      name: title.name,
      icon: title.icon || null,
      large_image: title.large_image || null,
      num_title_locations: title.num_title_locations || 0,
      num_total_locations: title.num_total_locations || 0,
    }));

    // Update cache
    saveToCache(ranks);

    const db = getDb();
    const insert = db.prepare(
      `INSERT OR IGNORE INTO ranks (name, icon, large_image, num_title_locations, num_total_locations)
       VALUES (@name, @icon, @large_image, @num_title_locations, @num_total_locations)`
    );

    const syncAll = db.transaction((rows: SeedRank[]) => {
      let inserted = 0;
      for (const row of rows) {
        const result = insert.run(row);
        if (result.changes > 0) inserted++;
      }
      return inserted;
    });

    const inserted = syncAll(ranks);
    if (inserted > 0) {
      console.log(`[seed-ranks] incremental sync: added ${inserted} new ranks`);
    }
    return inserted;
  } catch (err) {
    console.log(`[seed-ranks] incremental sync failed: ${err}`);
    return 0;
  }
}
