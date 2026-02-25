import { getDb } from "../connection.js";

export interface RankRow {
  id: number;
  name: string;
  icon: string | null;
  large_image: string | null;
  num_title_locations: number;
  num_total_locations: number;
  created_at: string;
}

/**
 * Get all ranks, ordered by ID (which reflects rank progression).
 */
export function getAllRanks(): RankRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM ranks ORDER BY id ASC`)
    .all() as RankRow[];
}

/**
 * Get a specific rank by ID.
 */
export function findRankById(id: number): RankRow | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM ranks WHERE id = ?`)
    .get(id) as RankRow | undefined;
}

/**
 * Get a specific rank by name.
 */
export function findRankByName(name: string): RankRow | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM ranks WHERE name = ?`)
    .get(name) as RankRow | undefined;
}

/**
 * Find a rank by the MH API's min_title_name string.
 * Handles mismatches like "Baron" → "Baron/Baroness" by trying exact match
 * first, then prefix match (name starts with title before "/").
 */
export function findRankByTitleName(titleName: string): RankRow | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM ranks WHERE name = ? OR name LIKE ? || '/%'`)
    .get(titleName, titleName) as RankRow | undefined;
}
