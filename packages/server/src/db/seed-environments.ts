import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection.js";

interface MouseRipEnvironment {
  id: string;
  name: string;
}

interface SeedEnvironment {
  type: string;
  name: string;
}

const MOUSE_RIP_API = "https://api.mouse.rip/environments";

function getSeedPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "../../seed/environments.json");
}

async function fetchFromApi(): Promise<SeedEnvironment[] | null> {
  try {
    console.log(`[seed-environments] fetching from ${MOUSE_RIP_API}...`);
    const res = await fetch(MOUSE_RIP_API);
    if (!res.ok) {
      console.log(`[seed-environments] API returned ${res.status}, will use cache`);
      return null;
    }
    const envs: MouseRipEnvironment[] = await res.json();

    const result: SeedEnvironment[] = envs.map((e) => ({
      type: e.id,
      name: e.name,
    }));

    result.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`[seed-environments] fetched ${result.length} environments from API`);
    return result;
  } catch (err) {
    console.log(`[seed-environments] API fetch failed: ${err}, will use cache`);
    return null;
  }
}

function loadFromCache(): SeedEnvironment[] | null {
  const seedPath = getSeedPath();
  if (!existsSync(seedPath)) {
    return null;
  }
  try {
    const raw = readFileSync(seedPath, "utf-8");
    return JSON.parse(raw) as SeedEnvironment[];
  } catch {
    console.log("[seed-environments] failed to parse cached environments.json");
    return null;
  }
}

function saveToCache(envs: SeedEnvironment[]): void {
  try {
    const seedPath = getSeedPath();
    writeFileSync(seedPath, JSON.stringify(envs, null, 2) + "\n");
    console.log(`[seed-environments] cached ${envs.length} environments to seed/environments.json`);
  } catch (err) {
    console.log(`[seed-environments] failed to cache: ${err}`);
  }
}

/** Uses INSERT OR IGNORE (on UNIQUE(type)) so existing rows are untouched. */
export async function seedEnvironments(): Promise<void> {
  const db = getDb();

  const count = db.prepare("SELECT COUNT(*) as cnt FROM environments").get() as { cnt: number };
  const isEmpty = count.cnt === 0;

  let envs: SeedEnvironment[] | null = null;

  if (isEmpty) {
    envs = await fetchFromApi();
    if (envs) {
      saveToCache(envs);
    }
  }

  if (!envs) {
    envs = loadFromCache();
    if (!envs) {
      if (isEmpty) {
        console.log("[seed-environments] no environment data available (API failed, no cache)");
      }
      return;
    }
    if (isEmpty) {
      console.log(`[seed-environments] loaded ${envs.length} environments from cache`);
    }
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO environments (type, name) VALUES (@type, @name)`
  );

  const seedAll = db.transaction((rows: SeedEnvironment[]) => {
    let inserted = 0;
    for (const row of rows) {
      const result = insert.run(row);
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = seedAll(envs);
  if (inserted > 0) {
    console.log(`[seed-environments] seeded ${inserted} new environments`);
  }
}

/** Returns the number of new environments added. */
export async function incrementalSyncEnvironments(): Promise<number> {
  const envs = await fetchFromApi();
  if (!envs) return 0;

  saveToCache(envs);

  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO environments (type, name) VALUES (@type, @name)`
  );

  const syncAll = db.transaction((rows: SeedEnvironment[]) => {
    let inserted = 0;
    for (const row of rows) {
      const result = insert.run(row);
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = syncAll(envs);
  if (inserted > 0) {
    console.log(`[seed-environments] incremental sync: added ${inserted} new environments`);
  }
  return inserted;
}
