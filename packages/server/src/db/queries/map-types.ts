import { getDb } from "../connection.js";

export interface MapTypeRow {
  id: number;
  map_type: string;
  quality: string;
  goal: string;
  display_name: string;
  thumbnail: string | null;
  alias: string | null;
  max_hunters: number;
  allow_l2m: number;
  last_goal_count: number;
  enabled: number;
  enabled_slots: number;
  enabled_unopened: number;
  enabled_complete: number;
  scroll_item_type: string | null;
  min_rank: string | null;
  map_class: string | null;
  supports_rt: number;
  created_at: string;
}

export type MapTypeFilter = "every" | "enabled" | "slots" | "unopened" | "complete";

export function findMapTypes(filter: MapTypeFilter = "every"): MapTypeRow[] {
  let where = "";
  switch (filter) {
    case "enabled":
      where = "WHERE (enabled_slots = 1 OR enabled_unopened = 1 OR enabled_complete = 1)";
      break;
    case "slots":
      where = "WHERE enabled_slots = 1";
      break;
    case "unopened":
      where = "WHERE enabled_unopened = 1";
      break;
    case "complete":
      where = "WHERE enabled_complete = 1";
      break;
    // "every" = no WHERE clause
  }
  return getDb()
    .prepare(`SELECT * FROM map_types ${where} ORDER BY display_name`)
    .all() as MapTypeRow[];
}

export function findMapTypeById(id: number): MapTypeRow | undefined {
  return getDb()
    .prepare("SELECT * FROM map_types WHERE id = ?")
    .get(id) as MapTypeRow | undefined;
}

/** Look up by the chest type string (matches treasure_map.reward.type). */
export function findMapTypeByRewardType(rewardType: string): MapTypeRow | undefined {
  return getDb()
    .prepare("SELECT * FROM map_types WHERE map_type = ?")
    .get(rewardType) as MapTypeRow | undefined;
}

/** Look up by reward type and goal. */
export function findMapTypeByRewardTypeAndGoal(rewardType: string, goal: string): MapTypeRow | undefined {
  return getDb()
    .prepare("SELECT * FROM map_types WHERE map_type = ? AND goal = ?")
    .get(rewardType, goal) as MapTypeRow | undefined;
}

/** Look up by display_name or alias, scoped to quality. */
export function findMapTypeByNameAndQuality(name: string, quality: string): MapTypeRow | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM map_types WHERE quality = ? AND (display_name = ? OR alias = ?)"
    )
    .get(quality, name, name) as MapTypeRow | undefined;
}

/** Look up by display_name or alias, scoped to quality and goal. */
export function findMapTypeByNameQualityGoal(name: string, quality: string, goal: string): MapTypeRow | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM map_types WHERE quality = ? AND goal = ? AND (display_name = ? OR alias = ?)"
    )
    .get(quality, goal, name, name) as MapTypeRow | undefined;
}

/** Get the goal type for a map type. */
export function getMapTypeGoal(id: number): string {
  const row = getDb()
    .prepare("SELECT goal FROM map_types WHERE id = ?")
    .get(id) as { goal: string } | undefined;
  return row?.goal ?? "mouse";
}

/** Update display_name on an existing row (used when a seeded map is first discovered). */
export function updateMapTypeDisplayName(id: number, displayName: string): void {
  getDb()
    .prepare("UPDATE map_types SET display_name = ? WHERE id = ?")
    .run(displayName, id);
}

/** Insert a newly discovered map type (not in seed data). */
export function insertDiscoveredMapType(params: {
  mapType: string;
  quality: string;
  goal: string;
  displayName: string;
  thumbnail: string | null;
  maxHunters: number;
  mapClass?: string;
}): MapTypeRow {
  return getDb()
    .prepare(
      `INSERT INTO map_types (map_type, quality, goal, display_name, thumbnail, max_hunters, enabled, enabled_slots, enabled_unopened, enabled_complete, map_class)
       VALUES (@mapType, @quality, @goal, @displayName, @thumbnail, @maxHunters, 0, 0, 0, 0, @mapClass)
       RETURNING *`
    )
    .get({ ...params, mapClass: params.mapClass ?? null }) as MapTypeRow;
}

export function setMapTypeMarketEnabled(id: number, market: string, enabled: boolean): void {
  const col = market === "slots" ? "enabled_slots"
            : market === "unopened" ? "enabled_unopened"
            : "enabled_complete";
  getDb().prepare(`UPDATE map_types SET ${col} = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
}

export function setMapTypeAlias(id: number, alias: string | null): void {
  getDb()
    .prepare("UPDATE map_types SET alias = ? WHERE id = ?")
    .run(alias, id);
}

export function setMapTypeThumbnail(id: number, thumbnail: string | null): void {
  getDb()
    .prepare("UPDATE map_types SET thumbnail = ? WHERE id = ?")
    .run(thumbnail, id);
}

export function setMapTypeLastGoalCount(id: number, lastGoalCount: number): void {
  getDb()
    .prepare("UPDATE map_types SET last_goal_count = ? WHERE id = ?")
    .run(lastGoalCount, id);
}

export function setMapTypeScroll(id: number, scrollItemType: string | null): void {
  getDb()
    .prepare("UPDATE map_types SET scroll_item_type = ? WHERE id = ?")
    .run(scrollItemType, id);
}

export function setMapTypeMinRank(id: number, minRank: number | null): void {
  getDb()
    .prepare("UPDATE map_types SET min_rank = ? WHERE id = ?")
    .run(minRank != null ? String(minRank) : null, id);
}

export function setMapTypeClass(id: number, mapClass: string | null): void {
  getDb()
    .prepare("UPDATE map_types SET map_class = ? WHERE id = ?")
    .run(mapClass, id);
}

export function setMapTypeSupportsRt(id: number, supportsRt: boolean): void {
  getDb()
    .prepare("UPDATE map_types SET supports_rt = ? WHERE id = ?")
    .run(supportsRt ? 1 : 0, id);
}

export function getMapTypeClass(id: number): string | null {
  const row = getDb()
    .prepare("SELECT map_class FROM map_types WHERE id = ?")
    .get(id) as { map_class: string | null } | undefined;
  return row?.map_class ?? null;
}
