import type Database from "better-sqlite3";

export function migrateSlots(db: Database.Database): void {
  db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_sell_order ON transactions(sell_order_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_buy_order ON transactions(buy_order_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_user_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_state_created ON transactions(state, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_mh_map_id ON orders(mh_map_id) WHERE mh_map_id IS NOT NULL");

  const orderCols = db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>;
  const orderColNames = new Set(orderCols.map((c) => c.name));

  if (!orderColNames.has("is_demo")) {
    db.exec("ALTER TABLE orders ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0");
    console.log("[db] migration: added is_demo column to orders");
  }

  const txnCols = db.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>;
  const txnColNames = new Set(txnCols.map((c) => c.name));
  if (!txnColNames.has("is_demo")) {
    db.exec("ALTER TABLE transactions ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0");
    console.log("[db] migration: added is_demo column to transactions");
  }

  const txnSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'"
  ).get() as { sql: string } | undefined;

  if (txnSchema && !txnSchema.sql.includes("cancelling_invite")) {
    console.log("[db] migration: updating transactions state CHECK constraint");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS transactions_new");
    db.exec(`
      CREATE TABLE transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sell_order_id INTEGER NOT NULL REFERENCES orders(id),
        buy_order_id INTEGER NOT NULL REFERENCES orders(id),
        seller_user_id INTEGER NOT NULL REFERENCES users(id),
        buyer_user_id INTEGER NOT NULL REFERENCES users(id),
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
          'pending', 'validating', 'inviting', 'invite_sent', 'accepting',
          'cancelling_invite', 'invite_accepted', 'transferring', 'pending_payment',
          'completed', 'failed'
        )),
        mh_map_id INTEGER NOT NULL,
        buyer_mh_sn_user_id TEXT NOT NULL,
        seller_mh_sn_user_id TEXT NOT NULL,
        failure_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_demo INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec("INSERT INTO transactions_new SELECT * FROM transactions");
    db.exec("DROP TABLE transactions");
    db.exec("ALTER TABLE transactions_new RENAME TO transactions");
    db.exec("CREATE INDEX idx_transactions_sell ON transactions(sell_order_id)");
    db.exec("CREATE INDEX idx_transactions_buy ON transactions(buy_order_id)");
    db.exec("CREATE INDEX idx_transactions_seller ON transactions(seller_user_id)");
    db.exec("CREATE INDEX idx_transactions_buyer ON transactions(buyer_user_id)");
    db.exec("CREATE INDEX idx_transactions_state_created ON transactions(state, created_at)");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: transactions table recreated with updated state constraint");
  }

  const orderColsForTier = db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>;
  const orderColNamesForTier = new Set(orderColsForTier.map((c) => c.name));

  if (!orderColNamesForTier.has("tier")) {
    db.exec("ALTER TABLE orders ADD COLUMN tier TEXT CHECK (tier IN ('S', 'A', 'B'))");
    console.log("[db] migration: added tier column to orders");
  }

  if (!orderColNamesForTier.has("accepted_tiers")) {
    db.exec("ALTER TABLE orders ADD COLUMN accepted_tiers TEXT");
    console.log("[db] migration: added accepted_tiers column to orders");
  }

  const ordersColsRG = db.prepare("PRAGMA table_info(orders)").all() as { name: string }[];
  if (!ordersColsRG.some((c) => c.name === "remaining_goals")) {
    db.exec("ALTER TABLE orders ADD COLUMN remaining_goals TEXT");
    console.log("[db] migration: added remaining_goals to orders");
  }

  const txnSchemaRC = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'"
  ).get() as { sql: string } | undefined;

  if (txnSchemaRC && !txnSchemaRC.sql.includes("risk_checking")) {
    console.log("[db] migration: adding risk_checking state to transactions");
    // Ensure payment_retry_count exists before recreation
    const txnColsRC = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
    const txnColNamesRC = new Set(txnColsRC.map((c) => c.name));
    if (!txnColNamesRC.has("payment_retry_count")) {
      db.exec("ALTER TABLE transactions ADD COLUMN payment_retry_count INTEGER NOT NULL DEFAULT 0");
    }
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS transactions_new");
    db.exec(`
      CREATE TABLE transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sell_order_id INTEGER NOT NULL REFERENCES orders(id),
        buy_order_id INTEGER NOT NULL REFERENCES orders(id),
        seller_user_id INTEGER NOT NULL REFERENCES users(id),
        buyer_user_id INTEGER NOT NULL REFERENCES users(id),
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
          'pending', 'risk_checking', 'validating', 'inviting', 'invite_sent', 'accepting',
          'cancelling_invite', 'invite_accepted', 'transferring', 'pending_payment',
          'completed', 'failed'
        )),
        mh_map_id INTEGER NOT NULL,
        buyer_mh_sn_user_id TEXT NOT NULL,
        seller_mh_sn_user_id TEXT NOT NULL,
        failure_reason TEXT,
        payment_retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_demo INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO transactions_new
      SELECT id, sell_order_id, buy_order_id, seller_user_id, buyer_user_id,
        price, quantity, state, mh_map_id, buyer_mh_sn_user_id, seller_mh_sn_user_id,
        failure_reason, payment_retry_count,
        COALESCE(created_at, datetime('now')),
        COALESCE(updated_at, created_at, datetime('now')),
        COALESCE(is_demo, 0)
      FROM transactions
    `);
    db.exec("DROP TABLE transactions");
    db.exec("ALTER TABLE transactions_new RENAME TO transactions");
    db.exec("CREATE INDEX idx_transactions_state ON transactions(state)");
    db.exec("CREATE INDEX idx_transactions_sell ON transactions(sell_order_id)");
    db.exec("CREATE INDEX idx_transactions_buy ON transactions(buy_order_id)");
    db.exec("CREATE INDEX idx_transactions_seller ON transactions(seller_user_id)");
    db.exec("CREATE INDEX idx_transactions_buyer ON transactions(buyer_user_id)");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: transactions recreated with risk_checking state");
  }

  const orderColsRt = db.prepare("PRAGMA table_info(orders)").all() as { name: string }[];
  const orderColNamesRt = new Set(orderColsRt.map((c) => c.name));
  if (!orderColNamesRt.has("rt_price")) {
    db.exec("ALTER TABLE orders ADD COLUMN rt_price INTEGER CHECK (rt_price IS NULL OR rt_price > 0)");
    console.log("[db] migration: added rt_price to orders");
  }
  if (!orderColNamesRt.has("rt_only")) {
    db.exec("ALTER TABLE orders ADD COLUMN rt_only INTEGER NOT NULL DEFAULT 0");
    console.log("[db] migration: added rt_only to orders");
  }
  if (!orderColNamesRt.has("is_rt")) {
    db.exec("ALTER TABLE orders ADD COLUMN is_rt INTEGER NOT NULL DEFAULT 0");
    console.log("[db] migration: added is_rt to orders");
  }

  const txnSchemaRt = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'"
  ).get() as { sql: string } | undefined;

  if (txnSchemaRt && !txnSchemaRt.sql.includes("awaiting_map_completion")) {
    console.log("[db] migration: adding RT states and is_rt to transactions");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS transactions_new");
    db.exec(`
      CREATE TABLE transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sell_order_id INTEGER NOT NULL REFERENCES orders(id),
        buy_order_id INTEGER NOT NULL REFERENCES orders(id),
        seller_user_id INTEGER NOT NULL REFERENCES users(id),
        buyer_user_id INTEGER NOT NULL REFERENCES users(id),
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
          'pending', 'risk_checking', 'validating', 'inviting', 'invite_sent', 'accepting',
          'cancelling_invite', 'invite_accepted', 'transferring', 'pending_payment',
          'awaiting_map_completion', 'claiming_chest', 'opening_chest', 'transferring_rt',
          'completed', 'failed'
        )),
        mh_map_id INTEGER NOT NULL,
        buyer_mh_sn_user_id TEXT NOT NULL,
        seller_mh_sn_user_id TEXT NOT NULL,
        failure_reason TEXT,
        payment_retry_count INTEGER NOT NULL DEFAULT 0,
        is_rt INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_demo INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO transactions_new
      SELECT id, sell_order_id, buy_order_id, seller_user_id, buyer_user_id,
        price, quantity, state, mh_map_id, buyer_mh_sn_user_id, seller_mh_sn_user_id,
        failure_reason, payment_retry_count, 0,
        COALESCE(created_at, datetime('now')),
        COALESCE(updated_at, created_at, datetime('now')),
        COALESCE(is_demo, 0)
      FROM transactions
    `);
    db.exec("DROP TABLE transactions");
    db.exec("ALTER TABLE transactions_new RENAME TO transactions");
    db.exec("CREATE INDEX idx_transactions_state ON transactions(state)");
    db.exec("CREATE INDEX idx_transactions_sell ON transactions(sell_order_id)");
    db.exec("CREATE INDEX idx_transactions_buy ON transactions(buy_order_id)");
    db.exec("CREATE INDEX idx_transactions_seller ON transactions(seller_user_id)");
    db.exec("CREATE INDEX idx_transactions_buyer ON transactions(buyer_user_id)");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: transactions recreated with RT states and is_rt column");
  }

  const txnSchemaVerify = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'"
  ).get() as { sql: string } | undefined;

  if (txnSchemaVerify && !txnSchemaVerify.sql.includes("verifying_invite_sent")) {
    console.log("[db] migration: adding verification states to transactions");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS transactions_new");
    db.exec(`
      CREATE TABLE transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sell_order_id INTEGER NOT NULL REFERENCES orders(id),
        buy_order_id INTEGER NOT NULL REFERENCES orders(id),
        seller_user_id INTEGER NOT NULL REFERENCES users(id),
        buyer_user_id INTEGER NOT NULL REFERENCES users(id),
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
          'pending', 'risk_checking', 'validating', 'inviting', 'invite_sent', 'accepting',
          'cancelling_invite', 'invite_accepted', 'transferring', 'pending_payment',
          'verifying_invite_sent', 'verifying_invite_accepted', 'verifying_sb_receipt',
          'awaiting_map_completion', 'claiming_chest', 'opening_chest', 'transferring_rt',
          'completed', 'failed'
        )),
        mh_map_id INTEGER NOT NULL,
        buyer_mh_sn_user_id TEXT NOT NULL,
        seller_mh_sn_user_id TEXT NOT NULL,
        failure_reason TEXT,
        payment_retry_count INTEGER NOT NULL DEFAULT 0,
        is_rt INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_demo INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO transactions_new
      SELECT id, sell_order_id, buy_order_id, seller_user_id, buyer_user_id,
        price, quantity, state, mh_map_id, buyer_mh_sn_user_id, seller_mh_sn_user_id,
        failure_reason, payment_retry_count, is_rt,
        created_at, updated_at, is_demo
      FROM transactions
    `);
    db.exec("DROP TABLE transactions");
    db.exec("ALTER TABLE transactions_new RENAME TO transactions");
    db.exec("CREATE INDEX idx_transactions_state ON transactions(state)");
    db.exec("CREATE INDEX idx_transactions_sell ON transactions(sell_order_id)");
    db.exec("CREATE INDEX idx_transactions_buy ON transactions(buy_order_id)");
    db.exec("CREATE INDEX idx_transactions_seller ON transactions(seller_user_id)");
    db.exec("CREATE INDEX idx_transactions_buyer ON transactions(buyer_user_id)");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: transactions recreated with verification states");
  }

  // Remove verifying_invite_accepted from transactions CHECK constraint (that state is no longer used)
  const txnSchemaNoInviteAccepted = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'"
  ).get() as { sql: string } | undefined;

  if (txnSchemaNoInviteAccepted && txnSchemaNoInviteAccepted.sql.includes("verifying_invite_accepted")) {
    console.log("[db] migration: removing verifying_invite_accepted state from transactions");
    db.exec("PRAGMA foreign_keys = OFF");
    // Move any rows stuck in verifying_invite_accepted to pending_payment (buyer was already on map)
    db.exec("UPDATE transactions SET state = 'pending_payment' WHERE state = 'verifying_invite_accepted'");
    db.exec("DROP TABLE IF EXISTS transactions_new");
    db.exec(`
      CREATE TABLE transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sell_order_id INTEGER NOT NULL REFERENCES orders(id),
        buy_order_id INTEGER NOT NULL REFERENCES orders(id),
        seller_user_id INTEGER NOT NULL REFERENCES users(id),
        buyer_user_id INTEGER NOT NULL REFERENCES users(id),
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
          'pending', 'risk_checking', 'validating', 'inviting', 'invite_sent', 'accepting',
          'cancelling_invite', 'invite_accepted', 'transferring', 'pending_payment',
          'verifying_invite_sent', 'verifying_map_valid', 'verifying_sb_receipt',
          'awaiting_map_completion', 'claiming_chest', 'opening_chest', 'transferring_rt',
          'completed', 'failed'
        )),
        mh_map_id INTEGER NOT NULL,
        buyer_mh_sn_user_id TEXT NOT NULL,
        seller_mh_sn_user_id TEXT NOT NULL,
        failure_reason TEXT,
        payment_retry_count INTEGER NOT NULL DEFAULT 0,
        is_rt INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_demo INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO transactions_new
      SELECT id, sell_order_id, buy_order_id, seller_user_id, buyer_user_id,
        price, quantity, state, mh_map_id, buyer_mh_sn_user_id, seller_mh_sn_user_id,
        failure_reason, payment_retry_count, is_rt,
        created_at, updated_at, is_demo
      FROM transactions
    `);
    db.exec("DROP TABLE transactions");
    db.exec("ALTER TABLE transactions_new RENAME TO transactions");
    db.exec("CREATE INDEX idx_transactions_state ON transactions(state)");
    db.exec("CREATE INDEX idx_transactions_sell ON transactions(sell_order_id)");
    db.exec("CREATE INDEX idx_transactions_buy ON transactions(buy_order_id)");
    db.exec("CREATE INDEX idx_transactions_seller ON transactions(seller_user_id)");
    db.exec("CREATE INDEX idx_transactions_buyer ON transactions(buyer_user_id)");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: transactions recreated without verifying_invite_accepted");
  }

  // Fix: earlier migration removed verifying_invite_accepted but may not have added verifying_map_valid
  // (if the code at that time didn't include it yet). Re-create if verifying_map_valid is missing.
  const txnSchemaFixVmv = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'"
  ).get() as { sql: string } | undefined;

  if (txnSchemaFixVmv && txnSchemaFixVmv.sql.includes("verifying_invite_sent") && !txnSchemaFixVmv.sql.includes("verifying_map_valid")) {
    console.log("[db] migration: adding verifying_map_valid state to transactions");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS transactions_new");
    db.exec(`
      CREATE TABLE transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sell_order_id INTEGER NOT NULL REFERENCES orders(id),
        buy_order_id INTEGER NOT NULL REFERENCES orders(id),
        seller_user_id INTEGER NOT NULL REFERENCES users(id),
        buyer_user_id INTEGER NOT NULL REFERENCES users(id),
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
          'pending', 'risk_checking', 'validating', 'inviting', 'invite_sent', 'accepting',
          'cancelling_invite', 'invite_accepted', 'transferring', 'pending_payment',
          'verifying_invite_sent', 'verifying_map_valid', 'verifying_sb_receipt',
          'awaiting_map_completion', 'claiming_chest', 'opening_chest', 'transferring_rt',
          'completed', 'failed'
        )),
        mh_map_id INTEGER NOT NULL,
        buyer_mh_sn_user_id TEXT NOT NULL,
        seller_mh_sn_user_id TEXT NOT NULL,
        failure_reason TEXT,
        payment_retry_count INTEGER NOT NULL DEFAULT 0,
        is_rt INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_demo INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO transactions_new
      SELECT id, sell_order_id, buy_order_id, seller_user_id, buyer_user_id,
        price, quantity, state, mh_map_id, buyer_mh_sn_user_id, seller_mh_sn_user_id,
        failure_reason, payment_retry_count, is_rt,
        created_at, updated_at, is_demo
      FROM transactions
    `);
    db.exec("DROP TABLE transactions");
    db.exec("ALTER TABLE transactions_new RENAME TO transactions");
    db.exec("CREATE INDEX idx_transactions_state ON transactions(state)");
    db.exec("CREATE INDEX idx_transactions_sell ON transactions(sell_order_id)");
    db.exec("CREATE INDEX idx_transactions_buy ON transactions(buy_order_id)");
    db.exec("CREATE INDEX idx_transactions_seller ON transactions(seller_user_id)");
    db.exec("CREATE INDEX idx_transactions_buyer ON transactions(buyer_user_id)");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: transactions recreated with verifying_map_valid state");
  }

  // Add sb_transfer_ts column for cross-verification time anchor
  const txnColsSbTs = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
  if (!txnColsSbTs.some((c) => c.name === "sb_transfer_ts")) {
    db.exec("ALTER TABLE transactions ADD COLUMN sb_transfer_ts TEXT");
    console.log("[db] migration: added sb_transfer_ts to transactions");
  }

  const tablesRt = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  if (!tablesRt.some((t) => t.name === "rt_pending_items")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rt_pending_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL REFERENCES transactions(id),
        item_type TEXT NOT NULL,
        item_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        transferred INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        transferred_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_rt_pending_txn ON rt_pending_items(transaction_id);
    `);
    console.log("[db] migration: created rt_pending_items table");
  }

  // Relax price CHECK to >= 0 for RT-only sells (price = 0)
  const ordersSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'"
  ).get() as { sql: string } | undefined;
  if (ordersSchema && ordersSchema.sql.includes("price > 0")) {
    console.log("[db] migration: relaxing orders.price CHECK to >= 0 for RT-only sells");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS orders_new");
    db.exec(`
      CREATE TABLE orders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        map_type_id INTEGER NOT NULL REFERENCES map_types(id),
        side TEXT NOT NULL CHECK (side IN ('sell', 'buy')),
        price INTEGER NOT NULL CHECK (price >= 0),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        filled_quantity INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled')),
        mh_map_id INTEGER,
        tier TEXT CHECK (tier IN ('S', 'A', 'B')),
        accepted_tiers TEXT,
        remaining_goals TEXT,
        rt_price INTEGER CHECK (rt_price IS NULL OR rt_price > 0),
        rt_only INTEGER NOT NULL DEFAULT 0,
        is_rt INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        priority_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_demo INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO orders_new
      SELECT id, user_id, map_type_id, side, price, quantity, filled_quantity,
        status, mh_map_id, tier, accepted_tiers, remaining_goals,
        rt_price, rt_only, is_rt,
        created_at, updated_at, priority_at, is_demo
      FROM orders
    `);
    db.exec("DROP TABLE orders");
    db.exec("ALTER TABLE orders_new RENAME TO orders");
    db.exec("CREATE INDEX idx_orders_matching ON orders(map_type_id, side, status, price, priority_at)");
    db.exec("CREATE INDEX idx_orders_user ON orders(user_id, status)");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: orders recreated with relaxed price CHECK");
  }
}
