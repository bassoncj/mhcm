import type Database from "better-sqlite3";

export function migrateItems(db: Database.Database): void {
  // Migrate item price columns from INTEGER to REAL for fractional pricing support.
  // Check item_orders as the canary – if its price column is already REAL, skip all.
  const cols = db.prepare("PRAGMA table_info(item_orders)").all() as Array<{ name: string; type: string }>;
  const priceCol = cols.find((c) => c.name === "price");
  if (!priceCol || priceCol.type === "REAL") return;

  console.log("[db] migration: converting item price columns from INTEGER to REAL");
  db.exec("PRAGMA foreign_keys = OFF");

  // 1. item_orders
  db.exec("DROP TABLE IF EXISTS item_orders_new");
  db.exec(`
    CREATE TABLE item_orders_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_type_id INTEGER NOT NULL REFERENCES item_types(id),
      side TEXT NOT NULL CHECK (side IN ('sell', 'buy')),
      price REAL NOT NULL CHECK (price > 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      filled_quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled')),
      close_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      priority_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_demo INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec("INSERT INTO item_orders_new SELECT * FROM item_orders");
  db.exec("DROP TABLE item_orders");
  db.exec("ALTER TABLE item_orders_new RENAME TO item_orders");
  db.exec("CREATE INDEX idx_item_orders_matching ON item_orders(item_type_id, side, status, price, priority_at)");
  db.exec("CREATE INDEX idx_item_orders_user ON item_orders(user_id, status)");

  // 2. item_transactions
  db.exec("DROP TABLE IF EXISTS item_transactions_new");
  db.exec(`
    CREATE TABLE item_transactions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sell_order_id INTEGER NOT NULL REFERENCES item_orders(id),
      buy_order_id INTEGER NOT NULL REFERENCES item_orders(id),
      seller_user_id INTEGER NOT NULL REFERENCES users(id),
      buyer_user_id INTEGER NOT NULL REFERENCES users(id),
      item_type_id INTEGER NOT NULL REFERENCES item_types(id),
      item_type TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
        'pending', 'validating', 'seller_transferring', 'buyer_transferring',
        'pending_payment', 'completed', 'failed'
      )),
      seller_mh_sn_user_id TEXT NOT NULL,
      buyer_mh_sn_user_id TEXT NOT NULL,
      failure_reason TEXT,
      payment_retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_demo INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec("INSERT INTO item_transactions_new SELECT * FROM item_transactions");
  db.exec("DROP TABLE item_transactions");
  db.exec("ALTER TABLE item_transactions_new RENAME TO item_transactions");
  db.exec("CREATE INDEX idx_item_transactions_state ON item_transactions(state)");
  db.exec("CREATE INDEX idx_item_transactions_users ON item_transactions(seller_user_id, buyer_user_id)");

  // 3. item_price_history
  db.exec("DROP TABLE IF EXISTS item_price_history_new");
  db.exec(`
    CREATE TABLE item_price_history_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type_id INTEGER NOT NULL REFERENCES item_types(id),
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_demo INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec("INSERT INTO item_price_history_new SELECT * FROM item_price_history");
  db.exec("DROP TABLE item_price_history");
  db.exec("ALTER TABLE item_price_history_new RENAME TO item_price_history");
  db.exec("CREATE INDEX idx_item_price_history ON item_price_history(item_type_id, completed_at)");

  db.exec("PRAGMA foreign_keys = ON");
  console.log("[db] migration: item price columns converted to REAL");
}

/** Expand item_transactions state CHECK to include verification states. */
export function migrateItemVerificationStates(db: Database.Database): void {
  const itemTxnSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='item_transactions'"
  ).get() as { sql: string } | undefined;

  if (!itemTxnSchema || itemTxnSchema.sql.includes("verifying_item_receipt")) return;

  console.log("[db] migration: adding verification states to item_transactions");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE IF EXISTS item_transactions_new");
  db.exec(`
    CREATE TABLE item_transactions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sell_order_id INTEGER NOT NULL REFERENCES item_orders(id),
      buy_order_id INTEGER NOT NULL REFERENCES item_orders(id),
      seller_user_id INTEGER NOT NULL REFERENCES users(id),
      buyer_user_id INTEGER NOT NULL REFERENCES users(id),
      item_type_id INTEGER NOT NULL REFERENCES item_types(id),
      item_type TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
        'pending', 'validating', 'seller_transferring', 'verifying_item_receipt',
        'buyer_transferring', 'verifying_sb_receipt', 'pending_payment', 'completed', 'failed'
      )),
      seller_mh_sn_user_id TEXT NOT NULL,
      buyer_mh_sn_user_id TEXT NOT NULL,
      failure_reason TEXT,
      payment_retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_demo INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec("INSERT INTO item_transactions_new SELECT * FROM item_transactions");
  db.exec("DROP TABLE item_transactions");
  db.exec("ALTER TABLE item_transactions_new RENAME TO item_transactions");
  db.exec("CREATE INDEX idx_item_transactions_state ON item_transactions(state)");
  db.exec("CREATE INDEX idx_item_transactions_users ON item_transactions(seller_user_id, buyer_user_id)");
  db.exec("PRAGMA foreign_keys = ON");
  console.log("[db] migration: item_transactions recreated with verification states");
}

export function migrateItemTransferTimestamps(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(item_transactions)").all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("seller_transfer_ts")) {
    db.exec("ALTER TABLE item_transactions ADD COLUMN seller_transfer_ts TEXT");
    console.log("[db] migration: added seller_transfer_ts to item_transactions");
  }
  if (!colNames.has("buyer_transfer_ts")) {
    db.exec("ALTER TABLE item_transactions ADD COLUMN buyer_transfer_ts TEXT");
    console.log("[db] migration: added buyer_transfer_ts to item_transactions");
  }
}
