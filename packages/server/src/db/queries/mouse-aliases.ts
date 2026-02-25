import { getDb } from "../connection.js";

export interface MouseAliasRow {
  id: number;
  mouse_type_id: number;
  alias: string;
  source: string | null;
}

/** Get all aliases for a specific mouse. */
export function getAliasesForMouse(mouseTypeId: number): MouseAliasRow[] {
  return getDb()
    .prepare("SELECT * FROM mouse_aliases WHERE mouse_type_id = ? ORDER BY alias")
    .all(mouseTypeId) as MouseAliasRow[];
}

/** Add an alias for a mouse. Returns the inserted row or null if duplicate. */
export function addMouseAlias(
  mouseTypeId: number,
  alias: string,
  source: string = "manual"
): MouseAliasRow | null {
  const result = getDb()
    .prepare(
      `INSERT OR IGNORE INTO mouse_aliases (mouse_type_id, alias, source)
       VALUES (?, ?, ?)
       RETURNING *`
    )
    .get(mouseTypeId, alias.trim(), source) as MouseAliasRow | undefined;
  return result ?? null;
}

/** Delete a mouse alias by its id. */
export function deleteMouseAlias(aliasId: number): boolean {
  const result = getDb()
    .prepare("DELETE FROM mouse_aliases WHERE id = ?")
    .run(aliasId);
  return result.changes > 0;
}

/** Update an alias's text. Returns the updated row or null if not found / duplicate. */
export function updateMouseAlias(
  aliasId: number,
  newAlias: string
): MouseAliasRow | null {
  const result = getDb()
    .prepare(
      `UPDATE mouse_aliases SET alias = ? WHERE id = ?
       RETURNING *`
    )
    .get(newAlias.trim(), aliasId) as MouseAliasRow | undefined;
  return result ?? null;
}