import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection.js";

interface PriceSeedEntry {
  mouseType: string;
  price: number;
  side: "buy" | "sell";
  recordedAt: string;
}

function getSeedPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "../../seed/sniping-price-seeds.json");
}

/**
 * Seed sniping_price_seeds from JSON. Resolves mouseType strings to mouse_types.id.
 * Only runs when the table is empty (the JSON is large, ~36MB).
 */
export function seedSnipingPrices(): void {
  const db = getDb();

  const count = db.prepare("SELECT COUNT(*) as cnt FROM sniping_price_seeds").get() as { cnt: number };
  if (count.cnt > 0) {
    return; // Already seeded
  }

  const seedPath = getSeedPath();
  if (!existsSync(seedPath)) {
    console.log("[seed-sniping] seed/sniping-price-seeds.json not found, skipping");
    return;
  }

  let entries: PriceSeedEntry[];
  try {
    entries = JSON.parse(readFileSync(seedPath, "utf-8"));
  } catch (err) {
    console.log(`[seed-sniping] failed to parse sniping-price-seeds.json: ${err}`);
    return;
  }

  console.log(`[seed-sniping] importing ${entries.length} price seeds...`);

  const resolveType = db.prepare(
    "SELECT id FROM mouse_types WHERE type = ?"
  );

  const insert = db.prepare(
    `INSERT INTO sniping_price_seeds (mouse_type_id, price, side, recorded_at)
     VALUES (?, ?, ?, ?)`
  );

  // Build a type -> id cache to avoid repeated lookups
  const typeIdCache = new Map<string, number | null>();
  function resolveMouseTypeId(type: string): number | null {
    if (typeIdCache.has(type)) return typeIdCache.get(type)!;
    const row = resolveType.get(type) as { id: number } | undefined;
    const id = row?.id ?? null;
    typeIdCache.set(type, id);
    return id;
  }

  // Insert in batches within a transaction for performance
  const BATCH_SIZE = 5000;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    const insertBatch = db.transaction((items: PriceSeedEntry[]) => {
      let batchInserted = 0;
      let batchSkipped = 0;

      for (const entry of items) {
        const mouseTypeId = resolveMouseTypeId(entry.mouseType);
        if (!mouseTypeId) {
          batchSkipped++;
          continue;
        }

        insert.run(mouseTypeId, entry.price, entry.side, entry.recordedAt);
        batchInserted++;
      }

      return { batchInserted, batchSkipped };
    });

    const result = insertBatch(batch);
    inserted += result.batchInserted;
    skipped += result.batchSkipped;
  }

  console.log(`[seed-sniping] seeded ${inserted} price seeds${skipped > 0 ? ` (${skipped} skipped, type not found)` : ""}`);
}
