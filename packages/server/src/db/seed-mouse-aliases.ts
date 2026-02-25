import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection.js";

interface AliasEntry {
  _section?: string;
  alias?: string;
  mouseType?: string | null;
  source?: string;
  note?: string;
  combo?: string[];
}

interface AliasFile {
  aliases: AliasEntry[];
}

function getSeedPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "../../seed/mouse-aliases.json");
}

/**
 * Seed mouse_aliases from JSON. Resolves mouseType strings to mouse_types.id.
 * Skips entries with null mouseType or unresolvable types.
 */
export function seedMouseAliases(): void {
  const seedPath = getSeedPath();
  if (!existsSync(seedPath)) {
    console.log("[seed-aliases] seed/mouse-aliases.json not found, skipping");
    return;
  }

  const db = getDb();

  let data: AliasFile;
  try {
    data = JSON.parse(readFileSync(seedPath, "utf-8"));
  } catch (err) {
    console.log(`[seed-aliases] failed to parse mouse-aliases.json: ${err}`);
    return;
  }

  const resolveType = db.prepare(
    "SELECT id FROM mouse_types WHERE type = ?"
  );

  const insert = db.prepare(
    `INSERT OR IGNORE INTO mouse_aliases (mouse_type_id, alias, source)
     VALUES (?, ?, ?)`
  );

  const seedAll = db.transaction(() => {
    let inserted = 0;
    let skipped = 0;

    for (const entry of data.aliases) {
      // Skip section headers and combo aliases
      if (entry._section || !entry.alias || !entry.mouseType) {
        continue;
      }

      const row = resolveType.get(entry.mouseType) as { id: number } | undefined;
      if (!row) {
        skipped++;
        continue;
      }

      const result = insert.run(row.id, entry.alias, entry.source ?? null);
      if (result.changes > 0) {
        inserted++;
      }
    }

    return { inserted, skipped };
  });

  const { inserted, skipped } = seedAll();
  if (inserted > 0) {
    console.log(`[seed-aliases] seeded ${inserted} mouse aliases${skipped > 0 ? ` (${skipped} skipped, type not found)` : ""}`);
  }
}