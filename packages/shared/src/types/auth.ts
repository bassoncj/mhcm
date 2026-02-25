export type UserRole = "user" | "moderator" | "admin";
export type UserStatus = "active" | "suspended";
export type MarketType = "slots" | "sniping" | "items" | "maps";

export interface BetaRequest {
  id: number;
  userId: number;
  username: string;
  discordUsername: string | null;
  status: "pending" | "approved" | "denied";
  createdAt: string;
}

export interface User {
  id: number;
  username: string;
  role: UserRole;
  discordId: string | null;
  discordUsername: string | null;
  createdAt: string;
}

export interface MHAccount {
  userId: number;
  mhUserId: number;
  /** MH social-network user_id string (used for invites/transfers). */
  mhSnUserId: string;
  verified: boolean;
  verifiedAt: string | null;
}

export interface Suspension {
  id: number;
  userId: number;
  suspendedBy: number | null;
  suspendedByUsername: string | null;
  reason: string | null;
  suspendedAt: string;
  expiresAt: string | null;
  liftedAt: string | null;
  liftedBy: number | null;
  liftedByUsername: string | null;
  liftNote: string | null;
}

export interface RegisterPayload {
  username: string;
  password: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  mhAccount: MHAccount | null;
}

/** User notification preferences. All default to true for new users. */
export interface NotificationPrefs {
  // General
  /** 5 minutes before going AFK. */
  afk_warning: boolean;
  /** When user goes AFK (60 min inactive). */
  afk: boolean;
  // Slots
  /** When someone buys your map slot (seller notification). */
  slot_sold: boolean;
  /** When you purchase a slot (buyer notification). */
  slot_purchased: boolean;
  /** When your map is full and ready to close. */
  map_full: boolean;
  /** When a treasure map you're on is completed. */
  map_complete: boolean;
  // Sniping -- Maptain
  /** When a sniper joins your map. */
  sniper_joined: boolean;
  /** When a mouse is caught on your map. */
  mouse_caught: boolean;
  /** When a sniper leaves your map before finishing. */
  sniper_left_early: boolean;
  /** When all sniping orders on your map are done. */
  sniping_map_complete: boolean;
  // Sniping -- Sniper
  /** When you join a map (accepted invite and on the map). */
  sniping_assigned: boolean;
  /** When your mouse catch is confirmed. */
  sniper_catch_confirmed: boolean;
  /** When all your work on a map is done. */
  sniping_job_complete: boolean;
  // Items
  /** When someone buys your item (seller notification). */
  item_sold: boolean;
  /** When you purchase an item (buyer notification). */
  item_purchased: boolean;
  // Maps
  /** When someone buys your map (seller notification). */
  map_sold: boolean;
  /** When you purchase a map (buyer notification). */
  map_purchased: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  afk_warning: true,
  afk: true,
  slot_sold: true,
  slot_purchased: true,
  map_full: true,
  map_complete: true,
  sniper_joined: true,
  mouse_caught: true,
  sniper_left_early: true,
  sniping_map_complete: true,
  sniping_assigned: true,
  sniper_catch_confirmed: true,
  sniping_job_complete: true,
  item_sold: true,
  item_purchased: true,
  map_sold: true,
  map_purchased: true,
};
