export interface MHBaseRequestParams {
  sn: "Hitgrab";
  hg_is_ajax: "1";
  uh: string;
}

export interface MHPlayerIdentity {
  userId: number;
  /** Social-network user ID string (e.g., "10154931618425845"). */
  snUserId: string;
  /** Per-session auth token (`window.user.unique_hash`). */
  uniqueHash: string;
  email?: string;
}

export type MHMapClass = "treasure" | "event" | "poster";
export type MHMapQuality = "common" | "rare";

export interface MHMapHunter {
  user_id: number;
  sn_user_id: string;
  name: string;
  captain: boolean;
  completed_goal_ids: Record<string, number[]>;
}

/** The `treasure_map` object from a `map_info` response. */
export interface MHTreasureMap {
  map_id: number;
  map_class: MHMapClass;
  map_type: string;
  name: string;
  quality: MHMapQuality;
  is_owner: boolean;
  is_complete: boolean | null;
  max_hunters: number;
  num_active_hunters: number;
  can_send_invites: boolean;
  invited_hunters: string[];
  hunters: MHMapHunter[];
  goals: {
    mouse: MHMapGoal[];
    item: MHMapGoal[];
  };
  reward: {
    type: string;
    name: string;
    contents: unknown[];
  };
  is_upgradeable: boolean;
}

export interface MHMapGoal {
  type: string;
  unique_id: number;
  name: string;
}

/** Remaining goal (mouse or item) on an active map -- for tier calculation. */
export interface MHRemainingGoal {
  uniqueId: number;
  /** Type string (e.g., "ancient_of_the_deep" for mice, "cherry_potion" for items). */
  type: string;
}

/** An entry in `QuestRelicHunter.maps` indicating an active map. */
export interface MHActiveMap {
  map_id: number;
  name: string;
  num_found: number;
  num_total: number;
  is_rare: boolean | null;
  map_class: MHMapClass;
  /** Enriched fields populated via getMapInfo. */
  map_type?: string;
  quality?: MHMapQuality;
  /** treasure_map.reward.type -- matches MapType.mapType in the catalog. */
  reward_type?: string;
  is_owner?: boolean;
  max_hunters?: number;
  num_active_hunters?: number;
  invited_hunters?: string[];
  /** Goal type: 'mouse' or 'item' -- set during enrichment from is_scavenger_hunt. */
  goalType?: "mouse" | "item";
  /** Remaining goals (uncaught/unfound by anyone) -- for tier calculation. */
  remaining_goals?: MHRemainingGoal[];
}

/** A scroll case item from `treasure_map_inventory.items`. */
export interface MHScrollCaseItem {
  type: string;
  name: string;
  quantity: number;
  thumb: string;
}

export interface MHInviteMember {
  name: string;
  snuid?: string;
  is_empty?: boolean;
}

/** An entry in the `treasure_map_invites` array. */
export interface MHTreasureMapInvite {
  map_id: number;
  map_name: string;
  owner_snuid: string;
  owner_name: string;
  num_remaining: number;
  members: MHInviteMember[];
  can_join: boolean;
}

export interface MHBoardMessage {
  message_id: string;
  body: string;
  user_id: string;
  sn_user_id: string;
  create_date: string;
}

export interface MHBoardPage {
  board_id: string;
  board_type: string;
  owner_unique_id: string;
  messages: MHBoardMessage[];
}

export interface MHInventoryItem {
  type: string;
  name: string;
  quantity: number;
}
