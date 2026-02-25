import type Database from "better-sqlite3";

export function migrateRisk(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS slot_risk_decisions (
      buy_order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      sell_order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      decision TEXT NOT NULL CHECK (decision IN ('accepted', 'blocked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (buy_order_id, sell_order_id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS map_risk_decisions (
      buy_order_id INTEGER NOT NULL REFERENCES map_orders(id) ON DELETE CASCADE,
      sell_order_id INTEGER NOT NULL REFERENCES map_orders(id) ON DELETE CASCADE,
      decision TEXT NOT NULL CHECK (decision IN ('accepted', 'blocked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (buy_order_id, sell_order_id)
    )
  `);

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  if (!tables.some((t) => t.name === "environments")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS environments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log("[db] migration: created environments table");
  }

  const itemTypeCols2 = db.prepare("PRAGMA table_info(item_types)").all() as { name: string }[];
  if (!itemTypeCols2.some((c) => c.name === "always_warn")) {
    db.exec("ALTER TABLE item_types ADD COLUMN always_warn INTEGER NOT NULL DEFAULT 0");
    console.log("[db] migration: added always_warn to item_types");
  }

  if (!tables.some((t) => t.name === "item_risk_locations")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS item_risk_locations (
        item_type_id INTEGER NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
        environment_type TEXT NOT NULL,
        PRIMARY KEY (item_type_id, environment_type)
      )
    `);
    console.log("[db] migration: created item_risk_locations table");
  }
}
