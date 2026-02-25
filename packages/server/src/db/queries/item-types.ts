import { getDb } from "../connection.js";

export interface ItemTypeRow {
  id: number;
  type: string;
  name: string;
  classification: string;
  thumbnail: string | null;
  alias: string | null;
  global_tier: string | null;
  is_tradable: number;
  system_hidden: number;
  enabled: number;
  always_warn: number;
  created_at: string;
}

/** Row shape for mixed item/group results (mirrors MouseOrGroupRow). */
export interface ItemOrGroupRow extends ItemTypeRow {
  is_group?: number;
  item_count?: number;
  archived?: number;
}

export interface ItemMapTierRow {
  item_type_id: number;
  map_type_id: number;
  tier: string;
  created_at: string;
}

export function findItemTypeById(id: number): ItemTypeRow | undefined {
  return getDb()
    .prepare("SELECT * FROM item_types WHERE id = ?")
    .get(id) as ItemTypeRow | undefined;
}

export function findItemTypeBySlug(type: string): ItemTypeRow | undefined {
  return getDb()
    .prepare("SELECT * FROM item_types WHERE type = ?")
    .get(type) as ItemTypeRow | undefined;
}

export function findAllItemTypes(): ItemTypeRow[] {
  return getDb()
    .prepare("SELECT * FROM item_types ORDER BY name")
    .all() as ItemTypeRow[];
}

export function findEnabledItemTypes(): ItemTypeRow[] {
  return getDb()
    .prepare("SELECT * FROM item_types WHERE enabled = 1 AND is_tradable = 1 ORDER BY name")
    .all() as ItemTypeRow[];
}

export function findEnabledItemTypesAll(): ItemTypeRow[] {
  return getDb()
    .prepare("SELECT * FROM item_types WHERE enabled = 1 ORDER BY name")
    .all() as ItemTypeRow[];
}

export function getDistinctClassifications(showHidden: boolean = true): string[] {
  const sql = showHidden
    ? "SELECT DISTINCT classification FROM item_types ORDER BY classification"
    : "SELECT DISTINCT classification FROM item_types WHERE system_hidden = 0 ORDER BY classification";
  const rows = getDb().prepare(sql).all() as { classification: string }[];
  return rows.map((r) => r.classification);
}

/**
 * Search item types by name or alias (partial match, case-insensitive).
 * Optionally filter by one or more classifications.
 */
export function searchItemTypes(
  query: string,
  classifications?: string[],
  limit = 50
): ItemTypeRow[] {
  const like = `%${query}%`;

  if (classifications && classifications.length > 0) {
    const placeholders = classifications.map(() => "?").join(", ");
    return getDb()
      .prepare(
        `SELECT * FROM item_types
         WHERE (name LIKE ? OR alias LIKE ?)
           AND classification IN (${placeholders})
         ORDER BY name LIMIT ?`
      )
      .all(like, like, ...classifications, limit) as ItemTypeRow[];
  }

  return getDb()
    .prepare(
      `SELECT * FROM item_types
       WHERE name LIKE ? OR alias LIKE ?
       ORDER BY name LIMIT ?`
    )
    .all(like, like, limit) as ItemTypeRow[];
}

export function setItemTypeEnabled(id: number, enabled: boolean): void {
  getDb()
    .prepare("UPDATE item_types SET enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, id);
}

export function setItemTypeAlias(id: number, alias: string | null): void {
  getDb()
    .prepare("UPDATE item_types SET alias = ? WHERE id = ?")
    .run(alias, id);
}

export function setItemTypeThumbnail(id: number, thumbnail: string | null): void {
  getDb()
    .prepare("UPDATE item_types SET thumbnail = ? WHERE id = ?")
    .run(thumbnail, id);
}

export interface ItemTypePagedResult {
  items: ItemTypeRow[];
  total: number;
}

/**
 * Paginated item type list for the admin/mod panel.
 * Supports search (name + alias) and classification filter.
 */
export function listItemTypesPaged(
  search: string | null,
  classifications: string[] | null,
  offset: number,
  limit: number,
  showHidden: boolean = false
): ItemTypePagedResult {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (!showHidden) {
    conditions.push("it.system_hidden = 0");
  }

  if (search) {
    const like = `%${search}%`;
    conditions.push("(it.name LIKE ? OR it.alias LIKE ?)");
    params.push(like, like);
  }

  if (classifications && classifications.length > 0) {
    const placeholders = classifications.map(() => "?").join(", ");
    conditions.push(`it.classification IN (${placeholders})`);
    params.push(...classifications);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = getDb()
    .prepare(`SELECT COUNT(*) as cnt FROM item_types it ${where}`)
    .get(...params) as { cnt: number };

  const items = getDb()
    .prepare(
      `SELECT it.* FROM item_types it ${where}
       ORDER BY it.name
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as ItemTypeRow[];

  return { items, total: countRow.cnt };
}

export function findItemTypeByType(type: string): ItemTypeRow | undefined {
  return findItemTypeBySlug(type);
}

/** Paginated item list with optional search. Includes sniping item groups (player-facing selector). */
export function listItemsPaged(params: {
  offset: number;
  limit: number;
  search?: string;
}): { items: ItemOrGroupRow[]; hasMore: boolean } {
  const db = getDb();
  const { offset, limit, search } = params;

  const fetchLimit = limit + 1;

  let rows: ItemOrGroupRow[];
  if (search) {
    const like = `%${search}%`;
    rows = db
      .prepare(
        `SELECT * FROM (
           SELECT it.id, it.type, it.name, it.classification, it.thumbnail,
                  it.alias, it.global_tier, it.is_tradable, it.system_hidden,
                  it.enabled, it.always_warn, it.created_at, 0 as is_group,
                  NULL as item_count, NULL as archived
           FROM item_types it
           WHERE it.enabled = 1 AND it.is_tradable = 1
             AND (it.name LIKE ? OR it.alias LIKE ?)
           UNION ALL
           SELECT g.id, '' as type, g.name, '' as classification, NULL as thumbnail,
                  NULL as alias, NULL as global_tier, 0 as is_tradable, 0 as system_hidden,
                  g.enabled, 0 as always_warn, g.created_at, 1 as is_group,
                  (SELECT COUNT(*) FROM sniping_item_group_members WHERE group_id = g.id) as item_count,
                  g.archived
           FROM sniping_item_groups g
           WHERE g.enabled = 1 AND g.archived = 0 AND g.name LIKE ?
         ) combined
         ORDER BY combined.name LIMIT ? OFFSET ?`
      )
      .all(like, like, like, fetchLimit, offset) as ItemOrGroupRow[];
  } else {
    rows = db
      .prepare(
        `SELECT * FROM (
           SELECT it.id, it.type, it.name, it.classification, it.thumbnail,
                  it.alias, it.global_tier, it.is_tradable, it.system_hidden,
                  it.enabled, it.always_warn, it.created_at, 0 as is_group,
                  NULL as item_count, NULL as archived
           FROM item_types it
           WHERE it.enabled = 1 AND it.is_tradable = 1
           UNION ALL
           SELECT g.id, '' as type, g.name, '' as classification, NULL as thumbnail,
                  NULL as alias, NULL as global_tier, 0 as is_tradable, 0 as system_hidden,
                  g.enabled, 0 as always_warn, g.created_at, 1 as is_group,
                  (SELECT COUNT(*) FROM sniping_item_group_members WHERE group_id = g.id) as item_count,
                  g.archived
           FROM sniping_item_groups g
           WHERE g.enabled = 1 AND g.archived = 0
         ) combined
         ORDER BY combined.name LIMIT ? OFFSET ?`
      )
      .all(fetchLimit, offset) as ItemOrGroupRow[];
  }

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  return { items: rows, hasMore };
}

/**
 * Mixed item+group list for mod panel with tier/classification filters.
 * Mirrors listMouseTypes for mice.
 */
export function listItemTypesMixed(params: {
  search?: string;
  tierFilter?: "S" | "A" | "B" | "unset" | null;
  limit?: number;
  offset?: number;
  includeArchivedGroups?: boolean;
  groupsOnly?: boolean;
  classifications?: string[] | null;
  showHidden?: boolean;
}): { items: ItemOrGroupRow[]; total: number } {
  const db = getDb();
  const {
    search,
    tierFilter,
    limit = 50,
    offset = 0,
    includeArchivedGroups = false,
    groupsOnly = false,
    classifications,
    showHidden = false,
  } = params;

  // When filtering by tier, only show items (groups have no tier concept)
  // When groupsOnly, only show groups
  const includeGroups = groupsOnly || !tierFilter;

  // --- Item portion ---
  let itemWhere = "WHERE 1=1";
  const itemParams: any[] = [];

  if (!showHidden) {
    itemWhere += " AND it.system_hidden = 0";
  }

  if (search) {
    const like = `%${search}%`;
    itemWhere += " AND (it.name LIKE ? OR it.alias LIKE ?)";
    itemParams.push(like, like);
  }

  if (tierFilter === "unset") {
    itemWhere += " AND it.global_tier IS NULL";
  } else if (tierFilter) {
    itemWhere += " AND it.global_tier = ?";
    itemParams.push(tierFilter);
  }

  if (classifications && classifications.length > 0) {
    const placeholders = classifications.map(() => "?").join(", ");
    itemWhere += ` AND it.classification IN (${placeholders})`;
    itemParams.push(...classifications);
  }

  // Item count (skip when groupsOnly)
  const itemCount = groupsOnly ? 0 : (db
    .prepare(`SELECT COUNT(*) as count FROM item_types it ${itemWhere}`)
    .get(...itemParams) as { count: number }).count;

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
      .prepare(`SELECT COUNT(*) as count FROM sniping_item_groups g ${groupWhere}`)
      .get(...groupParams) as { count: number }).count;
  }

  const total = itemCount + groupCount;

  // --- Combined query via UNION ALL ---
  let rows: ItemOrGroupRow[];
  if (groupsOnly) {
    rows = db
      .prepare(
        `SELECT g.id, '' as type, g.name, '' as classification, NULL as thumbnail,
                NULL as alias, NULL as global_tier, 0 as is_tradable, 0 as system_hidden,
                g.enabled, 0 as always_warn, g.created_at, 1 as is_group,
                (SELECT COUNT(*) FROM sniping_item_group_members WHERE group_id = g.id) as item_count,
                g.archived
         FROM sniping_item_groups g ${groupWhere}
         ORDER BY g.name LIMIT ? OFFSET ?`
      )
      .all(...groupParams, limit, offset) as ItemOrGroupRow[];
  } else if (includeGroups) {
    rows = db
      .prepare(
        `SELECT * FROM (
           SELECT it.id, it.type, it.name, it.classification, it.thumbnail,
                  it.alias, it.global_tier, it.is_tradable, it.system_hidden,
                  it.enabled, it.always_warn, it.created_at, 0 as is_group,
                  NULL as item_count, NULL as archived
           FROM item_types it ${itemWhere}
           UNION ALL
           SELECT g.id, '' as type, g.name, '' as classification, NULL as thumbnail,
                  NULL as alias, NULL as global_tier, 0 as is_tradable, 0 as system_hidden,
                  g.enabled, 0 as always_warn, g.created_at, 1 as is_group,
                  (SELECT COUNT(*) FROM sniping_item_group_members WHERE group_id = g.id) as item_count,
                  g.archived
           FROM sniping_item_groups g ${groupWhere}
         ) combined
         ORDER BY combined.name LIMIT ? OFFSET ?`
      )
      .all(...itemParams, ...groupParams, limit, offset) as ItemOrGroupRow[];
  } else {
    // Tier filter active – items only
    rows = db
      .prepare(
        `SELECT it.id, it.type, it.name, it.classification, it.thumbnail,
                it.alias, it.global_tier, it.is_tradable, it.system_hidden,
                it.enabled, it.always_warn, it.created_at, 0 as is_group,
                NULL as item_count, NULL as archived
         FROM item_types it ${itemWhere}
         ORDER BY it.name LIMIT ? OFFSET ?`
      )
      .all(...itemParams, limit, offset) as ItemOrGroupRow[];
  }

  return { items: rows, total };
}

export function setItemGlobalTier(id: number, tier: "S" | "A" | "B" | null): void {
  getDb()
    .prepare("UPDATE item_types SET global_tier = ? WHERE id = ?")
    .run(tier, id);
}

export function findItemMapTier(
  itemTypeId: number,
  mapTypeId: number
): ItemMapTierRow | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM item_map_tiers WHERE item_type_id = ? AND map_type_id = ?"
    )
    .get(itemTypeId, mapTypeId) as ItemMapTierRow | undefined;
}

export function findItemMapTiersByItemId(itemTypeId: number): ItemMapTierRow[] {
  return getDb()
    .prepare("SELECT * FROM item_map_tiers WHERE item_type_id = ?")
    .all(itemTypeId) as ItemMapTierRow[];
}

export interface ItemTierWithInfo {
  itemTypeId: number;
  itemType: string;
  itemName: string;
  itemThumbnail: string | null;
  globalTier: string | null;
  mapTier: string;
}

export function findItemTiersByMapTypeId(mapTypeId: number): ItemTierWithInfo[] {
  return getDb()
    .prepare(
      `SELECT
         imt.item_type_id as itemTypeId,
         it.type as itemType,
         it.name as itemName,
         it.thumbnail as itemThumbnail,
         it.global_tier as globalTier,
         imt.tier as mapTier
       FROM item_map_tiers imt
       JOIN item_types it ON it.id = imt.item_type_id
       WHERE imt.map_type_id = ?
       ORDER BY it.name`
    )
    .all(mapTypeId) as ItemTierWithInfo[];
}

export function upsertItemMapTier(
  itemTypeId: number,
  mapTypeId: number,
  tier: "S" | "A" | "B"
): void {
  getDb()
    .prepare(
      `INSERT INTO item_map_tiers (item_type_id, map_type_id, tier)
       VALUES (?, ?, ?)
       ON CONFLICT(item_type_id, map_type_id) DO UPDATE SET tier = excluded.tier`
    )
    .run(itemTypeId, mapTypeId, tier);
}

export function deleteItemMapTier(itemTypeId: number, mapTypeId: number): void {
  getDb()
    .prepare(
      "DELETE FROM item_map_tiers WHERE item_type_id = ? AND map_type_id = ?"
    )
    .run(itemTypeId, mapTypeId);
}

/**
 * Resolve the effective tier for an item on a specific map type.
 * Priority: map-specific override > global tier > default 'B'
 */
export function resolveItemTier(
  itemTypeId: number,
  mapTypeId: number
): "S" | "A" | "B" {
  const mapTier = findItemMapTier(itemTypeId, mapTypeId);
  if (mapTier) {
    return mapTier.tier as "S" | "A" | "B";
  }

  const item = findItemTypeById(itemTypeId);
  if (item?.global_tier) {
    return item.global_tier as "S" | "A" | "B";
  }

  return "B";
}

/**
 * Batch resolve tiers for multiple items on a specific map type.
 * Returns a map of itemId -> tier.
 */
export function resolveItemTiers(
  itemTypeIds: number[],
  mapTypeId: number
): Map<number, "S" | "A" | "B"> {
  const result = new Map<number, "S" | "A" | "B">();

  if (itemTypeIds.length === 0) {
    return result;
  }

  const db = getDb();

  // Get all map-specific overrides for these items
  const placeholders = itemTypeIds.map(() => "?").join(",");
  const mapTiers = db
    .prepare(
      `SELECT item_type_id, tier FROM item_map_tiers
       WHERE map_type_id = ? AND item_type_id IN (${placeholders})`
    )
    .all(mapTypeId, ...itemTypeIds) as { item_type_id: number; tier: string }[];

  const mapTierMap = new Map(mapTiers.map((r) => [r.item_type_id, r.tier as "S" | "A" | "B"]));

  // Get global tiers for items without map-specific overrides
  const needGlobal = itemTypeIds.filter((id) => !mapTierMap.has(id));
  const globalTierMap = new Map<number, "S" | "A" | "B" | null>();

  if (needGlobal.length > 0) {
    const globalPlaceholders = needGlobal.map(() => "?").join(",");
    const globalTiers = db
      .prepare(
        `SELECT id, global_tier FROM item_types WHERE id IN (${globalPlaceholders})`
      )
      .all(...needGlobal) as { id: number; global_tier: string | null }[];

    for (const row of globalTiers) {
      globalTierMap.set(row.id, row.global_tier as "S" | "A" | "B" | null);
    }
  }

  // Build result
  for (const itemId of itemTypeIds) {
    const mapTier = mapTierMap.get(itemId);
    if (mapTier) {
      result.set(itemId, mapTier);
    } else {
      const globalTier = globalTierMap.get(itemId);
      result.set(itemId, globalTier ?? "B");
    }
  }

  return result;
}

export function setItemAlwaysWarn(itemTypeId: number, alwaysWarn: boolean): void {
  getDb()
    .prepare("UPDATE item_types SET always_warn = ? WHERE id = ?")
    .run(alwaysWarn ? 1 : 0, itemTypeId);
}

export function getItemRiskLocations(itemTypeId: number): Array<{ environment_type: string }> {
  return getDb()
    .prepare("SELECT environment_type FROM item_risk_locations WHERE item_type_id = ? ORDER BY environment_type")
    .all(itemTypeId) as Array<{ environment_type: string }>;
}

export function addItemRiskLocation(itemTypeId: number, environmentType: string): boolean {
  const result = getDb()
    .prepare(
      `INSERT OR IGNORE INTO item_risk_locations (item_type_id, environment_type)
       VALUES (?, ?)`
    )
    .run(itemTypeId, environmentType);
  return result.changes > 0;
}

export function removeItemRiskLocation(itemTypeId: number, environmentType: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM item_risk_locations WHERE item_type_id = ? AND environment_type = ?")
    .run(itemTypeId, environmentType);
  return result.changes > 0;
}

/**
 * Get item risk config for a set of item types (for risk check prompts).
 * Returns risk locations and always_warn for each item type slug.
 */
export function getItemRiskConfig(itemTypes: string[]): Array<{
  type: string;
  riskLocations: string[];
  alwaysWarn: boolean;
}> {
  if (itemTypes.length === 0) return [];
  const db = getDb();
  const placeholders = itemTypes.map(() => "?").join(",");

  const items = db
    .prepare(`SELECT id, type, always_warn FROM item_types WHERE type IN (${placeholders})`)
    .all(...itemTypes) as Array<{ id: number; type: string; always_warn: number }>;

  return items.map((item) => {
    const locs = db
      .prepare("SELECT environment_type FROM item_risk_locations WHERE item_type_id = ?")
      .all(item.id) as Array<{ environment_type: string }>;
    return {
      type: item.type,
      riskLocations: locs.map((l) => l.environment_type),
      alwaysWarn: item.always_warn === 1,
    };
  });
}
