import type Database from "better-sqlite3";
import { SCHEMA } from "../schema.js";

export function migrateCore(db: Database.Database): void {
  const userCols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string; notnull: number }>;
  const userColNames = new Set(userCols.map((c) => c.name));

  // Fix password_hash NOT NULL constraint (Discord users have no password)
  const passwordHashCol = userCols.find((c) => c.name === "password_hash");
  if (passwordHashCol && passwordHashCol.notnull === 1) {
    console.log("[db] migration: fixing password_hash to allow NULL for Discord users");
    // Disable foreign keys during table recreation
    db.exec("PRAGMA foreign_keys = OFF");
    // Drop any stale temp table from a failed previous migration
    db.exec("DROP TABLE IF EXISTS users_new");
    // Match existing column order exactly for SELECT * to work
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_demo INTEGER NOT NULL DEFAULT 0,
        discord_id TEXT UNIQUE,
        discord_username TEXT
      );
      INSERT INTO users_new SELECT * FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id) WHERE discord_id IS NOT NULL;
    `);
    // Re-enable foreign keys
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: users table recreated with nullable password_hash");
  }

  if (!userColNames.has("role")) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
    console.log("[db] migration: added role column to users");
  }

  if (!userColNames.has("status")) {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
    console.log("[db] migration: added status column to users");
  }

  if (!userColNames.has("is_demo")) {
    db.exec("ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0");
    console.log("[db] migration: added is_demo column to users");
  }

  if (!userColNames.has("discord_id")) {
    db.exec("ALTER TABLE users ADD COLUMN discord_id TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id) WHERE discord_id IS NOT NULL");
    console.log("[db] migration: added discord_id column to users");
  }

  if (!userColNames.has("discord_username")) {
    db.exec("ALTER TABLE users ADD COLUMN discord_username TEXT");
    console.log("[db] migration: added discord_username column to users");
  }

  if (!userColNames.has("notification_prefs")) {
    db.exec("ALTER TABLE users ADD COLUMN notification_prefs TEXT DEFAULT '{}'");
    console.log("[db] migration: added notification_prefs column to users");
  }

  if (!userColNames.has("utc_offset")) {
    db.exec("ALTER TABLE users ADD COLUMN utc_offset REAL DEFAULT 0");
    console.log("[db] migration: added utc_offset column to users");
  }

  const mhCols = db.prepare("PRAGMA table_info(mh_accounts)").all() as Array<{ name: string }>;
  const mhColNames = new Set(mhCols.map((c) => c.name));

  if (!mhColNames.has("email")) {
    db.exec("ALTER TABLE mh_accounts ADD COLUMN email TEXT");
    console.log("[db] migration: added email column to mh_accounts");
  }

  if (!mhColNames.has("verification_code_hash")) {
    db.exec("ALTER TABLE mh_accounts ADD COLUMN verification_code_hash TEXT");
    console.log("[db] migration: added verification_code_hash column to mh_accounts");
  }

  if (!mhColNames.has("code_expires_at")) {
    db.exec("ALTER TABLE mh_accounts ADD COLUMN code_expires_at TEXT");
    console.log("[db] migration: added code_expires_at column to mh_accounts");
  }

  // Detect old TEXT PK schema and recreate with INTEGER PK
  const mapTypeCols = db.prepare("PRAGMA table_info(map_types)").all() as Array<{ name: string; type: string }>;
  const idCol = mapTypeCols.find((c) => c.name === "id");

  if (idCol && idCol.type === "TEXT") {
    console.log("[db] migration: recreating map_types with integer PK (clearing orders, transactions, favourites)");
    db.exec("DROP TABLE IF EXISTS user_favourites");
    db.exec("DROP TABLE IF EXISTS transactions");
    db.exec("DROP TABLE IF EXISTS orders");
    db.exec("DROP TABLE IF EXISTS map_types");
    db.exec(SCHEMA);
  }

  db.exec(`CREATE TABLE IF NOT EXISTS user_favourites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_type_id INTEGER NOT NULL REFERENCES map_types(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, map_type_id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS user_sniping_favourites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, mouse_type_id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS user_map_favourites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_type_id INTEGER NOT NULL REFERENCES map_types(id),
    mode TEXT NOT NULL CHECK (mode IN ('unopened', 'completed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, map_type_id, mode)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS allowed_testers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL UNIQUE,
    discord_username TEXT,
    added_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS mouse_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id) ON DELETE CASCADE,
    alias TEXT NOT NULL COLLATE NOCASE,
    source TEXT,
    UNIQUE(mouse_type_id, alias)
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_mouse_aliases_alias ON mouse_aliases(alias COLLATE NOCASE)");

  db.exec(`CREATE TABLE IF NOT EXISTS sniping_price_seeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id),
    price INTEGER NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    recorded_at TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_sniping_price_seeds ON sniping_price_seeds(mouse_type_id)");

  // mode = NULL for slot notifications, 'unopened'/'completed' for maps marketplace
  const mtnCols = db.prepare("PRAGMA table_info(map_type_notifications)").all() as Array<{ name: string }>;
  if (mtnCols.length > 0 && !new Set(mtnCols.map((c) => c.name)).has("mode")) {
    console.log("[db] migration: recreating map_type_notifications with mode column");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS map_type_notifications_new");
    db.exec(`
      CREATE TABLE map_type_notifications_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        map_type_id INTEGER NOT NULL REFERENCES map_types(id),
        mode TEXT CHECK (mode IN ('unopened', 'completed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO map_type_notifications_new (id, user_id, map_type_id, created_at)
      SELECT id, user_id, map_type_id, created_at FROM map_type_notifications`);
    db.exec("DROP TABLE map_type_notifications");
    db.exec("ALTER TABLE map_type_notifications_new RENAME TO map_type_notifications");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: map_type_notifications recreated with mode column");
  } else if (mtnCols.length === 0) {
    // Fresh install: create table
    db.exec(`CREATE TABLE IF NOT EXISTS map_type_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      map_type_id INTEGER NOT NULL REFERENCES map_types(id),
      mode TEXT CHECK (mode IN ('unopened', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  }
  // Indexes (idempotent, safe now that mode column exists)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_map_type_notif_slot
    ON map_type_notifications(user_id, map_type_id) WHERE mode IS NULL`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_map_type_notif_mode
    ON map_type_notifications(user_id, map_type_id, mode) WHERE mode IS NOT NULL`);

  // user_sniping_favourites: add mouse_group_id (if not yet restructured to goal_type)
  const usfSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='user_sniping_favourites'"
  ).get() as { sql: string } | undefined;

  if (usfSchema && !usfSchema.sql.includes("mouse_group_id") && !usfSchema.sql.includes("goal_type")) {
    console.log("[db] migration: adding mouse_group_id to user_sniping_favourites (recreating table)");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS user_sniping_favourites_new");
    db.exec(`
      CREATE TABLE user_sniping_favourites_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mouse_type_id INTEGER REFERENCES mouse_types(id),
        mouse_group_id INTEGER REFERENCES sniping_mouse_groups(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK ((mouse_type_id IS NOT NULL AND mouse_group_id IS NULL)
            OR (mouse_type_id IS NULL AND mouse_group_id IS NOT NULL)),
        UNIQUE(user_id, mouse_type_id),
        UNIQUE(user_id, mouse_group_id)
      )
    `);
    db.exec(`INSERT INTO user_sniping_favourites_new (id, user_id, mouse_type_id, created_at)
      SELECT id, user_id, mouse_type_id, created_at FROM user_sniping_favourites`);
    db.exec("DROP TABLE user_sniping_favourites");
    db.exec("ALTER TABLE user_sniping_favourites_new RENAME TO user_sniping_favourites");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: user_sniping_favourites recreated with mouse_group_id");
  }

  // user_sniping_favourites: restructure to generalized (goal_type, goal_id) form
  const usfColsForGoal = db.prepare("PRAGMA table_info(user_sniping_favourites)").all() as Array<{ name: string }>;
  const usfColNamesForGoal = new Set(usfColsForGoal.map((c) => c.name));

  if (!usfColNamesForGoal.has("goal_type")) {
    console.log("[db] migration: restructuring user_sniping_favourites to generalized form");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS user_sniping_favourites_new");
    db.exec(`
      CREATE TABLE user_sniping_favourites_new (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        goal_type TEXT NOT NULL CHECK (goal_type IN ('mouse', 'mouse_group', 'item', 'item_group')),
        goal_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, goal_type, goal_id)
      )
    `);
    // Migrate existing mouse favourites
    if (usfColNamesForGoal.has("mouse_type_id")) {
      db.exec(`
        INSERT INTO user_sniping_favourites_new (user_id, goal_type, goal_id, created_at)
        SELECT user_id, 'mouse', mouse_type_id, created_at
        FROM user_sniping_favourites WHERE mouse_type_id IS NOT NULL
      `);
    }
    // Migrate existing mouse group favourites
    if (usfColNamesForGoal.has("mouse_group_id")) {
      db.exec(`
        INSERT INTO user_sniping_favourites_new (user_id, goal_type, goal_id, created_at)
        SELECT user_id, 'mouse_group', mouse_group_id, created_at
        FROM user_sniping_favourites WHERE mouse_group_id IS NOT NULL
      `);
    }
    db.exec("DROP TABLE user_sniping_favourites");
    db.exec("ALTER TABLE user_sniping_favourites_new RENAME TO user_sniping_favourites");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[db] migration: user_sniping_favourites restructured to (goal_type, goal_id)");
  }

  if (!userColNames.has("rank_id")) {
    db.exec("ALTER TABLE users ADD COLUMN rank_id INTEGER");
    console.log("[db] migration: added rank_id column to users");
  }

  const userCols3 = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userCols3.some((c) => c.name === "last_connected_at")) {
    db.exec("ALTER TABLE users ADD COLUMN last_connected_at TEXT");
    console.log("[db] migration: added last_connected_at to users");
  }

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  if (!tables.some((t) => t.name === "suspensions")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS suspensions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        suspended_by INTEGER REFERENCES users(id),
        reason TEXT,
        suspended_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT,
        lifted_at TEXT,
        lifted_by INTEGER REFERENCES users(id),
        lift_note TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_suspensions_user ON suspensions(user_id);
    `);
    console.log("[db] migration: created suspensions table");
  }
}
