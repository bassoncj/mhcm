import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { config } from "../config.js";
import { SCHEMA } from "./schema.js";
import { runMigrations } from "./migrations/index.js";
import { seedMapTypes } from "./seed-map-types.js";
import { seedMouseTypes } from "./seed-mouse-types.js";
import { seedMouseAliases } from "./seed-mouse-aliases.js";
import { seedSnipingPrices } from "./seed-sniping-prices.js";
import { seedItemTypes } from "./seed-item-types.js";
import { seedScrolls } from "./seed-scrolls.js";
import { seedRanks } from "./seed-ranks.js";
import { seedEnvironments } from "./seed-environments.js";
import { purgeDemoMarketData, seedDemoData } from "../demo/seed-demo-data.js";
import { ONBOARDING_STEPS } from "@mhcm/shared";
import { onboardingVersionExists, insertOnboardingTasksForNewVersion } from "./queries/onboarding.js";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export async function initDb(): Promise<Database.Database> {
  const dbDir = dirname(resolve(config.dbPath));
  mkdirSync(dbDir, { recursive: true });

  db = new Database(config.dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");   // Safe with WAL; reduces fsync overhead
  db.pragma("cache_size = -16000");    // 16 MB page cache (default ~2 MB)
  db.pragma("busy_timeout = 5000");    // Wait up to 5 s on lock contention
  db.pragma("foreign_keys = ON");

  db.exec(SCHEMA);
  runMigrations(db);

  await seedMapTypes();
  await seedMouseTypes();
  seedMouseAliases();
  seedSnipingPrices();
  await seedItemTypes();
  await seedScrolls();
  await seedRanks();
  await seedEnvironments();

  purgeDemoMarketData();
  seedDemoData();
  syncOnboardingTasks();

  console.log(`[db] initialized at ${config.dbPath}`);
  return db;
}

function syncOnboardingTasks(): void {
  for (const step of ONBOARDING_STEPS) {
    if (!onboardingVersionExists(step.id, step.version)) {
      console.log(`[onboarding] syncing step "${step.id}" version ${step.version}`);
      insertOnboardingTasksForNewVersion(step.id, step.version);
    }
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    console.log("[db] closed");
  }
}
