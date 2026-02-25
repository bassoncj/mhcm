import { getDb } from "../connection.js";

export interface SnipingMouseGroupRow {
  id: number;
  name: string;
  enabled: number;
  archived: number;
  created_at: string;
}

export interface SnipingGroupMemberRow {
  mouse_type_id: number;
  name: string;
  thumbnail: string | null;
}

export function createSnipingMouseGroup(
  name: string,
  mouseTypeIds: number[]
): SnipingMouseGroupRow {
  const db = getDb();

  return db.transaction(() => {
    const group = db
      .prepare(
        "INSERT INTO sniping_mouse_groups (name) VALUES (?) RETURNING *"
      )
      .get(name) as SnipingMouseGroupRow;

    const insertMember = db.prepare(
      "INSERT INTO sniping_mouse_group_members (group_id, mouse_type_id) VALUES (?, ?)"
    );
    for (const mouseTypeId of mouseTypeIds) {
      insertMember.run(group.id, mouseTypeId);
    }

    return group;
  })();
}

export function findSnipingGroupById(id: number): SnipingMouseGroupRow | undefined {
  return getDb()
    .prepare("SELECT * FROM sniping_mouse_groups WHERE id = ?")
    .get(id) as SnipingMouseGroupRow | undefined;
}

export function findSnipingGroupMembers(groupId: number): SnipingGroupMemberRow[] {
  return getDb()
    .prepare(
      `SELECT mt.id as mouse_type_id, mt.name, mt.thumbnail
       FROM sniping_mouse_group_members gm
       JOIN mouse_types mt ON mt.id = gm.mouse_type_id
       WHERE gm.group_id = ?
       ORDER BY mt.name`
    )
    .all(groupId) as SnipingGroupMemberRow[];
}

export function findGroupsContainingMouse(
  mouseTypeId: number
): Array<{ groupId: number; groupName: string }> {
  return getDb()
    .prepare(
      `SELECT g.id as groupId, g.name as groupName
       FROM sniping_mouse_groups g
       JOIN sniping_mouse_group_members gm ON gm.group_id = g.id
       WHERE gm.mouse_type_id = ? AND g.enabled = 1 AND g.archived = 0
       ORDER BY g.name`
    )
    .all(mouseTypeId) as Array<{ groupId: number; groupName: string }>;
}

/** Find groups where ALL member mice are present in the given set. */
export function findQualifyingGroups(
  mouseTypeIds: number[]
): Array<{ group: SnipingMouseGroupRow; members: SnipingGroupMemberRow[] }> {
  if (mouseTypeIds.length === 0) return [];

  const db = getDb();
  const placeholders = mouseTypeIds.map(() => "?").join(",");

  // Find groups where every member is in the provided set
  const groups = db
    .prepare(
      `SELECT g.*
       FROM sniping_mouse_groups g
       WHERE g.enabled = 1 AND g.archived = 0
         AND (SELECT COUNT(*) FROM sniping_mouse_group_members gm WHERE gm.group_id = g.id)
           = (SELECT COUNT(*) FROM sniping_mouse_group_members gm
              WHERE gm.group_id = g.id AND gm.mouse_type_id IN (${placeholders}))
       ORDER BY g.name`
    )
    .all(...mouseTypeIds) as SnipingMouseGroupRow[];

  // Look up members for each qualifying group
  return groups.map((group) => ({
    group,
    members: findSnipingGroupMembers(group.id),
  }));
}

export function listSnipingGroups(params: {
  includeArchived?: boolean;
  search?: string;
}): SnipingMouseGroupRow[] {
  const db = getDb();
  const { includeArchived = false, search } = params;

  let whereClause = "WHERE 1=1";
  const queryParams: any[] = [];

  if (!includeArchived) {
    whereClause += " AND archived = 0";
  }

  if (search) {
    whereClause += " AND name LIKE ?";
    queryParams.push(`%${search}%`);
  }

  return db
    .prepare(`SELECT * FROM sniping_mouse_groups ${whereClause} ORDER BY name`)
    .all(...queryParams) as SnipingMouseGroupRow[];
}

export function searchSnipingGroups(query: string, limit = 20): SnipingMouseGroupRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM sniping_mouse_groups
       WHERE enabled = 1 AND archived = 0 AND name LIKE ?
       ORDER BY name LIMIT ?`
    )
    .all(`%${query}%`, limit) as SnipingMouseGroupRow[];
}

export function getGroupMemberThumbnails(groupId: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT mt.thumbnail
       FROM sniping_mouse_group_members gm
       JOIN mouse_types mt ON mt.id = gm.mouse_type_id
       WHERE gm.group_id = ? AND mt.thumbnail IS NOT NULL
       ORDER BY mt.name`
    )
    .all(groupId) as { thumbnail: string }[];
  return rows.map((r) => r.thumbnail);
}

export function setGroupEnabled(groupId: number, enabled: boolean): void {
  getDb()
    .prepare("UPDATE sniping_mouse_groups SET enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, groupId);
}

export function setGroupArchived(groupId: number, archived: boolean): void {
  getDb()
    .prepare("UPDATE sniping_mouse_groups SET archived = ? WHERE id = ?")
    .run(archived ? 1 : 0, groupId);
}

export interface SnipingItemGroupRow {
  id: number;
  name: string;
  enabled: number;
  archived: number;
  created_at: string;
}

export interface SnipingItemGroupMemberRow {
  item_type_id: number;
  name: string;
  thumbnail: string | null;
}

export function createSnipingItemGroup(
  name: string,
  itemTypeIds: number[]
): SnipingItemGroupRow {
  const db = getDb();

  return db.transaction(() => {
    const group = db
      .prepare(
        "INSERT INTO sniping_item_groups (name) VALUES (?) RETURNING *"
      )
      .get(name) as SnipingItemGroupRow;

    const insertMember = db.prepare(
      "INSERT INTO sniping_item_group_members (group_id, item_type_id) VALUES (?, ?)"
    );
    for (const itemTypeId of itemTypeIds) {
      insertMember.run(group.id, itemTypeId);
    }

    return group;
  })();
}

export function findSnipingItemGroupById(id: number): SnipingItemGroupRow | undefined {
  return getDb()
    .prepare("SELECT * FROM sniping_item_groups WHERE id = ?")
    .get(id) as SnipingItemGroupRow | undefined;
}

export function findSnipingItemGroupMembers(groupId: number): SnipingItemGroupMemberRow[] {
  return getDb()
    .prepare(
      `SELECT it.id as item_type_id, it.name, it.thumbnail
       FROM sniping_item_group_members gm
       JOIN item_types it ON it.id = gm.item_type_id
       WHERE gm.group_id = ?
       ORDER BY it.name`
    )
    .all(groupId) as SnipingItemGroupMemberRow[];
}

export function findItemGroupsContainingItem(
  itemTypeId: number
): Array<{ groupId: number; groupName: string }> {
  return getDb()
    .prepare(
      `SELECT g.id as groupId, g.name as groupName
       FROM sniping_item_groups g
       JOIN sniping_item_group_members gm ON gm.group_id = g.id
       WHERE gm.item_type_id = ? AND g.enabled = 1 AND g.archived = 0
       ORDER BY g.name`
    )
    .all(itemTypeId) as Array<{ groupId: number; groupName: string }>;
}

export function findQualifyingItemGroups(
  itemTypeIds: number[]
): Array<{ group: SnipingItemGroupRow; members: SnipingItemGroupMemberRow[] }> {
  if (itemTypeIds.length === 0) return [];

  const db = getDb();
  const placeholders = itemTypeIds.map(() => "?").join(",");

  const groups = db
    .prepare(
      `SELECT g.*
       FROM sniping_item_groups g
       WHERE g.enabled = 1 AND g.archived = 0
         AND (SELECT COUNT(*) FROM sniping_item_group_members gm WHERE gm.group_id = g.id)
           = (SELECT COUNT(*) FROM sniping_item_group_members gm
              WHERE gm.group_id = g.id AND gm.item_type_id IN (${placeholders}))
       ORDER BY g.name`
    )
    .all(...itemTypeIds) as SnipingItemGroupRow[];

  return groups.map((group) => ({
    group,
    members: findSnipingItemGroupMembers(group.id),
  }));
}

export function listSnipingItemGroups(params: {
  includeArchived?: boolean;
  search?: string;
}): SnipingItemGroupRow[] {
  const db = getDb();
  const { includeArchived = false, search } = params;

  let whereClause = "WHERE 1=1";
  const queryParams: any[] = [];

  if (!includeArchived) {
    whereClause += " AND archived = 0";
  }

  if (search) {
    whereClause += " AND name LIKE ?";
    queryParams.push(`%${search}%`);
  }

  return db
    .prepare(`SELECT * FROM sniping_item_groups ${whereClause} ORDER BY name`)
    .all(...queryParams) as SnipingItemGroupRow[];
}

export function searchSnipingItemGroups(query: string, limit = 20): SnipingItemGroupRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM sniping_item_groups
       WHERE enabled = 1 AND archived = 0 AND name LIKE ?
       ORDER BY name LIMIT ?`
    )
    .all(`%${query}%`, limit) as SnipingItemGroupRow[];
}

export function getItemGroupMemberThumbnails(groupId: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT it.thumbnail
       FROM sniping_item_group_members gm
       JOIN item_types it ON it.id = gm.item_type_id
       WHERE gm.group_id = ? AND it.thumbnail IS NOT NULL
       ORDER BY it.name`
    )
    .all(groupId) as { thumbnail: string }[];
  return rows.map((r) => r.thumbnail);
}

export function setItemGroupEnabled(groupId: number, enabled: boolean): void {
  getDb()
    .prepare("UPDATE sniping_item_groups SET enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, groupId);
}

export function setItemGroupArchived(groupId: number, archived: boolean): void {
  getDb()
    .prepare("UPDATE sniping_item_groups SET archived = ? WHERE id = ?")
    .run(archived ? 1 : 0, groupId);
}

/** Check if any orders, transactions, or price history reference this mouse group. */
export function hasMouseGroupReferences(groupId: number): boolean {
  const db = getDb();
  const checks = [
    db.prepare("SELECT 1 FROM sniping_orders WHERE mouse_group_id = ? LIMIT 1").get(groupId),
    db.prepare("SELECT 1 FROM sniping_transactions WHERE mouse_group_id = ? LIMIT 1").get(groupId),
    db.prepare("SELECT 1 FROM sniping_group_price_history WHERE group_id = ? LIMIT 1").get(groupId),
  ];
  return checks.some((row) => row != null);
}

/** Check if any orders, transactions, or price history reference this item group. */
export function hasItemGroupReferences(groupId: number): boolean {
  const db = getDb();
  const checks = [
    db.prepare("SELECT 1 FROM sniping_orders WHERE item_group_id = ? LIMIT 1").get(groupId),
    db.prepare("SELECT 1 FROM sniping_transactions WHERE item_group_id = ? LIMIT 1").get(groupId),
    db.prepare("SELECT 1 FROM sniping_item_group_price_history WHERE item_group_id = ? LIMIT 1").get(groupId),
  ];
  return checks.some((row) => row != null);
}

/** Hard-delete a mouse group and its members. Only call after hasMouseGroupReferences returns false. */
export function deleteSnipingMouseGroup(groupId: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM sniping_mouse_group_members WHERE group_id = ?").run(groupId);
    db.prepare("DELETE FROM sniping_mouse_groups WHERE id = ?").run(groupId);
  })();
}

/** Hard-delete an item group and its members. Only call after hasItemGroupReferences returns false. */
export function deleteSnipingItemGroup(groupId: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM sniping_item_group_members WHERE group_id = ?").run(groupId);
    db.prepare("DELETE FROM sniping_item_groups WHERE id = ?").run(groupId);
  })();
}
