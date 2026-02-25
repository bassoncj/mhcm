import type Database from "better-sqlite3";

export function migrateSniping(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS sniping_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id),
    side TEXT NOT NULL CHECK (side IN ('sniper_sell', 'sniper_buy')),
    price INTEGER NOT NULL CHECK (price > 0),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
      'open', 'matched', 'in_progress', 'completed', 'cancelled', 'paused'
    )),
    mh_map_id INTEGER,
    paused_at TEXT,
    paused_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    priority_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sniping_orders_matching
    ON sniping_orders(mouse_type_id, side, status, price, priority_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sniping_orders_user
    ON sniping_orders(user_id, status)`);

  db.exec(`CREATE TABLE IF NOT EXISTS sniping_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sniper_user_id INTEGER NOT NULL REFERENCES users(id),
    maptain_user_id INTEGER NOT NULL REFERENCES users(id),
    mh_map_id INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
      'pending', 'inviting', 'invite_sent', 'sniping',
      'awaiting_payment', 'transferring', 'awaiting_leave',
      'completed', 'failed'
    )),
    sniper_mh_sn_user_id TEXT NOT NULL,
    maptain_mh_sn_user_id TEXT NOT NULL,
    failure_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sniping_transactions_state
    ON sniping_transactions(state)`);

  db.exec(`CREATE TABLE IF NOT EXISTS sniping_transaction_mice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES sniping_transactions(id) ON DELETE CASCADE,
    buy_order_id INTEGER NOT NULL REFERENCES sniping_orders(id),
    sell_order_id INTEGER NOT NULL REFERENCES sniping_orders(id),
    mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id),
    price INTEGER NOT NULL,
    caught INTEGER NOT NULL DEFAULT 0,
    caught_at TEXT,
    paid INTEGER NOT NULL DEFAULT 0,
    paid_at TEXT,
    UNIQUE(transaction_id, mouse_type_id)
  )`);

  const stmCols = db.prepare("PRAGMA table_info(sniping_transaction_mice)").all() as Array<{ name: string }>;
  const stmColNames = new Set(stmCols.map((c) => c.name));
  if (!stmColNames.has("paid")) {
    db.exec("ALTER TABLE sniping_transaction_mice ADD COLUMN paid INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE sniping_transaction_mice ADD COLUMN paid_at TEXT");
    // Backfill: all previously caught mice were paid in the old bulk-payment flow
    db.exec("UPDATE sniping_transaction_mice SET paid = caught, paid_at = caught_at WHERE caught = 1");
    console.log("[db] migration: added paid/paid_at columns to sniping_transaction_mice");
  }

  db.exec(`CREATE TABLE IF NOT EXISTS sniping_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id),
    price INTEGER NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sniping_price_history
    ON sniping_price_history(mouse_type_id, completed_at)`);

  db.exec(`CREATE TABLE IF NOT EXISTS sniping_mouse_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    enabled INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS sniping_mouse_group_members (
    group_id INTEGER NOT NULL REFERENCES sniping_mouse_groups(id) ON DELETE CASCADE,
    mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id),
    PRIMARY KEY (group_id, mouse_type_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS sniping_group_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES sniping_mouse_groups(id),
    price INTEGER NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sniping_group_price_history
    ON sniping_group_price_history(group_id, completed_at)`);

  const soSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='sniping_orders'"
  ).get() as { sql: string } | undefined;

  if (soSchema && !soSchema.sql.includes("mouse_group_id")) {
    console.log("[db] migration: adding mouse_group_id to sniping_orders (recreating table)");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS sniping_orders_new");
    db.exec(`
      CREATE TABLE sniping_orders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mouse_type_id INTEGER REFERENCES mouse_types(id),
        mouse_group_id INTEGER REFERENCES sniping_mouse_groups(id),
        side TEXT NOT NULL CHECK (side IN ('sniper_sell', 'sniper_buy')),
        price INTEGER NOT NULL CHECK (price > 0),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
          'open', 'matched', 'in_progress', 'completed', 'cancelled', 'paused'
        )),
        mh_map_id INTEGER,
        paused_at TEXT,
        paused_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        priority_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Copy existing data (mouse_group_id will be NULL for all existing rows)
    db.exec(`INSERT INTO sniping_orders_new
      (id, user_id, mouse_type_id, side, price, status, mh_map_id,
       paused_at, paused_reason, created_at, updated_at, priority_at)
      SELECT id, user_id, mouse_type_id, side, price, status, mh_map_id,
       paused_at, paused_reason, created_at, updated_at, priority_at
      FROM sniping_orders`);
    db.exec("DROP TABLE sniping_orders");
    db.exec("ALTER TABLE sniping_orders_new RENAME TO sniping_orders");
    db.exec(`CREATE INDEX idx_sniping_orders_matching
      ON sniping_orders(mouse_type_id, mouse_group_id, side, status, price, priority_at)`);
    db.exec(`CREATE INDEX idx_sniping_orders_user
      ON sniping_orders(user_id, status)`);
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: sniping_orders recreated with mouse_group_id");
  }

  const soColsForMapClass = db.prepare("PRAGMA table_info(sniping_orders)").all() as Array<{ name: string }>;
  const soColNamesForMapClass = new Set(soColsForMapClass.map((c) => c.name));
  if (!soColNamesForMapClass.has("map_class")) {
    db.exec("ALTER TABLE sniping_orders ADD COLUMN map_class TEXT CHECK (map_class IN ('treasure', 'event', 'poster'))");
    console.log("[db] migration: added map_class column to sniping_orders");
  }

  const stCols = db.prepare("PRAGMA table_info(sniping_transactions)").all() as Array<{ name: string }>;
  const stColNames = new Set(stCols.map((c) => c.name));
  if (!stColNames.has("mouse_group_id")) {
    db.exec("ALTER TABLE sniping_transactions ADD COLUMN mouse_group_id INTEGER REFERENCES sniping_mouse_groups(id)");
    console.log("[db] migration: added mouse_group_id to sniping_transactions");
  }

  // item_types tier/tradable/hidden columns
  const itColsForTier = db.prepare("PRAGMA table_info(item_types)").all() as Array<{ name: string }>;
  const itColNamesForTier = new Set(itColsForTier.map((c) => c.name));

  if (!itColNamesForTier.has("global_tier")) {
    db.exec("ALTER TABLE item_types ADD COLUMN global_tier TEXT CHECK (global_tier IN ('S', 'A', 'B'))");
    console.log("[db] migration: added global_tier column to item_types");
  }
  if (!itColNamesForTier.has("is_tradable")) {
    db.exec("ALTER TABLE item_types ADD COLUMN is_tradable INTEGER NOT NULL DEFAULT 1");
    console.log("[db] migration: added is_tradable column to item_types");
  }
  if (!itColNamesForTier.has("system_hidden")) {
    db.exec("ALTER TABLE item_types ADD COLUMN system_hidden INTEGER NOT NULL DEFAULT 0");
    console.log("[db] migration: added system_hidden column to item_types");
  }

  const soColsForGoal = db.prepare("PRAGMA table_info(sniping_orders)").all() as Array<{ name: string }>;
  const soColNamesForGoal = new Set(soColsForGoal.map((c) => c.name));

  if (!soColNamesForGoal.has("goal_type")) {
    console.log("[db] migration: adding item columns + goal_type to sniping_orders (recreating table)");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS sniping_orders_new");
    db.exec(`
      CREATE TABLE sniping_orders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mouse_type_id INTEGER REFERENCES mouse_types(id),
        mouse_group_id INTEGER REFERENCES sniping_mouse_groups(id),
        item_type_id INTEGER REFERENCES item_types(id),
        item_group_id INTEGER REFERENCES sniping_item_groups(id),
        goal_type TEXT NOT NULL DEFAULT 'mouse' CHECK (goal_type IN ('mouse', 'item')),
        side TEXT NOT NULL CHECK (side IN ('sniper_sell', 'sniper_buy')),
        price INTEGER NOT NULL CHECK (price > 0),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
          'open', 'matched', 'in_progress', 'completed', 'cancelled', 'paused'
        )),
        mh_map_id INTEGER,
        map_class TEXT CHECK (map_class IN ('treasure', 'event', 'poster')),
        paused_at TEXT,
        paused_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        priority_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (
          (mouse_type_id IS NOT NULL AND mouse_group_id IS NULL AND item_type_id IS NULL AND item_group_id IS NULL) OR
          (mouse_type_id IS NULL AND mouse_group_id IS NOT NULL AND item_type_id IS NULL AND item_group_id IS NULL) OR
          (mouse_type_id IS NULL AND mouse_group_id IS NULL AND item_type_id IS NOT NULL AND item_group_id IS NULL) OR
          (mouse_type_id IS NULL AND mouse_group_id IS NULL AND item_type_id IS NULL AND item_group_id IS NOT NULL)
        )
      )
    `);
    // Copy existing data – all existing rows are mouse-based
    const hasMouseGroupId = soColNamesForGoal.has("mouse_group_id");
    const hasMapClassSo = soColNamesForGoal.has("map_class");
    db.exec(`
      INSERT INTO sniping_orders_new
        (id, user_id, mouse_type_id, ${hasMouseGroupId ? "mouse_group_id," : ""} goal_type, side, price, status,
         mh_map_id, ${hasMapClassSo ? "map_class," : ""} paused_at, paused_reason, created_at, updated_at, priority_at)
      SELECT id, user_id, mouse_type_id, ${hasMouseGroupId ? "mouse_group_id," : ""} 'mouse', side, price, status,
         mh_map_id, ${hasMapClassSo ? "map_class," : ""} paused_at, paused_reason, created_at, updated_at, priority_at
      FROM sniping_orders
    `);
    db.exec("DROP TABLE sniping_orders");
    db.exec("ALTER TABLE sniping_orders_new RENAME TO sniping_orders");
    db.exec(`CREATE INDEX idx_sniping_orders_matching
      ON sniping_orders(goal_type, mouse_type_id, mouse_group_id, item_type_id, item_group_id, side, status, price, priority_at)`);
    db.exec(`CREATE INDEX idx_sniping_orders_user
      ON sniping_orders(user_id, status)`);
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: sniping_orders recreated with item columns + goal_type");
  }

  const stColsForGoal = db.prepare("PRAGMA table_info(sniping_transactions)").all() as Array<{ name: string }>;
  const stColNamesForGoal = new Set(stColsForGoal.map((c) => c.name));

  if (!stColNamesForGoal.has("goal_type")) {
    db.exec("ALTER TABLE sniping_transactions ADD COLUMN goal_type TEXT NOT NULL DEFAULT 'mouse'");
    console.log("[db] migration: added goal_type to sniping_transactions");
  }
  if (!stColNamesForGoal.has("item_group_id")) {
    db.exec("ALTER TABLE sniping_transactions ADD COLUMN item_group_id INTEGER");
    console.log("[db] migration: added item_group_id to sniping_transactions");
  }

  const stSchemaForPP = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='sniping_transactions'"
  ).get() as { sql: string } | undefined;

  const soColsForRank = db.prepare("PRAGMA table_info(sniping_orders)").all() as Array<{ name: string }>;
  const soColNamesForRank = new Set(soColsForRank.map((c) => c.name));
  if (!soColNamesForRank.has("min_rank_id")) {
    db.exec("ALTER TABLE sniping_orders ADD COLUMN min_rank_id INTEGER");
    console.log("[db] migration: added min_rank_id column to sniping_orders");
  }

  if (stSchemaForPP && !stSchemaForPP.sql.includes("pending_payment")) {
    console.log("[db] migration: adding pending_payment to sniping_transactions state CHECK constraint");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS sniping_transactions_new");
    // Recreate with updated constraint – preserve all columns
    const stColsForPP = db.prepare("PRAGMA table_info(sniping_transactions)").all() as Array<{ name: string }>;
    const stColNamesForPP = new Set(stColsForPP.map((c) => c.name));
    db.exec(`
      CREATE TABLE sniping_transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sniper_user_id INTEGER NOT NULL REFERENCES users(id),
        maptain_user_id INTEGER NOT NULL REFERENCES users(id),
        ${stColNamesForPP.has("mouse_group_id") ? "mouse_group_id INTEGER REFERENCES sniping_mouse_groups(id)," : ""}
        ${stColNamesForPP.has("item_group_id") ? "item_group_id INTEGER REFERENCES sniping_item_groups(id)," : ""}
        ${stColNamesForPP.has("goal_type") ? "goal_type TEXT NOT NULL DEFAULT 'mouse' CHECK (goal_type IN ('mouse', 'item'))," : ""}
        mh_map_id INTEGER NOT NULL,
        total_price INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
          'pending', 'inviting', 'invite_sent', 'sniping',
          'awaiting_payment', 'pending_payment', 'transferring', 'awaiting_leave',
          'completed', 'failed'
        )),
        sniper_mh_sn_user_id TEXT NOT NULL,
        maptain_mh_sn_user_id TEXT NOT NULL,
        failure_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Coalesce updated_at to created_at (or now) for rows where it was NULL
    db.exec(`
      INSERT INTO sniping_transactions_new
      SELECT id, sniper_user_id, maptain_user_id,
        ${stColNamesForPP.has("mouse_group_id") ? "mouse_group_id," : ""}
        ${stColNamesForPP.has("item_group_id") ? "item_group_id," : ""}
        ${stColNamesForPP.has("goal_type") ? "goal_type," : ""}
        mh_map_id, total_price, state, sniper_mh_sn_user_id, maptain_mh_sn_user_id,
        failure_reason,
        COALESCE(created_at, datetime('now')),
        COALESCE(updated_at, created_at, datetime('now'))
      FROM sniping_transactions
    `);
    db.exec("DROP TABLE sniping_transactions");
    db.exec("ALTER TABLE sniping_transactions_new RENAME TO sniping_transactions");
    db.exec("CREATE INDEX idx_sniping_transactions_state ON sniping_transactions(state)");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: sniping_transactions recreated with pending_payment state");
  }

  // is_demo columns for sniping and item tables
  const snipingDemoTables = [
    "sniping_orders", "sniping_transactions",
    "item_orders", "item_transactions",
    "item_price_history",
    "sniping_price_history", "sniping_item_price_history",
    "sniping_group_price_history", "sniping_item_group_price_history",
  ];
  for (const table of snipingDemoTables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.length > 0 && !cols.some((c) => c.name === "is_demo")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0`);
      console.log(`[db] migration: added is_demo column to ${table}`);
    }
  }
}
