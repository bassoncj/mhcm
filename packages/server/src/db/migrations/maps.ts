import type Database from "better-sqlite3";

export function migrateMaps(db: Database.Database): void {
  const mapTypeColsForL2m = db.prepare("PRAGMA table_info(map_types)").all() as Array<{ name: string }>;
  const mapTypeColNamesForL2m = new Set(mapTypeColsForL2m.map((c) => c.name));

  if (!mapTypeColNamesForL2m.has("allow_l2m")) {
    db.exec("ALTER TABLE map_types ADD COLUMN allow_l2m INTEGER NOT NULL DEFAULT 0");
    console.log("[db] migration: added allow_l2m column to map_types");
  }

  if (!mapTypeColNamesForL2m.has("last_mouse_count")) {
    db.exec("ALTER TABLE map_types ADD COLUMN last_mouse_count INTEGER NOT NULL DEFAULT 1");
    // Migrate existing L2M flags: allow_l2m=1 → last_mouse_count=2
    db.exec("UPDATE map_types SET last_mouse_count = 2 WHERE allow_l2m = 1");
    console.log("[db] migration: added last_mouse_count (migrated from allow_l2m)");
  }

  if (!mapTypeColNamesForL2m.has("scroll_item_type")) {
    db.exec("ALTER TABLE map_types ADD COLUMN scroll_item_type TEXT");
    console.log("[db] migration: added scroll_item_type column to map_types");
  }

  if (!mapTypeColNamesForL2m.has("min_rank")) {
    db.exec("ALTER TABLE map_types ADD COLUMN min_rank TEXT");
    console.log("[db] migration: added min_rank column to map_types");
  }

  if (!mapTypeColNamesForL2m.has("map_class")) {
    db.exec("ALTER TABLE map_types ADD COLUMN map_class TEXT CHECK (map_class IN ('treasure', 'event', 'poster'))");
    console.log("[db] migration: added map_class column to map_types");
  }

  // Migrate min_rank from name string to rank ID
  const minRankRows = db.prepare(
    "SELECT id, min_rank FROM map_types WHERE min_rank IS NOT NULL"
  ).all() as { id: number; min_rank: string }[];
  if (minRankRows.length > 0 && isNaN(Number(minRankRows[0].min_rank))) {
    for (const row of minRankRows) {
      const rank = db.prepare("SELECT id FROM ranks WHERE name = ?").get(row.min_rank) as { id: number } | undefined;
      if (rank) {
        db.prepare("UPDATE map_types SET min_rank = ? WHERE id = ?").run(String(rank.id), row.id);
      } else {
        db.prepare("UPDATE map_types SET min_rank = NULL WHERE id = ?").run(row.id);
      }
    }
    console.log("[db] migration: converted min_rank from name to ID");
  }

  const mtColsForGoal = db.prepare("PRAGMA table_info(map_types)").all() as Array<{ name: string }>;
  const mtColNamesForGoal = new Set(mtColsForGoal.map((c) => c.name));

  if (!mtColNamesForGoal.has("goal")) {
    console.log("[db] migration: adding goal column to map_types + renaming last_mouse_count → last_goal_count");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS map_types_new");
    db.exec(`
      CREATE TABLE map_types_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        map_type TEXT NOT NULL,
        quality TEXT NOT NULL CHECK (quality IN ('common', 'rare')),
        goal TEXT NOT NULL DEFAULT 'mouse' CHECK (goal IN ('mouse', 'item')),
        display_name TEXT NOT NULL,
        thumbnail TEXT,
        alias TEXT,
        max_hunters INTEGER NOT NULL DEFAULT 5,
        allow_l2m INTEGER NOT NULL DEFAULT 0,
        last_goal_count INTEGER NOT NULL DEFAULT 1,
        enabled INTEGER NOT NULL DEFAULT 1,
        map_class TEXT CHECK (map_class IN ('treasure', 'event', 'poster')),
        scroll_item_type TEXT,
        min_rank TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(map_type, quality, goal)
      )
    `);
    // Copy data – map last_mouse_count → last_goal_count, all existing rows get goal='mouse'
    const hasLastMouseCount = mtColNamesForGoal.has("last_mouse_count");
    const hasMapClass = mtColNamesForGoal.has("map_class");
    const hasScrollItemType = mtColNamesForGoal.has("scroll_item_type");
    const hasMinRank = mtColNamesForGoal.has("min_rank");
    db.exec(`
      INSERT INTO map_types_new (id, map_type, quality, goal, display_name, thumbnail, alias,
        max_hunters, allow_l2m, last_goal_count, enabled, map_class, scroll_item_type, min_rank, created_at)
      SELECT id, map_type, quality, 'mouse', display_name, thumbnail, alias,
        max_hunters, allow_l2m,
        ${hasLastMouseCount ? "last_mouse_count" : "1"},
        enabled,
        ${hasMapClass ? "map_class" : "NULL"},
        ${hasScrollItemType ? "scroll_item_type" : "NULL"},
        ${hasMinRank ? "min_rank" : "NULL"},
        created_at
      FROM map_types
    `);
    db.exec("DROP TABLE map_types");
    db.exec("ALTER TABLE map_types_new RENAME TO map_types");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: map_types recreated with goal column and last_goal_count");
  }

  const mapTxnSchemaRC = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='map_transactions'"
  ).get() as { sql: string } | undefined;

  if (mapTxnSchemaRC && !mapTxnSchemaRC.sql.includes("risk_checking")) {
    console.log("[db] migration: adding risk_checking state to map_transactions");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS map_transactions_new");
    db.exec(`
      CREATE TABLE map_transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sell_order_id INTEGER NOT NULL REFERENCES map_orders(id),
        buy_order_id INTEGER NOT NULL REFERENCES map_orders(id),
        seller_user_id INTEGER NOT NULL REFERENCES users(id),
        buyer_user_id INTEGER NOT NULL REFERENCES users(id),
        map_type_id INTEGER NOT NULL REFERENCES map_types(id),
        mode TEXT NOT NULL CHECK (mode IN ('unopened', 'completed')),
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
          'pending', 'risk_checking', 'validating_seller', 'validating_buyer', 'transferring_sb',
          'opening_scroll', 'inviting', 'accepting', 'transferring_ownership',
          'seller_leaving', 'reversing_sb', 'cancelling_invite', 'pending_completion',
          'completed', 'failed'
        )),
        mh_map_id INTEGER,
        scroll_item_type TEXT,
        seller_mh_sn_user_id TEXT NOT NULL,
        buyer_mh_sn_user_id TEXT NOT NULL,
        failure_reason TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      INSERT INTO map_transactions_new
      SELECT id, sell_order_id, buy_order_id, seller_user_id, buyer_user_id,
        map_type_id, mode, price, quantity, state, mh_map_id, scroll_item_type,
        seller_mh_sn_user_id, buyer_mh_sn_user_id, failure_reason, retry_count,
        COALESCE(created_at, datetime('now')),
        COALESCE(updated_at, created_at, datetime('now'))
      FROM map_transactions
    `);
    db.exec("DROP TABLE map_transactions");
    db.exec("ALTER TABLE map_transactions_new RENAME TO map_transactions");
    db.exec("CREATE INDEX idx_map_transactions_state ON map_transactions(state)");
    db.exec("CREATE INDEX idx_map_transactions_users ON map_transactions(seller_user_id, buyer_user_id)");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: map_transactions recreated with risk_checking state");
  }

  const mapOrdersColsRG = db.prepare("PRAGMA table_info(map_orders)").all() as { name: string }[];
  if (!mapOrdersColsRG.some((c) => c.name === "remaining_goals")) {
    db.exec("ALTER TABLE map_orders ADD COLUMN remaining_goals TEXT");
    console.log("[db] migration: added remaining_goals to map_orders");
  }

  const mtColsMarket = db.prepare("PRAGMA table_info(map_types)").all() as { name: string }[];
  if (!mtColsMarket.some((c) => c.name === "enabled_slots")) {
    db.exec("ALTER TABLE map_types ADD COLUMN enabled_slots INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE map_types ADD COLUMN enabled_unopened INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE map_types ADD COLUMN enabled_complete INTEGER NOT NULL DEFAULT 0");
    // Migrate: copy existing enabled flag into all 3 new columns
    db.exec("UPDATE map_types SET enabled_slots = enabled, enabled_unopened = enabled, enabled_complete = enabled");
    // Disable unopened for maps without min_rank (prerequisite for unopened market)
    db.exec("UPDATE map_types SET enabled_unopened = 0 WHERE enabled_unopened = 1 AND min_rank IS NULL");
    console.log("[db] migration: added per-market enabled columns to map_types");
  }

  const mtColsRt = db.prepare("PRAGMA table_info(map_types)").all() as { name: string }[];
  if (!mtColsRt.some((c) => c.name === "supports_rt")) {
    db.exec("ALTER TABLE map_types ADD COLUMN supports_rt INTEGER NOT NULL DEFAULT 0");
    console.log("[db] migration: added supports_rt to map_types");
  }

  // is_demo columns for map tables
  const mapDemoTables = [
    "map_orders", "map_transactions", "map_price_history",
  ];
  for (const table of mapDemoTables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.length > 0 && !cols.some((c) => c.name === "is_demo")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0`);
      console.log(`[db] migration: added is_demo column to ${table}`);
    }
  }
}
