import type { MouseTier } from "@mhcm/shared";
import { getDb } from "../connection.js";

export interface MouseTypeRow {
  id: number;
  type: string;
  name: string;
  abbreviated_name: string;
  thumbnail: string | null;
  global_tier: string | null;
  created_at: string;
}

export interface MouseMapTierRow {
  mouse_type_id: number;
  map_type_id: number;
  tier: string;
  created_at: string;
}

/** Find a mouse type by its MH unique_id. */
export function findMouseTypeById(id: number): MouseTypeRow | undefined {
  return getDb()
    .prepare("SELECT * FROM mouse_types WHERE id = ?")
    .get(id) as MouseTypeRow | undefined;
}

/** Find a mouse type by its internal type string. */
export function findMouseTypeByType(type: string): MouseTypeRow | undefined {
  return getDb()
    .prepare("SELECT * FROM mouse_types WHERE type = ?")
    .get(type) as MouseTypeRow | undefined;
}

/** Find all mouse types. */
export function findAllMouseTypes(): MouseTypeRow[] {
  return getDb()
    .prepare("SELECT * FROM mouse_types ORDER BY name")
    .all() as MouseTypeRow[];
}

/** Row shape for mixed mouse/group results. */
export interface MouseOrGroupRow extends MouseTypeRow {
  is_group: number;
  /** Comma-separated aliases (populated via GROUP_CONCAT for admin list). */
  aliases_str?: string | null;
  /** Group-only: number of mice in the group. */
  mouse_count?: number;
  /** Group-only: enabled flag. */
  enabled?: number;
  /** Group-only: archived flag. */
  archived?: number;
}

/** Search mouse types by name, abbreviated name, type, or alias (partial match). Includes sniping groups. */
export function searchMouseTypes(query: string, limit = 50): MouseOrGroupRow[] {
  const like = `%${query}%`;
  return getDb()
    .prepare(
      `SELECT * FROM (
         SELECT DISTINCT mt.id, mt.type, mt.name, mt.abbreviated_name, mt.thumbnail,
                mt.global_tier, mt.created_at, 0 as is_group
         FROM mouse_types mt
         LEFT JOIN mouse_aliases ma ON ma.mouse_type_id = mt.id
         WHERE mt.name LIKE ? OR mt.abbreviated_name LIKE ? OR mt.type LIKE ?
           OR ma.alias LIKE ?
         UNION ALL
         SELECT g.id, '' as type, g.name, '' as abbreviated_name, NULL as thumbnail,
                NULL as global_tier, g.created_at, 1 as is_group
         FROM sniping_mouse_groups g
         WHERE g.enabled = 1 AND g.archived = 0 AND g.name LIKE ?
       ) combined
       ORDER BY combined.name LIMIT ?`
    )
    .all(like, like, like, like, like, limit) as MouseOrGroupRow[];
}

/** List mouse types with pagination and optional search/filter (includes alias search). Includes sniping groups when no tier filter. */
export function listMouseTypes(params: {
  search?: string;
  tierFilter?: MouseTier | "unset" | null;
  limit?: number;
  offset?: number;
  includeArchivedGroups?: boolean;
  groupsOnly?: boolean;
}): { mice: MouseOrGroupRow[]; total: number } {
  const db = getDb();
  const { search, tierFilter, limit = 50, offset = 0, includeArchivedGroups = false, groupsOnly = false } = params;

  // When filtering by tier, only show mice (groups have no tier concept)
  // When groupsOnly, only show groups
  const includeGroups = groupsOnly || !tierFilter;

  // --- Mouse portion ---
  const mouseFromClause = search
    ? "FROM mouse_types mt LEFT JOIN mouse_aliases ma ON ma.mouse_type_id = mt.id"
    : "FROM mouse_types mt";

  let mouseWhere = "WHERE 1=1";
  const mouseParams: any[] = [];

  if (search) {
    mouseWhere += " AND (mt.name LIKE ? OR mt.abbreviated_name LIKE ? OR mt.type LIKE ? OR ma.alias LIKE ?)";
    const like = `%${search}%`;
    mouseParams.push(like, like, like, like);
  }

  if (tierFilter === "unset") {
    mouseWhere += " AND mt.global_tier IS NULL";
  } else if (tierFilter) {
    mouseWhere += " AND mt.global_tier = ?";
    mouseParams.push(tierFilter);
  }

  // Mouse count (skip when groupsOnly)
  const mouseCount = groupsOnly ? 0 : (db
    .prepare(`SELECT COUNT(DISTINCT mt.id) as count ${mouseFromClause} ${mouseWhere}`)
    .get(...mouseParams) as { count: number }).count;

  // --- Group portion ---
  let groupCount = 0;
  const groupParams: any[] = [];
  let groupWhere = "WHERE 1=1";

  if (includeGroups) {
    if (!includeArchivedGroups) {
      groupWhere += " AND g.archived = 0";
    }
    if (search) {
      groupWhere += " AND g.name LIKE ?";
      groupParams.push(`%${search}%`);
    }
    groupCount = (db
      .prepare(`SELECT COUNT(*) as count FROM sniping_mouse_groups g ${groupWhere}`)
      .get(...groupParams) as { count: number }).count;
  }

  const total = mouseCount + groupCount;

  // --- Combined query via UNION ALL ---
  let rows: MouseOrGroupRow[];
  if (groupsOnly) {
    rows = db
      .prepare(
        `SELECT g.id, '' as type, g.name, '' as abbreviated_name, NULL as thumbnail,
                NULL as global_tier, g.created_at, 1 as is_group,
                NULL as aliases_str,
                (SELECT COUNT(*) FROM sniping_mouse_group_members WHERE group_id = g.id) as mouse_count,
                g.enabled, g.archived
         FROM sniping_mouse_groups g ${groupWhere}
         ORDER BY g.name LIMIT ? OFFSET ?`
      )
      .all(...groupParams, limit, offset) as MouseOrGroupRow[];
  } else if (includeGroups) {
    rows = db
      .prepare(
        `SELECT * FROM (
           SELECT DISTINCT mt.id, mt.type, mt.name, mt.abbreviated_name, mt.thumbnail,
                  mt.global_tier, mt.created_at, 0 as is_group,
                  (SELECT GROUP_CONCAT(ma2.alias, ', ') FROM mouse_aliases ma2 WHERE ma2.mouse_type_id = mt.id) as aliases_str,
                  NULL as mouse_count, NULL as enabled, NULL as archived
           ${mouseFromClause} ${mouseWhere}
           UNION ALL
           SELECT g.id, '' as type, g.name, '' as abbreviated_name, NULL as thumbnail,
                  NULL as global_tier, g.created_at, 1 as is_group,
                  NULL as aliases_str,
                  (SELECT COUNT(*) FROM sniping_mouse_group_members WHERE group_id = g.id) as mouse_count,
                  g.enabled, g.archived
           FROM sniping_mouse_groups g ${groupWhere}
         ) combined
         ORDER BY combined.name LIMIT ? OFFSET ?`
      )
      .all(...mouseParams, ...groupParams, limit, offset) as MouseOrGroupRow[];
  } else {
    // Tier filter active – mice only, still include aliases
    rows = db
      .prepare(
        `SELECT DISTINCT mt.id, mt.type, mt.name, mt.abbreviated_name, mt.thumbnail,
                mt.global_tier, mt.created_at, 0 as is_group,
                (SELECT GROUP_CONCAT(ma2.alias, ', ') FROM mouse_aliases ma2 WHERE ma2.mouse_type_id = mt.id) as aliases_str,
                NULL as mouse_count, NULL as enabled, NULL as archived
         ${mouseFromClause} ${mouseWhere}
         ORDER BY mt.name LIMIT ? OFFSET ?`
      )
      .all(...mouseParams, limit, offset) as MouseOrGroupRow[];
  }

  return { mice: rows, total };
}

/** Paginated mouse list with optional search (includes alias matching). Includes sniping groups. */
export function listMicePaged(params: {
  offset: number;
  limit: number;
  search?: string;
}): { mice: MouseOrGroupRow[]; hasMore: boolean } {
  const db = getDb();
  const { offset, limit, search } = params;

  const fetchLimit = limit + 1; // Fetch one extra to detect hasMore

  let rows: MouseOrGroupRow[];
  if (search) {
    const like = `%${search}%`;
    rows = db
      .prepare(
        `SELECT * FROM (
           SELECT DISTINCT mt.id, mt.type, mt.name, mt.abbreviated_name, mt.thumbnail,
                  mt.global_tier, mt.created_at, 0 as is_group
           FROM mouse_types mt
           LEFT JOIN mouse_aliases ma ON ma.mouse_type_id = mt.id
           WHERE mt.name LIKE ? OR mt.abbreviated_name LIKE ? OR mt.type LIKE ?
             OR ma.alias LIKE ?
           UNION ALL
           SELECT g.id, '' as type, g.name, '' as abbreviated_name, NULL as thumbnail,
                  NULL as global_tier, g.created_at, 1 as is_group
           FROM sniping_mouse_groups g
           WHERE g.enabled = 1 AND g.archived = 0 AND g.name LIKE ?
         ) combined
         ORDER BY combined.name LIMIT ? OFFSET ?`
      )
      .all(like, like, like, like, like, fetchLimit, offset) as MouseOrGroupRow[];
  } else {
    rows = db
      .prepare(
        `SELECT * FROM (
           SELECT mt.id, mt.type, mt.name, mt.abbreviated_name, mt.thumbnail,
                  mt.global_tier, mt.created_at, 0 as is_group
           FROM mouse_types mt
           UNION ALL
           SELECT g.id, '' as type, g.name, '' as abbreviated_name, NULL as thumbnail,
                  NULL as global_tier, g.created_at, 1 as is_group
           FROM sniping_mouse_groups g
           WHERE g.enabled = 1 AND g.archived = 0
         ) combined
         ORDER BY combined.name LIMIT ? OFFSET ?`
      )
      .all(fetchLimit, offset) as MouseOrGroupRow[];
  }

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  return { mice: rows, hasMore };
}

/** Insert or update a mouse type. */
export function upsertMouseType(params: {
  id: number;
  type: string;
  name: string;
  abbreviatedName: string;
  thumbnail: string | null;
}): MouseTypeRow {
  return getDb()
    .prepare(
      `INSERT INTO mouse_types (id, type, name, abbreviated_name, thumbnail)
       VALUES (@id, @type, @name, @abbreviatedName, @thumbnail)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         name = excluded.name,
         abbreviated_name = excluded.abbreviated_name,
         thumbnail = excluded.thumbnail
       RETURNING *`
    )
    .get(params) as MouseTypeRow;
}

/** Set the global tier for a mouse type. */
export function setMouseGlobalTier(id: number, tier: MouseTier | null): void {
  getDb()
    .prepare("UPDATE mouse_types SET global_tier = ? WHERE id = ?")
    .run(tier, id);
}

/** Find the per-map-type tier override for a mouse. */
export function findMouseMapTier(
  mouseTypeId: number,
  mapTypeId: number
): MouseMapTierRow | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM mouse_map_tiers WHERE mouse_type_id = ? AND map_type_id = ?"
    )
    .get(mouseTypeId, mapTypeId) as MouseMapTierRow | undefined;
}

/** Find all per-map-type tier overrides for a mouse. */
export function findMouseMapTiersByMouseId(mouseTypeId: number): MouseMapTierRow[] {
  return getDb()
    .prepare("SELECT * FROM mouse_map_tiers WHERE mouse_type_id = ?")
    .all(mouseTypeId) as MouseMapTierRow[];
}

/** Mouse tier with full mouse info for map-centric view. */
export interface MouseTierWithInfo {
  mouseTypeId: number;
  mouseType: string;
  mouseName: string;
  mouseThumbnail: string | null;
  globalTier: string | null;
  mapTier: string;
}

/** Find all mouse tier overrides for a specific map type, including mouse info. */
export function findMouseTiersByMapTypeId(mapTypeId: number): MouseTierWithInfo[] {
  return getDb()
    .prepare(
      `SELECT
         mmt.mouse_type_id as mouseTypeId,
         mt.type as mouseType,
         mt.name as mouseName,
         mt.thumbnail as mouseThumbnail,
         mt.global_tier as globalTier,
         mmt.tier as mapTier
       FROM mouse_map_tiers mmt
       JOIN mouse_types mt ON mt.id = mmt.mouse_type_id
       WHERE mmt.map_type_id = ?
       ORDER BY mt.name`
    )
    .all(mapTypeId) as MouseTierWithInfo[];
}

/** Set or update a per-map-type tier override. */
export function upsertMouseMapTier(
  mouseTypeId: number,
  mapTypeId: number,
  tier: MouseTier
): void {
  getDb()
    .prepare(
      `INSERT INTO mouse_map_tiers (mouse_type_id, map_type_id, tier)
       VALUES (?, ?, ?)
       ON CONFLICT(mouse_type_id, map_type_id) DO UPDATE SET tier = excluded.tier`
    )
    .run(mouseTypeId, mapTypeId, tier);
}

/** Remove a per-map-type tier override. */
export function deleteMouseMapTier(mouseTypeId: number, mapTypeId: number): void {
  getDb()
    .prepare(
      "DELETE FROM mouse_map_tiers WHERE mouse_type_id = ? AND map_type_id = ?"
    )
    .run(mouseTypeId, mapTypeId);
}

/**
 * Resolve the effective tier for a mouse on a specific map type.
 * Priority: map-specific override > global tier > default 'B'
 */
export function resolveMouseTier(
  mouseTypeId: number,
  mapTypeId: number
): MouseTier {
  // Check for map-specific override
  const mapTier = findMouseMapTier(mouseTypeId, mapTypeId);
  if (mapTier) {
    return mapTier.tier as MouseTier;
  }

  // Check global tier
  const mouse = findMouseTypeById(mouseTypeId);
  if (mouse?.global_tier) {
    return mouse.global_tier as MouseTier;
  }

  // Default to B
  return "B";
}

/**
 * Batch resolve tiers for multiple mice on a specific map type.
 * Returns a map of mouseId -> tier.
 */
export function resolveMouseTiers(
  mouseTypeIds: number[],
  mapTypeId: number
): Map<number, MouseTier> {
  const result = new Map<number, MouseTier>();

  if (mouseTypeIds.length === 0) {
    return result;
  }

  const db = getDb();

  // Get all map-specific overrides for these mice
  const placeholders = mouseTypeIds.map(() => "?").join(",");
  const mapTiers = db
    .prepare(
      `SELECT mouse_type_id, tier FROM mouse_map_tiers
       WHERE map_type_id = ? AND mouse_type_id IN (${placeholders})`
    )
    .all(mapTypeId, ...mouseTypeIds) as { mouse_type_id: number; tier: string }[];

  const mapTierMap = new Map(mapTiers.map((r) => [r.mouse_type_id, r.tier as MouseTier]));

  // Get global tiers for mice without map-specific overrides
  const needGlobal = mouseTypeIds.filter((id) => !mapTierMap.has(id));
  const globalTierMap = new Map<number, MouseTier | null>();

  if (needGlobal.length > 0) {
    const globalPlaceholders = needGlobal.map(() => "?").join(",");
    const globalTiers = db
      .prepare(
        `SELECT id, global_tier FROM mouse_types WHERE id IN (${globalPlaceholders})`
      )
      .all(...needGlobal) as { id: number; global_tier: string | null }[];

    for (const row of globalTiers) {
      globalTierMap.set(row.id, row.global_tier as MouseTier | null);
    }
  }

  // Build result
  for (const mouseId of mouseTypeIds) {
    const mapTier = mapTierMap.get(mouseId);
    if (mapTier) {
      result.set(mouseId, mapTier);
    } else {
      const globalTier = globalTierMap.get(mouseId);
      result.set(mouseId, globalTier ?? "B");
    }
  }

  return result;
}

/**
 * Calculate the overall tier for an order based on remaining mice.
 * - All S → S
 * - Any B → B
 * - Otherwise → A
 */
export function calculateOrderTier(tiers: MouseTier[]): MouseTier {
  if (tiers.length === 0) {
    return "B"; // No mice = conservative default
  }

  const hasB = tiers.includes("B");
  if (hasB) {
    return "B";
  }

  const allS = tiers.every((t) => t === "S");
  if (allS) {
    return "S";
  }

  return "A";
}
