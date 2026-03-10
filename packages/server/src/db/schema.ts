export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  discord_id TEXT UNIQUE,
  discord_username TEXT,
  notification_prefs TEXT DEFAULT '{}',
  utc_offset REAL DEFAULT 0,
  rank_id INTEGER,
  last_connected_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
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
  supports_rt INTEGER NOT NULL DEFAULT 0,
  enabled_slots INTEGER NOT NULL DEFAULT 0,
  enabled_unopened INTEGER NOT NULL DEFAULT 0,
  enabled_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(map_type, quality, goal)
);

CREATE TABLE IF NOT EXISTS mouse_types (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  abbreviated_name TEXT NOT NULL,
  thumbnail TEXT,
  global_tier TEXT CHECK (global_tier IN ('S', 'A', 'B')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mouse_map_tiers (
  mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id) ON DELETE CASCADE,
  map_type_id INTEGER NOT NULL REFERENCES map_types(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('S', 'A', 'B')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (mouse_type_id, map_type_id)
);

CREATE TABLE IF NOT EXISTS orders (
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
);

CREATE INDEX IF NOT EXISTS idx_orders_matching
  ON orders(map_type_id, side, status, price, priority_at);

CREATE INDEX IF NOT EXISTS idx_orders_user
  ON orders(user_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_mh_map_id
  ON orders(mh_map_id) WHERE mh_map_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS transactions (
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
  sb_transfer_ts TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_transactions_state
  ON transactions(state);

CREATE INDEX IF NOT EXISTS idx_transactions_sell
  ON transactions(sell_order_id);

CREATE INDEX IF NOT EXISTS idx_transactions_buy
  ON transactions(buy_order_id);

CREATE INDEX IF NOT EXISTS idx_transactions_seller
  ON transactions(seller_user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_buyer
  ON transactions(buyer_user_id);

CREATE TABLE IF NOT EXISTS slot_risk_decisions (
  buy_order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sell_order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'blocked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (buy_order_id, sell_order_id)
);

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

CREATE TABLE IF NOT EXISTS allowed_testers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL UNIQUE,
  discord_username TEXT,
  added_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS beta_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mouse_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id) ON DELETE CASCADE,
  alias TEXT NOT NULL COLLATE NOCASE,
  source TEXT,
  UNIQUE(mouse_type_id, alias)
);
CREATE INDEX IF NOT EXISTS idx_mouse_aliases_alias ON mouse_aliases(alias COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS sniping_price_seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id),
  price INTEGER NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sniping_price_seeds ON sniping_price_seeds(mouse_type_id);

CREATE TABLE IF NOT EXISTS sniping_mouse_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  enabled INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sniping_mouse_group_members (
  group_id INTEGER NOT NULL REFERENCES sniping_mouse_groups(id) ON DELETE CASCADE,
  mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id),
  PRIMARY KEY (group_id, mouse_type_id)
);

CREATE TABLE IF NOT EXISTS sniping_orders (
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
  min_rank_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  priority_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  CHECK (
    (mouse_type_id IS NOT NULL AND mouse_group_id IS NULL AND item_type_id IS NULL AND item_group_id IS NULL) OR
    (mouse_type_id IS NULL AND mouse_group_id IS NOT NULL AND item_type_id IS NULL AND item_group_id IS NULL) OR
    (mouse_type_id IS NULL AND mouse_group_id IS NULL AND item_type_id IS NOT NULL AND item_group_id IS NULL) OR
    (mouse_type_id IS NULL AND mouse_group_id IS NULL AND item_type_id IS NULL AND item_group_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_sniping_orders_matching
  ON sniping_orders(goal_type, mouse_type_id, mouse_group_id, item_type_id, item_group_id, side, status, price, priority_at);

CREATE INDEX IF NOT EXISTS idx_sniping_orders_user
  ON sniping_orders(user_id, status);

CREATE TABLE IF NOT EXISTS sniping_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sniper_user_id INTEGER NOT NULL REFERENCES users(id),
  maptain_user_id INTEGER NOT NULL REFERENCES users(id),
  mouse_group_id INTEGER REFERENCES sniping_mouse_groups(id),
  item_group_id INTEGER REFERENCES sniping_item_groups(id),
  goal_type TEXT NOT NULL DEFAULT 'mouse' CHECK (goal_type IN ('mouse', 'item')),
  mh_map_id INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
    'pending', 'inviting', 'invite_sent', 'sniping', 'verifying_goal_completed',
    'awaiting_payment', 'pending_payment', 'transferring', 'verifying_sb_receipt',
    'awaiting_leave', 'verifying_sniper_left',
    'completed', 'failed'
  )),
  sniper_mh_sn_user_id TEXT NOT NULL,
  maptain_mh_sn_user_id TEXT NOT NULL,
  failure_reason TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sniping_transactions_state
  ON sniping_transactions(state);

CREATE TABLE IF NOT EXISTS sniping_transaction_mice (
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
);

CREATE TABLE IF NOT EXISTS sniping_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mouse_type_id INTEGER NOT NULL REFERENCES mouse_types(id),
  price INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sniping_price_history ON sniping_price_history(mouse_type_id, completed_at);

CREATE TABLE IF NOT EXISTS sniping_group_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES sniping_mouse_groups(id),
  price INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sniping_group_price_history
  ON sniping_group_price_history(group_id, completed_at);

CREATE TABLE IF NOT EXISTS sniping_item_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  enabled INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sniping_item_group_members (
  group_id INTEGER NOT NULL REFERENCES sniping_item_groups(id) ON DELETE CASCADE,
  item_type_id INTEGER NOT NULL REFERENCES item_types(id),
  PRIMARY KEY (group_id, item_type_id)
);

CREATE TABLE IF NOT EXISTS sniping_transaction_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES sniping_transactions(id) ON DELETE CASCADE,
  buy_order_id INTEGER NOT NULL REFERENCES sniping_orders(id),
  sell_order_id INTEGER NOT NULL REFERENCES sniping_orders(id),
  item_type_id INTEGER NOT NULL REFERENCES item_types(id),
  price INTEGER NOT NULL,
  found INTEGER NOT NULL DEFAULT 0,
  found_at TEXT,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  UNIQUE(transaction_id, item_type_id)
);

CREATE TABLE IF NOT EXISTS sniping_item_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type_id INTEGER NOT NULL REFERENCES item_types(id),
  price INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sniping_item_price_history
  ON sniping_item_price_history(item_type_id, completed_at);

CREATE TABLE IF NOT EXISTS sniping_item_group_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_group_id INTEGER NOT NULL REFERENCES sniping_item_groups(id),
  price INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sniping_item_group_price_history
  ON sniping_item_group_price_history(item_group_id, completed_at);

CREATE TABLE IF NOT EXISTS payment_penalties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  transaction_id INTEGER NOT NULL REFERENCES sniping_transactions(id),
  penalty_type TEXT NOT NULL CHECK (penalty_type IN ('insufficient_sb')),
  reported_balance INTEGER,
  required_amount INTEGER NOT NULL,
  grace_expires_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('paid', 'suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payment_penalties_user
  ON payment_penalties(user_id, resolved_at);
CREATE INDEX IF NOT EXISTS idx_payment_penalties_txn
  ON payment_penalties(transaction_id);

CREATE TABLE IF NOT EXISTS user_sniping_favourites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('mouse', 'mouse_group', 'item', 'item_group')),
  goal_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, goal_type, goal_id)
);

CREATE TABLE IF NOT EXISTS item_types (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  classification TEXT NOT NULL,
  thumbnail TEXT,
  alias TEXT,
  global_tier TEXT CHECK (global_tier IN ('S', 'A', 'B')),
  is_tradable INTEGER NOT NULL DEFAULT 1,
  system_hidden INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  always_warn INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS item_risk_locations (
  item_type_id INTEGER NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
  environment_type TEXT NOT NULL,
  PRIMARY KEY (item_type_id, environment_type)
);

CREATE TABLE IF NOT EXISTS item_map_tiers (
  item_type_id INTEGER NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
  map_type_id INTEGER NOT NULL REFERENCES map_types(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('S', 'A', 'B')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_type_id, map_type_id)
);

CREATE TABLE IF NOT EXISTS item_orders (
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
);

CREATE INDEX IF NOT EXISTS idx_item_orders_matching
  ON item_orders(item_type_id, side, status, price, priority_at);

CREATE INDEX IF NOT EXISTS idx_item_orders_user
  ON item_orders(user_id, status);

CREATE TABLE IF NOT EXISTS item_transactions (
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
  seller_transfer_ts TEXT,
  buyer_transfer_ts TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_item_transactions_state
  ON item_transactions(state);

CREATE INDEX IF NOT EXISTS idx_item_transactions_users
  ON item_transactions(seller_user_id, buyer_user_id);

CREATE TABLE IF NOT EXISTS item_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type_id INTEGER NOT NULL REFERENCES item_types(id),
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_item_price_history
  ON item_price_history(item_type_id, completed_at);

CREATE TABLE IF NOT EXISTS user_item_favourites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type_id INTEGER NOT NULL REFERENCES item_types(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, item_type_id)
);

CREATE TABLE IF NOT EXISTS item_type_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type_id INTEGER NOT NULL REFERENCES item_types(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, item_type_id)
);

CREATE TABLE IF NOT EXISTS scrolls (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  thumbnail TEXT
);

CREATE TABLE IF NOT EXISTS ranks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  large_image TEXT,
  num_title_locations INTEGER NOT NULL DEFAULT 0,
  num_total_locations INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS map_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_type_id INTEGER NOT NULL REFERENCES map_types(id),
  mode TEXT NOT NULL CHECK (mode IN ('unopened', 'completed')),
  side TEXT NOT NULL CHECK (side IN ('sell', 'buy')),
  price INTEGER NOT NULL CHECK (price > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  filled_quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled')),
  close_reason TEXT,
  mh_map_id INTEGER,
  tier TEXT CHECK (tier IN ('S', 'A', 'B')),
  accepted_tiers TEXT,
  remaining_goals TEXT,
  priority_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_map_orders_matching
  ON map_orders(map_type_id, mode, side, status, price, priority_at);

CREATE INDEX IF NOT EXISTS idx_map_orders_user
  ON map_orders(user_id, status);

CREATE TABLE IF NOT EXISTS map_transactions (
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
    'pending', 'risk_checking', 'validating_seller', 'validating_buyer',
    'inviting', 'verifying_invite_sent', 'verifying_map_valid', 'transferring_sb', 'verifying_sb_receipt',
    'verifying_map_free', 'opening_scroll', 'verifying_scroll_opened',
    'accepting', 'transferring_ownership', 'verifying_ownership',
    'seller_leaving', 'verifying_seller_left',
    'reversing_sb', 'cancelling_invite', 'pending_completion',
    'completed', 'failed'
  )),
  mh_map_id INTEGER,
  scroll_item_type TEXT,
  seller_mh_sn_user_id TEXT NOT NULL,
  buyer_mh_sn_user_id TEXT NOT NULL,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  sb_transfer_ts TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_map_transactions_state
  ON map_transactions(state);

CREATE INDEX IF NOT EXISTS idx_map_transactions_users
  ON map_transactions(seller_user_id, buyer_user_id);

CREATE TABLE IF NOT EXISTS map_risk_decisions (
  buy_order_id INTEGER NOT NULL REFERENCES map_orders(id) ON DELETE CASCADE,
  sell_order_id INTEGER NOT NULL REFERENCES map_orders(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'blocked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (buy_order_id, sell_order_id)
);

CREATE TABLE IF NOT EXISTS map_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_type_id INTEGER NOT NULL REFERENCES map_types(id),
  mode TEXT NOT NULL CHECK (mode IN ('unopened', 'completed')),
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_map_price_history
  ON map_price_history(map_type_id, mode, completed_at);

CREATE TABLE IF NOT EXISTS map_type_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_type_id INTEGER NOT NULL REFERENCES map_types(id),
  mode TEXT CHECK (mode IN ('unopened', 'completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_type_notif_slot
  ON map_type_notifications(user_id, map_type_id) WHERE mode IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_type_notif_mode
  ON map_type_notifications(user_id, map_type_id, mode) WHERE mode IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_favourites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_type_id INTEGER NOT NULL REFERENCES map_types(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, map_type_id)
);

CREATE TABLE IF NOT EXISTS user_map_favourites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_type_id INTEGER NOT NULL REFERENCES map_types(id),
  mode TEXT NOT NULL CHECK (mode IN ('unopened', 'completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, map_type_id, mode)
);

CREATE TABLE IF NOT EXISTS admin_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'announcement'
    CHECK (alert_type IN ('announcement', 'warning', 'maintenance', 'info', 'beta')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_alert_acknowledgments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id INTEGER NOT NULL REFERENCES admin_alerts(id) ON DELETE CASCADE,
  acknowledged_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, alert_id)
);

CREATE TABLE IF NOT EXISTS environments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, step_id, version)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_user
  ON onboarding_tasks(user_id, completed_at);

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
`;
