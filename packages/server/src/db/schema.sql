-- MouseHunt Community Marketplace schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  discord_id TEXT UNIQUE,
  discord_username TEXT,
  notification_prefs TEXT DEFAULT '{}',  -- JSON object of notification preferences
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mh_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  mh_user_id INTEGER NOT NULL UNIQUE,
  mh_sn_user_id TEXT NOT NULL UNIQUE,
  verification_token TEXT,
  verified_at TEXT,
  email TEXT,
  verification_code_hash TEXT,
  code_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS map_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_type TEXT NOT NULL UNIQUE,    -- chest type string from api.mouse.rip, matches treasure_map.reward.type
  quality TEXT NOT NULL CHECK (quality IN ('common', 'rare')),
  display_name TEXT NOT NULL,
  thumbnail TEXT,                     -- Treasure chest image URL (images.transparent from api.mouse.rip)
  alias TEXT,                         -- Optional short name set by admins e.g. "RECS"
  max_hunters INTEGER NOT NULL DEFAULT 5,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_type_id INTEGER NOT NULL REFERENCES map_types(id),
  side TEXT NOT NULL CHECK (side IN ('sell', 'buy')),
  price INTEGER NOT NULL CHECK (price > 0),      -- SB per slot
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  filled_quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled')),
  mh_map_id INTEGER,               -- required for sell orders
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  priority_at TEXT NOT NULL DEFAULT (datetime('now'))  -- controls queue position; reset on deprioritize
);

CREATE INDEX IF NOT EXISTS idx_orders_matching
  ON orders(map_type_id, side, status, price, priority_at);

CREATE INDEX IF NOT EXISTS idx_orders_user
  ON orders(user_id, status);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sell_order_id INTEGER NOT NULL REFERENCES orders(id),
  buy_order_id INTEGER NOT NULL REFERENCES orders(id),
  seller_user_id INTEGER NOT NULL REFERENCES users(id),
  buyer_user_id INTEGER NOT NULL REFERENCES users(id),
  price INTEGER NOT NULL,           -- locked price at match time
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
  payment_retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_state
  ON transactions(state);

CREATE INDEX IF NOT EXISTS idx_transactions_state_created
  ON transactions(state, created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_users
  ON transactions(seller_user_id, buyer_user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_buyer
  ON transactions(buyer_user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_sell_order
  ON transactions(sell_order_id);

CREATE INDEX IF NOT EXISTS idx_transactions_buy_order
  ON transactions(buy_order_id);

CREATE INDEX IF NOT EXISTS idx_orders_mh_map_id
  ON orders(mh_map_id) WHERE mh_map_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_favourites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_type_id INTEGER NOT NULL REFERENCES map_types(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, map_type_id)
);
