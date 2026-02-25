import { getDb } from "../connection.js";

export function getSyncCounts(): { maps: number; scrolls: number; items: number; mice: number; ranks: number; environments: number } {
  const db = getDb();
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }).cnt;
  return {
    maps: count("map_types"),
    scrolls: count("scrolls"),
    items: count("item_types"),
    mice: count("mouse_types"),
    ranks: count("ranks"),
    environments: count("environments"),
  };
}
