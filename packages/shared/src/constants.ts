export const MH_BASE_URL = "https://www.mousehuntgame.com";

export const MH_ENDPOINTS = {
  TREASURE_MAP: "/managers/ajax/users/treasuremap_v2.php",
  SUPPLY_TRANSFER: "/managers/ajax/users/supplytransfer.php",
  USER_INVENTORY: "/managers/ajax/users/userInventory.php",
  BOARD: "/managers/ajax/board/board.php",
  PAGE: "/managers/ajax/pages/page.php",
  USE_CONVERTIBLE: "/managers/ajax/users/useconvertible.php",
  MICE_EFFECTIVENESS: "/managers/ajax/users/getmiceeffectiveness.php",
  MESSAGES: "/managers/ajax/users/messages.php",
} as const;

export const MH_SB_ITEM_TYPE = "super_brie_cheese";

/** Timeout per transaction step in milliseconds. */
export const TRANSACTION_STEP_TIMEOUT_MS = 30_000;

/** Maximum number of retry attempts for a failed step. */
export const TRANSACTION_MAX_RETRIES = 1;

/** Timeout per sniping transaction step in milliseconds. */
export const SNIPING_STEP_TIMEOUT_MS = 30_000;

/** Timeout for the sniping phase (waiting for catches) in milliseconds (4 hours). */
export const SNIPING_HUNT_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/** Grace period for insufficient SB payment (24 hours). */
export const SNIPING_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

/** Timeout per item transaction step in milliseconds. */
export const ITEM_TRANSACTION_STEP_TIMEOUT_MS = 30_000;

/** Maximum number of retry attempts for pending_payment recovery. */
export const ITEM_PENDING_PAYMENT_MAX_RETRIES = 3;

/** Timeout per map transaction step in milliseconds. */
export const MAP_TRANSACTION_STEP_TIMEOUT_MS = 30_000;

/** Maximum number of retry attempts for pending_completion recovery. */
export const MAP_PENDING_COMPLETION_MAX_RETRIES = 1;

/** Timeout per RT step in milliseconds. */
export const RT_STEP_TIMEOUT_MS = 30_000;

/** Maximum retry attempts for RT item transfer. */
export const RT_MAX_TRANSFER_RETRIES = 3;

/** Default risk check timeout in seconds (configurable via admin). */
export const RISK_CHECK_TIMEOUT_SECONDS = 90;

/** Ping interval for keepalive (ms). */
export const WS_PING_INTERVAL_MS = 30_000;

/** How long to wait for a pong before considering connection dead (ms). */
export const WS_PONG_TIMEOUT_MS = 10_000;

/** Initial reconnect delay (ms). Doubles on each retry up to max. */
export const WS_RECONNECT_INITIAL_MS = 1_000;

/** Maximum reconnect delay (ms). */
export const WS_RECONNECT_MAX_MS = 30_000;

/** JWT expiration time. */
export const JWT_EXPIRY = "7d";
