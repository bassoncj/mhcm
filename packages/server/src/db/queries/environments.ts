import { getDb } from "../connection.js";

export interface EnvironmentRow {
  id: number;
  type: string;
  name: string;
}

export function searchEnvironments(query: string, limit = 20): EnvironmentRow[] {
  const like = `%${query}%`;
  return getDb()
    .prepare(
      `SELECT id, type, name FROM environments
       WHERE name LIKE ? OR type LIKE ?
       ORDER BY name LIMIT ?`
    )
    .all(like, like, limit) as EnvironmentRow[];
}

export function findEnvironmentByType(type: string): EnvironmentRow | undefined {
  return getDb()
    .prepare("SELECT id, type, name FROM environments WHERE type = ?")
    .get(type) as EnvironmentRow | undefined;
}
