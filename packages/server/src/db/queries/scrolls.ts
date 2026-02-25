import { getDb } from "../connection.js";

export interface ScrollRow {
  id: number;
  type: string;
  name: string;
  thumbnail: string | null;
}

/** Get a single scroll by numeric ID. */
export function findScrollById(id: number): ScrollRow | undefined {
  return getDb()
    .prepare("SELECT * FROM scrolls WHERE id = ?")
    .get(id) as ScrollRow | undefined;
}

/** Get a single scroll by game API type (e.g. "standard_treasure_map_scroll_case_stat_item"). */
export function findScrollByType(type: string): ScrollRow | undefined {
  return getDb()
    .prepare("SELECT * FROM scrolls WHERE type = ?")
    .get(type) as ScrollRow | undefined;
}

/** Get all scrolls ordered by name. */
export function findAllScrolls(): ScrollRow[] {
  return getDb()
    .prepare("SELECT * FROM scrolls ORDER BY name")
    .all() as ScrollRow[];
}

/** Search scrolls by name (partial match, case-insensitive). */
export function searchScrolls(query: string): ScrollRow[] {
  const like = `%${query}%`;
  return getDb()
    .prepare(
      `SELECT * FROM scrolls
       WHERE name LIKE ?
       ORDER BY name`
    )
    .all(like) as ScrollRow[];
}
