import type Database from "better-sqlite3";
import { migrateCore } from "./core.js";
import { migrateSlots } from "./slots.js";
import { migrateSniping } from "./sniping.js";
import { migrateMaps } from "./maps.js";
import { migrateRisk } from "./risk.js";
import { migrateItems, migrateItemVerificationStates, migrateItemTransferTimestamps } from "./items.js";

export function runMigrations(db: Database.Database): void {
  migrateCore(db);
  migrateSlots(db);
  migrateSniping(db);
  migrateMaps(db);
  migrateRisk(db);
  migrateItems(db);
  migrateItemVerificationStates(db);
  migrateItemTransferTimestamps(db);
}
