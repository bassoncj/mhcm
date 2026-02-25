import { getDb } from "../db/connection.js";
import { isDemoEnabled, getDemoMarketConfig } from "./demo-mode.js";

const DEMO_USERNAMES = [
  "SilverBolt",
  "MapQueen",
  "CheeseHoarder",
  "TrapMaster99",
  "LuckyPaw",
  "GoldenHunter",
  "MightyMaptain",
  "SBRichie",
  "RareDuster",
  "SlotSeeker",
  "NibbleMaster",
  "TreasurePaws",
  "HornBlower",
  "MouseMaven",
  "CheddarChaser",
  "EliteHunterX",
  "BrieKnight",
  "MapMerchant",
  "GoudaGuru",
  "TrapTinkerer",
];

/** Slots (map_types IDs, all rare quality). */
const SLOT_TYPES = [
  { id: 300, anchorPrice: 720 },   // Empyrean Sky Palace
  { id: 338, anchorPrice: 1800 },  // Lightning
  { id: 366, anchorPrice: 1000 },  // Origin of Dragons
  { id: 288, anchorPrice: 1900 },  // Elite Chrome Slayer
  { id: 345, anchorPrice: 2200 },  // M1000 Team Research
  { id: 388, anchorPrice: 170 },   // Valour Rift
];

/** RT-enabled slot types – subset of SLOT_TYPES that support return tradables. */
const RT_SLOT_CONFIG: Record<number, { anchorRtPrice: number; chestItems: Array<{ type: string; name: string; maxQty: number }> }> = {
  300: {
    anchorRtPrice: 500,
    chestItems: [
      { type: "empyrean_charm_stat_item", name: "Empyrean Charm", maxQty: 5 },
      { type: "sky_ore_stat_item", name: "Sky Ore", maxQty: 10 },
      { type: "cloud_curd_stat_item", name: "Cloud Curd", maxQty: 3 },
    ],
  },
  338: {
    anchorRtPrice: 1200,
    chestItems: [
      { type: "lightning_rod_stat_item", name: "Lightning Rod", maxQty: 3 },
      { type: "storm_cell_charm_stat_item", name: "Storm Cell Charm", maxQty: 8 },
      { type: "bottled_rain_stat_item", name: "Bottled Rain", maxQty: 5 },
    ],
  },
  388: {
    anchorRtPrice: 80,
    chestItems: [
      { type: "gauntlet_elixir_stat_item", name: "Gauntlet Elixir", maxQty: 3 },
      { type: "tower_sigil_stat_item", name: "Tower Sigil", maxQty: 2 },
    ],
  },
};

/** Items (item_types IDs). */
const ITEM_TYPES_DATA = [
  { id: 2833, anchorPrice: 6400, qty: 1 },   // Kalor'ignis Rib
  { id: 926, anchorPrice: 205, qty: 5 },      // Rare Map Dust
  { id: 2435, anchorPrice: 200, qty: 3 },     // Ful'Mina's Tooth
  { id: 3075, anchorPrice: 130, qty: 10 },    // Adorned Empyrean Jewel
  { id: 3374, anchorPrice: 7000, qty: 1 },    // 100 Pack Red Lunar Lantern Candles
  { id: 3760, anchorPrice: 12200, qty: 2 },   // Mythical Dragon Heart
  { id: 1890, anchorPrice: 0.5, qty: 10 },    // Scholar Scroll (fractional price, MOQ=2)
  { id: 517, anchorPrice: 1.3, qty: 10 },     // Desert Horseshoe (fractional price, MOQ=10)
];

/** Maps Unopened (map_types IDs, all common quality). */
const MAP_UNOPENED_TYPES = [
  { id: 223, anchorPrice: 1550 },  // Origin of Dragons
  { id: 202, anchorPrice: 2100 },  // M1000 Team Research
  { id: 154, anchorPrice: 1050 },  // Empyrean Sky Palace
  { id: 142, anchorPrice: 2080 },  // Elite Chrome Slayer
  { id: 194, anchorPrice: 1200 },  // Lightning
  { id: 228, anchorPrice: 130 },   // Queso Canyon Grand Tour
];

/** Maps Complete (map_types IDs, mixed quality). */
const MAP_COMPLETE_TYPES = [
  { id: 223, anchorPrice: 5500 },  // Origin of Dragons (common)
  { id: 142, anchorPrice: 8400 },  // Elite Chrome Slayer (common)
  { id: 194, anchorPrice: 7400 },  // Lightning (common)
  { id: 345, anchorPrice: 9200 },  // M1000 Team Research (rare)
  { id: 371, anchorPrice: 1350 },  // Queso Canyon Grand Tour (rare)
  { id: 408, anchorPrice: 300 },   // Valour Rift (common)
];

/** Sniping Mice (mouse_types IDs, all on Lightning common map). */
const SNIPING_MICE_DATA = [
  { mouseTypeId: 305, anchorPrice: 120 },   // Gargantuamouse
  { mouseTypeId: 547, anchorPrice: 500 },   // M400
  { mouseTypeId: 782, anchorPrice: 330 },   // Retired Minotaur
  { mouseTypeId: 385, anchorPrice: 750 },   // Icewing
  { mouseTypeId: 765, anchorPrice: 700 },   // Manaforge Smith
  { mouseTypeId: 766, anchorPrice: 745 },   // Paladin Weapon Master
];

/** Sniping Items (item_types IDs, all on Hard Scavenger Hunt item-goal map). */
const SNIPING_ITEMS_DATA = [
  { itemTypeId: 517, anchorPrice: 20 },    // Desert Horseshoe
  { itemTypeId: 1890, anchorPrice: 5 },    // Scholar Scroll
  { itemTypeId: 3071, anchorPrice: 60 },   // Cloudstone Bangle
  { itemTypeId: 1330, anchorPrice: 20 },   // Soapy Suds
  { itemTypeId: 1905, anchorPrice: 430 },  // Powercore Hammer
  { itemTypeId: 1637, anchorPrice: 40 },   // Creamy Gnarled Sap
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Pick a random tier with weighted distribution: S (30%), A (50%), B (20%) */
function randomTier(): "S" | "A" | "B" {
  const r = Math.random();
  if (r < 0.3) return "S";
  if (r < 0.8) return "A";
  return "B";
}

/** Generate accepted_tiers JSON for buy orders based on tier preference */
function randomAcceptedTiers(): string {
  const r = Math.random();
  if (r < 0.4) return JSON.stringify(["S"]);
  if (r < 0.7) return JSON.stringify(["S", "A"]);
  return JSON.stringify(["S", "A", "B"]);
}

/** Jitter a price around an anchor by ±percent, rounded to a sensible step. */
function jitterPrice(anchor: number, pct: number): number {
  const delta = anchor * pct;
  const raw = anchor + (Math.random() * 2 - 1) * delta;
  const step = anchor <= 100 ? 5 : anchor <= 500 ? 25 : anchor <= 2000 ? 50 : 100;
  return Math.max(step, Math.round(raw / step) * step);
}

/** Jitter for item prices – supports fractional 0.1 SB increments for low-value items. */
function jitterItemPrice(anchor: number, pct: number): number {
  const delta = anchor * pct;
  const raw = anchor + (Math.random() * 2 - 1) * delta;
  if (anchor < 10) return Math.max(0.1, Math.round(raw * 10) / 10);
  if (anchor < 100) return Math.max(1, Math.round(raw));
  return jitterPrice(anchor, pct);
}

/** Generate a random ISO timestamp within the last N days (weighted toward recent). */
function randomTimestamp(minDaysAgo: number, maxDaysAgo: number): string {
  const now = Date.now();
  const msPerDay = 86_400_000;
  const earliest = now - maxDaysAgo * msPerDay;
  const latest = now - minDaysAgo * msPerDay;
  const t = Math.sqrt(Math.random());
  const ts = new Date(latest - t * (latest - earliest));
  return ts.toISOString().replace("T", " ").slice(0, 19);
}

/** Pick a different element from the pool than `exclude`. */
function pickOther<T>(pool: T[], exclude: T): T {
  let pick: T;
  do {
    pick = randomElement(pool);
  } while (pick === exclude);
  return pick;
}

// Purge all demo data. Deletes in FK-safe order (children before parents).
export function purgeDemoData(): void {
  const db = getDb();
  db.transaction(() => {
    // Sniping (transaction_mice/items CASCADE from transactions)
    db.exec("DELETE FROM sniping_item_price_history WHERE is_demo = 1");
    db.exec("DELETE FROM sniping_item_group_price_history WHERE is_demo = 1");
    db.exec("DELETE FROM sniping_price_history WHERE is_demo = 1");
    db.exec("DELETE FROM sniping_group_price_history WHERE is_demo = 1");
    db.exec("DELETE FROM sniping_transactions WHERE is_demo = 1");
    db.exec("DELETE FROM sniping_orders WHERE is_demo = 1");

    // Items
    db.exec("DELETE FROM item_price_history WHERE is_demo = 1");
    db.exec("DELETE FROM item_transactions WHERE is_demo = 1");
    db.exec("DELETE FROM item_orders WHERE is_demo = 1");

    // Maps
    db.exec("DELETE FROM map_price_history WHERE is_demo = 1");
    db.exec("DELETE FROM map_transactions WHERE is_demo = 1");
    db.exec("DELETE FROM map_orders WHERE is_demo = 1");

    // Slots (existing) – rt_pending_items has FK to transactions, delete first
    db.exec("DELETE FROM rt_pending_items WHERE transaction_id IN (SELECT id FROM transactions WHERE is_demo = 1)");
    db.exec("DELETE FROM transactions WHERE is_demo = 1");
    db.exec("DELETE FROM orders WHERE is_demo = 1");

    // Users
    db.exec("DELETE FROM mh_accounts WHERE user_id IN (SELECT id FROM users WHERE is_demo = 1)");
    db.exec("DELETE FROM user_favourites WHERE user_id IN (SELECT id FROM users WHERE is_demo = 1)");
    db.exec("DELETE FROM users WHERE is_demo = 1");
  })();
}

interface SeedCounts {
  slotOrders: number;
  slotTxns: number;
  itemOrders: number;
  itemTxns: number;
  mapOrders: number;
  mapTxns: number;
  snipingOrders: number;
  snipingTxns: number;
}

// Seed demo data across all 6 markets. Idempotent – purge first for fresh data.
export function seedDemoData(): { users: number } & SeedCounts {
  const db = getDb();

  // Check if demo users already exist
  const existingDemo = db
    .prepare("SELECT COUNT(*) as cnt FROM users WHERE is_demo = 1")
    .get() as { cnt: number };
  if (existingDemo.cnt > 0) {
    return { users: existingDemo.cnt, ...getDemoCounts() };
  }

  // Verify types exist in DB
  const verified = verifyAndEnableTypes();

  // Get first 2 real users (if they exist)
  const realUsers = db
    .prepare("SELECT id FROM users WHERE is_demo = 0 ORDER BY id ASC LIMIT 2")
    .all() as Array<{ id: number }>;
  const realUserIds = realUsers.map((u) => u.id);

  let totalUsers = 0;
  const counts: SeedCounts = {
    slotOrders: 0, slotTxns: 0,
    itemOrders: 0, itemTxns: 0,
    mapOrders: 0, mapTxns: 0,
    snipingOrders: 0, snipingTxns: 0,
  };

  db.transaction(() => {
    // 1. Create demo users
    const demoUserIds: number[] = [];
    const insertUser = db.prepare(
      "INSERT INTO users (username, password_hash, is_demo) VALUES (?, ?, 1) RETURNING id"
    );
    const insertMhAccount = db.prepare(
      `INSERT INTO mh_accounts (user_id, mh_user_id, mh_sn_user_id, verified_at)
       VALUES (?, ?, ?, datetime('now'))`
    );

    for (let i = 0; i < DEMO_USERNAMES.length; i++) {
      const row = insertUser.get(DEMO_USERNAMES[i], "demo_no_login") as { id: number };
      demoUserIds.push(row.id);
      insertMhAccount.run(row.id, `demo_mh_${i + 1}`, `demo-${i + 1}`);
    }
    totalUsers = demoUserIds.length;

    // Build participant pool with MH snuid lookup
    const allParticipants = [...demoUserIds, ...realUserIds];
    const mhAccounts = new Map<number, string>();
    for (const uid of allParticipants) {
      const mh = db
        .prepare("SELECT mh_sn_user_id FROM mh_accounts WHERE user_id = ?")
        .get(uid) as { mh_sn_user_id: string } | undefined;
      if (mh) mhAccounts.set(uid, mh.mh_sn_user_id);
    }

    const pool = allParticipants.filter((id) => mhAccounts.has(id));
    if (pool.length < 2) {
      console.log("[demo] not enough participants with MH accounts");
      return;
    }

    const snuid = (id: number) => mhAccounts.get(id) ?? "demo-unknown";
    let fakeMapId = 100_000;

    // SLOTS
    if (verified.slotIds.length > 0) {
      const insertOrder = db.prepare(
        `INSERT INTO orders (user_id, map_type_id, side, price, quantity, filled_quantity, status, mh_map_id, tier, accepted_tiers, rt_price, rt_only, is_rt, is_demo, created_at, updated_at, priority_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
      );
      const insertTxn = db.prepare(
        `INSERT INTO transactions (sell_order_id, buy_order_id, seller_user_id, buyer_user_id, price, quantity, state, mh_map_id, buyer_mh_sn_user_id, seller_mh_sn_user_id, is_rt, is_demo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, 1, ?, ?)`
      );
      const insertRtItem = db.prepare(
        `INSERT INTO rt_pending_items (transaction_id, item_type, item_name, quantity, transferred, created_at, transferred_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      );

      function seedRtItems(txnId: number, mapTypeId: number, ts: string): void {
        const cfg = RT_SLOT_CONFIG[mapTypeId];
        if (!cfg) return;
        for (const item of cfg.chestItems) {
          const qty = randomInt(1, item.maxQty);
          insertRtItem.run(txnId, item.type, item.name, qty, ts, ts);
        }
      }

      for (const st of verified.slotIds) {
        const rtCfg = RT_SLOT_CONFIG[st.id];

        // Completed transactions between participants
        const txnCount = randomInt(6, 10);
        for (let t = 0; t < txnCount; t++) {
          const seller = randomElement(pool);
          const buyer = pickOther(pool, seller);
          const isRt = rtCfg && Math.random() < 0.4;
          const price = isRt
            ? jitterPrice(rtCfg.anchorRtPrice, 0.10)
            : jitterPrice(st.anchorPrice, 0.10);
          const rtPrice = isRt ? jitterPrice(rtCfg.anchorRtPrice, 0.10) : null;
          const ts = randomTimestamp(1, 7);
          const mapId = fakeMapId++;
          const tier = randomTier();
          const sellId = (insertOrder.run(seller, st.id, "sell", isRt ? st.anchorPrice : price, 1, 1, "filled", mapId, tier, null, rtPrice, 0, 0, ts, ts, ts)).lastInsertRowid;
          const buyId = (insertOrder.run(buyer, st.id, "buy", price, 1, 1, "filled", null, null, JSON.stringify([tier]), null, 0, isRt ? 1 : 0, ts, ts, ts)).lastInsertRowid;
          const txnId = (insertTxn.run(Number(sellId), Number(buyId), seller, buyer, price, 1, mapId, snuid(buyer), snuid(seller), isRt ? 1 : 0, ts, ts)).lastInsertRowid;
          if (isRt) seedRtItems(Number(txnId), st.id, ts);
          counts.slotOrders += 2;
          counts.slotTxns++;
        }

        // Real user transactions
        for (const realId of realUserIds) {
          if (!mhAccounts.has(realId)) continue;
          // As seller
          for (let s = 0; s < randomInt(3, 5); s++) {
            const buyer = pickOther(demoUserIds, realId);
            const isRt = rtCfg && Math.random() < 0.35;
            const price = isRt
              ? jitterPrice(rtCfg.anchorRtPrice, 0.08)
              : jitterPrice(st.anchorPrice, 0.08);
            const rtPrice = isRt ? jitterPrice(rtCfg.anchorRtPrice, 0.08) : null;
            const ts = randomTimestamp(1, 7);
            const mapId = fakeMapId++;
            const tier = randomTier();
            const sellId = (insertOrder.run(realId, st.id, "sell", isRt ? st.anchorPrice : price, 1, 1, "filled", mapId, tier, null, rtPrice, 0, 0, ts, ts, ts)).lastInsertRowid;
            const buyId = (insertOrder.run(buyer, st.id, "buy", price, 1, 1, "filled", null, null, JSON.stringify([tier]), null, 0, isRt ? 1 : 0, ts, ts, ts)).lastInsertRowid;
            const txnId = (insertTxn.run(Number(sellId), Number(buyId), realId, buyer, price, 1, mapId, snuid(buyer), snuid(realId), isRt ? 1 : 0, ts, ts)).lastInsertRowid;
            if (isRt) seedRtItems(Number(txnId), st.id, ts);
            counts.slotOrders += 2;
            counts.slotTxns++;
          }
          // As buyer
          for (let b = 0; b < randomInt(2, 4); b++) {
            const seller = pickOther(demoUserIds, realId);
            const isRt = rtCfg && Math.random() < 0.35;
            const price = isRt
              ? jitterPrice(rtCfg.anchorRtPrice, 0.08)
              : jitterPrice(st.anchorPrice, 0.08);
            const rtPrice = isRt ? jitterPrice(rtCfg.anchorRtPrice, 0.08) : null;
            const ts = randomTimestamp(1, 7);
            const mapId = fakeMapId++;
            const tier = randomTier();
            const sellId = (insertOrder.run(seller, st.id, "sell", isRt ? st.anchorPrice : price, 1, 1, "filled", mapId, tier, null, rtPrice, 0, 0, ts, ts, ts)).lastInsertRowid;
            const buyId = (insertOrder.run(realId, st.id, "buy", price, 1, 1, "filled", null, null, JSON.stringify([tier]), null, 0, isRt ? 1 : 0, ts, ts, ts)).lastInsertRowid;
            const txnId = (insertTxn.run(Number(sellId), Number(buyId), seller, realId, price, 1, mapId, snuid(realId), snuid(seller), isRt ? 1 : 0, ts, ts)).lastInsertRowid;
            if (isRt) seedRtItems(Number(txnId), st.id, ts);
            counts.slotOrders += 2;
            counts.slotTxns++;
          }
        }
      }

      // Open slot orders
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const userId of shuffled) {
        if (Math.random() < 0.5) {
          const st = randomElement(verified.slotIds);
          const rtCfg = RT_SLOT_CONFIG[st.id];
          const price = jitterPrice(st.anchorPrice, 0.08);
          const ts = randomTimestamp(0, 3);
          // ~30% of sells on RT-eligible types have RT pricing, ~10% are RT-only
          const hasRt = rtCfg && Math.random() < 0.3;
          const rtOnly = hasRt && Math.random() < 0.33 ? 1 : 0;
          const rtPrice = hasRt ? jitterPrice(rtCfg.anchorRtPrice, 0.08) : null;
          insertOrder.run(userId, st.id, "sell", rtOnly ? 0 : price, randomInt(1, 4), 0, "open", fakeMapId++, randomTier(), null, rtPrice, rtOnly, 0, ts, ts, ts);
          counts.slotOrders++;
        }
        for (let b = 0; b < randomInt(0, 5); b++) {
          const st = randomElement(verified.slotIds);
          const rtCfg = RT_SLOT_CONFIG[st.id];
          const price = jitterPrice(st.anchorPrice, 0.08);
          const ts = randomTimestamp(0, 3);
          // ~25% of buys on RT-eligible types are RT buys (lower price)
          const isRt = rtCfg && Math.random() < 0.25;
          const buyPrice = isRt ? jitterPrice(rtCfg.anchorRtPrice, 0.08) : price;
          insertOrder.run(userId, st.id, "buy", buyPrice, randomInt(1, 10), 0, "open", null, null, randomAcceptedTiers(), null, 0, isRt ? 1 : 0, ts, ts, ts);
          counts.slotOrders++;
        }
      }
    }

    // ITEMS
    if (verified.itemTypes.length > 0) {
      const insertItemOrder = db.prepare(
        `INSERT INTO item_orders (user_id, item_type_id, side, price, quantity, filled_quantity, status, is_demo, created_at, updated_at, priority_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
      );
      const insertItemTxn = db.prepare(
        `INSERT INTO item_transactions (sell_order_id, buy_order_id, seller_user_id, buyer_user_id, item_type_id, item_type, price, quantity, state, seller_mh_sn_user_id, buyer_mh_sn_user_id, is_demo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, 1, ?, ?)`
      );
      const insertItemHistory = db.prepare(
        `INSERT INTO item_price_history (item_type_id, price, quantity, is_demo, completed_at)
         VALUES (?, ?, ?, 1, ?)`
      );

      for (const it of verified.itemTypes) {
        // Completed transactions
        const txnCount = randomInt(6, 10);
        for (let t = 0; t < txnCount; t++) {
          const seller = randomElement(pool);
          const buyer = pickOther(pool, seller);
          const price = jitterItemPrice(it.anchorPrice, 0.10);
          const qty = it.qty;
          const ts = randomTimestamp(1, 7);
          const sellId = (insertItemOrder.run(seller, it.id, "sell", price, qty, qty, "filled", ts, ts, ts)).lastInsertRowid;
          const buyId = (insertItemOrder.run(buyer, it.id, "buy", price, qty, qty, "filled", ts, ts, ts)).lastInsertRowid;
          insertItemTxn.run(Number(sellId), Number(buyId), seller, buyer, it.id, it.slug, price, qty, snuid(seller), snuid(buyer), ts, ts);
          insertItemHistory.run(it.id, price, qty, ts);
          counts.itemOrders += 2;
          counts.itemTxns++;
        }

        // Real user transactions
        for (const realId of realUserIds) {
          if (!mhAccounts.has(realId)) continue;
          for (let s = 0; s < randomInt(2, 4); s++) {
            const buyer = pickOther(demoUserIds, realId);
            const price = jitterItemPrice(it.anchorPrice, 0.08);
            const qty = it.qty;
            const ts = randomTimestamp(1, 7);
            const sellId = (insertItemOrder.run(realId, it.id, "sell", price, qty, qty, "filled", ts, ts, ts)).lastInsertRowid;
            const buyId = (insertItemOrder.run(buyer, it.id, "buy", price, qty, qty, "filled", ts, ts, ts)).lastInsertRowid;
            insertItemTxn.run(Number(sellId), Number(buyId), realId, buyer, it.id, it.slug, price, qty, snuid(realId), snuid(buyer), ts, ts);
            insertItemHistory.run(it.id, price, qty, ts);
            counts.itemOrders += 2;
            counts.itemTxns++;
          }
          for (let b = 0; b < randomInt(1, 3); b++) {
            const seller = pickOther(demoUserIds, realId);
            const price = jitterItemPrice(it.anchorPrice, 0.08);
            const qty = it.qty;
            const ts = randomTimestamp(1, 7);
            const sellId = (insertItemOrder.run(seller, it.id, "sell", price, qty, qty, "filled", ts, ts, ts)).lastInsertRowid;
            const buyId = (insertItemOrder.run(realId, it.id, "buy", price, qty, qty, "filled", ts, ts, ts)).lastInsertRowid;
            insertItemTxn.run(Number(sellId), Number(buyId), seller, realId, it.id, it.slug, price, qty, snuid(seller), snuid(realId), ts, ts);
            insertItemHistory.run(it.id, price, qty, ts);
            counts.itemOrders += 2;
            counts.itemTxns++;
          }
        }
      }

      // Open item orders
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const userId of shuffled) {
        if (Math.random() < 0.4) {
          const it = randomElement(verified.itemTypes);
          const price = jitterItemPrice(it.anchorPrice, 0.08);
          const ts = randomTimestamp(0, 3);
          insertItemOrder.run(userId, it.id, "sell", price, it.qty, 0, "open", ts, ts, ts);
          counts.itemOrders++;
        }
        for (let b = 0; b < randomInt(0, 3); b++) {
          const it = randomElement(verified.itemTypes);
          const price = jitterItemPrice(it.anchorPrice, 0.08);
          const ts = randomTimestamp(0, 3);
          insertItemOrder.run(userId, it.id, "buy", price, it.qty, 0, "open", ts, ts, ts);
          counts.itemOrders++;
        }
      }
    }

    // MAPS (shared logic for unopened + complete)
    const insertMapOrder = db.prepare(
      `INSERT INTO map_orders (user_id, map_type_id, mode, side, price, quantity, filled_quantity, status, mh_map_id, tier, accepted_tiers, is_demo, created_at, updated_at, priority_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    );
    const insertMapTxn = db.prepare(
      `INSERT INTO map_transactions (sell_order_id, buy_order_id, seller_user_id, buyer_user_id, map_type_id, mode, price, quantity, state, mh_map_id, seller_mh_sn_user_id, buyer_mh_sn_user_id, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'completed', ?, ?, ?, 1, ?, ?)`
    );
    const insertMapHistory = db.prepare(
      `INSERT INTO map_price_history (map_type_id, mode, price, quantity, is_demo, completed_at)
       VALUES (?, ?, ?, 1, 1, ?)`
    );

    function seedMapMarket(
      types: Array<{ id: number; anchorPrice: number }>,
      mode: "unopened" | "completed",
    ): void {
      if (types.length === 0) return;

      for (const mt of types) {
        const txnCount = randomInt(6, 10);
        for (let t = 0; t < txnCount; t++) {
          const seller = randomElement(pool);
          const buyer = pickOther(pool, seller);
          const price = jitterPrice(mt.anchorPrice, 0.10);
          const ts = randomTimestamp(1, 7);
          const mapId = fakeMapId++;
          const tier = mode === "completed" ? randomTier() : null;
          const acceptedTiers = mode === "completed" ? (tier ? JSON.stringify([tier]) : null) : null;
          const sellId = (insertMapOrder.run(seller, mt.id, mode, "sell", price, 1, 1, "filled", mapId, tier, null, ts, ts, ts)).lastInsertRowid;
          const buyId = (insertMapOrder.run(buyer, mt.id, mode, "buy", price, 1, 1, "filled", null, null, acceptedTiers, ts, ts, ts)).lastInsertRowid;
          insertMapTxn.run(Number(sellId), Number(buyId), seller, buyer, mt.id, mode, price, mapId, snuid(seller), snuid(buyer), ts, ts);
          insertMapHistory.run(mt.id, mode, price, ts);
          counts.mapOrders += 2;
          counts.mapTxns++;
        }

        // Real user transactions
        for (const realId of realUserIds) {
          if (!mhAccounts.has(realId)) continue;
          for (let s = 0; s < randomInt(2, 4); s++) {
            const buyer = pickOther(demoUserIds, realId);
            const price = jitterPrice(mt.anchorPrice, 0.08);
            const ts = randomTimestamp(1, 7);
            const mapId = fakeMapId++;
            const tier = mode === "completed" ? randomTier() : null;
            const acceptedTiers = mode === "completed" ? (tier ? JSON.stringify([tier]) : null) : null;
            const sellId = (insertMapOrder.run(realId, mt.id, mode, "sell", price, 1, 1, "filled", mapId, tier, null, ts, ts, ts)).lastInsertRowid;
            const buyId = (insertMapOrder.run(buyer, mt.id, mode, "buy", price, 1, 1, "filled", null, null, acceptedTiers, ts, ts, ts)).lastInsertRowid;
            insertMapTxn.run(Number(sellId), Number(buyId), realId, buyer, mt.id, mode, price, mapId, snuid(realId), snuid(buyer), ts, ts);
            insertMapHistory.run(mt.id, mode, price, ts);
            counts.mapOrders += 2;
            counts.mapTxns++;
          }
          for (let b = 0; b < randomInt(1, 3); b++) {
            const seller = pickOther(demoUserIds, realId);
            const price = jitterPrice(mt.anchorPrice, 0.08);
            const ts = randomTimestamp(1, 7);
            const mapId = fakeMapId++;
            const tier = mode === "completed" ? randomTier() : null;
            const acceptedTiers = mode === "completed" ? (tier ? JSON.stringify([tier]) : null) : null;
            const sellId = (insertMapOrder.run(seller, mt.id, mode, "sell", price, 1, 1, "filled", mapId, tier, null, ts, ts, ts)).lastInsertRowid;
            const buyId = (insertMapOrder.run(realId, mt.id, mode, "buy", price, 1, 1, "filled", null, null, acceptedTiers, ts, ts, ts)).lastInsertRowid;
            insertMapTxn.run(Number(sellId), Number(buyId), seller, realId, mt.id, mode, price, mapId, snuid(seller), snuid(realId), ts, ts);
            insertMapHistory.run(mt.id, mode, price, ts);
            counts.mapOrders += 2;
            counts.mapTxns++;
          }
        }
      }

      // Open map orders
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const userId of shuffled) {
        if (Math.random() < 0.4) {
          const mt = randomElement(types);
          const price = jitterPrice(mt.anchorPrice, 0.08);
          const ts = randomTimestamp(0, 3);
          const tier = mode === "completed" ? randomTier() : null;
          insertMapOrder.run(userId, mt.id, mode, "sell", price, 1, 0, "open", fakeMapId++, tier, null, ts, ts, ts);
          counts.mapOrders++;
        }
        for (let b = 0; b < randomInt(0, 3); b++) {
          const mt = randomElement(types);
          const price = jitterPrice(mt.anchorPrice, 0.08);
          const ts = randomTimestamp(0, 3);
          const acceptedTiers = mode === "completed" ? randomAcceptedTiers() : null;
          insertMapOrder.run(userId, mt.id, mode, "buy", price, 1, 0, "open", null, null, acceptedTiers, ts, ts, ts);
          counts.mapOrders++;
        }
      }
    }

    seedMapMarket(verified.mapUnopenedIds, "unopened");
    seedMapMarket(verified.mapCompleteIds, "completed");

    // SNIPING MICE
    if (verified.mouseIds.length > 0) {
      const insertSnipingOrder = db.prepare(
        `INSERT INTO sniping_orders (user_id, mouse_type_id, goal_type, side, price, status, mh_map_id, map_class, is_demo, created_at, updated_at, priority_at)
         VALUES (?, ?, 'mouse', ?, ?, ?, ?, ?, 1, ?, ?, ?)`
      );
      const insertSnipingTxn = db.prepare(
        `INSERT INTO sniping_transactions (sniper_user_id, maptain_user_id, goal_type, mh_map_id, total_price, state, sniper_mh_sn_user_id, maptain_mh_sn_user_id, is_demo, created_at, updated_at)
         VALUES (?, ?, 'mouse', ?, ?, 'completed', ?, ?, 1, ?, ?)`
      );
      const insertTxnMice = db.prepare(
        `INSERT INTO sniping_transaction_mice (transaction_id, buy_order_id, sell_order_id, mouse_type_id, price, caught, caught_at, paid, paid_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, 1, ?)`
      );
      const insertMouseHistory = db.prepare(
        `INSERT INTO sniping_price_history (mouse_type_id, price, is_demo, completed_at)
         VALUES (?, ?, 1, ?)`
      );

      for (const m of verified.mouseIds) {
        const txnCount = randomInt(6, 10);
        for (let t = 0; t < txnCount; t++) {
          const sniper = randomElement(pool);
          const maptain = pickOther(pool, sniper);
          const price = jitterPrice(m.anchorPrice, 0.10);
          const ts = randomTimestamp(1, 7);
          const mapId = fakeMapId++;
          // Sell order (sniper): no map info
          const sellId = (insertSnipingOrder.run(sniper, m.mouseTypeId, "sniper_sell", price, "completed", null, null, ts, ts, ts)).lastInsertRowid;
          // Buy order (maptain): has map info
          const buyId = (insertSnipingOrder.run(maptain, m.mouseTypeId, "sniper_buy", price, "completed", mapId, "treasure", ts, ts, ts)).lastInsertRowid;
          const txnId = (insertSnipingTxn.run(sniper, maptain, mapId, price, snuid(sniper), snuid(maptain), ts, ts)).lastInsertRowid;
          insertTxnMice.run(Number(txnId), Number(buyId), Number(sellId), m.mouseTypeId, price, ts, ts);
          insertMouseHistory.run(m.mouseTypeId, price, ts);
          counts.snipingOrders += 2;
          counts.snipingTxns++;
        }

        // Real user transactions
        for (const realId of realUserIds) {
          if (!mhAccounts.has(realId)) continue;
          // Real user as maptain (buyer)
          for (let b = 0; b < randomInt(1, 3); b++) {
            const sniper = pickOther(demoUserIds, realId);
            const price = jitterPrice(m.anchorPrice, 0.08);
            const ts = randomTimestamp(1, 7);
            const mapId = fakeMapId++;
            const sellId = (insertSnipingOrder.run(sniper, m.mouseTypeId, "sniper_sell", price, "completed", null, null, ts, ts, ts)).lastInsertRowid;
            const buyId = (insertSnipingOrder.run(realId, m.mouseTypeId, "sniper_buy", price, "completed", mapId, "treasure", ts, ts, ts)).lastInsertRowid;
            const txnId = (insertSnipingTxn.run(sniper, realId, mapId, price, snuid(sniper), snuid(realId), ts, ts)).lastInsertRowid;
            insertTxnMice.run(Number(txnId), Number(buyId), Number(sellId), m.mouseTypeId, price, ts, ts);
            insertMouseHistory.run(m.mouseTypeId, price, ts);
            counts.snipingOrders += 2;
            counts.snipingTxns++;
          }
          // Real user as sniper (seller)
          for (let s = 0; s < randomInt(1, 3); s++) {
            const maptain = pickOther(demoUserIds, realId);
            const price = jitterPrice(m.anchorPrice, 0.08);
            const ts = randomTimestamp(1, 7);
            const mapId = fakeMapId++;
            const sellId = (insertSnipingOrder.run(realId, m.mouseTypeId, "sniper_sell", price, "completed", null, null, ts, ts, ts)).lastInsertRowid;
            const buyId = (insertSnipingOrder.run(maptain, m.mouseTypeId, "sniper_buy", price, "completed", mapId, "treasure", ts, ts, ts)).lastInsertRowid;
            const txnId = (insertSnipingTxn.run(realId, maptain, mapId, price, snuid(realId), snuid(maptain), ts, ts)).lastInsertRowid;
            insertTxnMice.run(Number(txnId), Number(buyId), Number(sellId), m.mouseTypeId, price, ts, ts);
            insertMouseHistory.run(m.mouseTypeId, price, ts);
            counts.snipingOrders += 2;
            counts.snipingTxns++;
          }
        }
      }

      // Open sniping mouse orders
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const userId of shuffled) {
        if (Math.random() < 0.4) {
          const m = randomElement(verified.mouseIds);
          const price = jitterPrice(m.anchorPrice, 0.08);
          const ts = randomTimestamp(0, 3);
          insertSnipingOrder.run(userId, m.mouseTypeId, "sniper_sell", price, "open", null, null, ts, ts, ts);
          counts.snipingOrders++;
        }
        for (let b = 0; b < randomInt(0, 2); b++) {
          const m = randomElement(verified.mouseIds);
          const price = jitterPrice(m.anchorPrice, 0.08);
          const ts = randomTimestamp(0, 3);
          insertSnipingOrder.run(userId, m.mouseTypeId, "sniper_buy", price, "open", fakeMapId++, "treasure", ts, ts, ts);
          counts.snipingOrders++;
        }
      }
    }

    // SNIPING ITEMS
    if (verified.snipingItemIds.length > 0) {
      const insertSnipingItemOrder = db.prepare(
        `INSERT INTO sniping_orders (user_id, item_type_id, goal_type, side, price, status, mh_map_id, map_class, is_demo, created_at, updated_at, priority_at)
         VALUES (?, ?, 'item', ?, ?, ?, ?, ?, 1, ?, ?, ?)`
      );
      const insertSnipingItemTxn = db.prepare(
        `INSERT INTO sniping_transactions (sniper_user_id, maptain_user_id, goal_type, mh_map_id, total_price, state, sniper_mh_sn_user_id, maptain_mh_sn_user_id, is_demo, created_at, updated_at)
         VALUES (?, ?, 'item', ?, ?, 'completed', ?, ?, 1, ?, ?)`
      );
      const insertTxnItems = db.prepare(
        `INSERT INTO sniping_transaction_items (transaction_id, buy_order_id, sell_order_id, item_type_id, price, found, found_at, paid, paid_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, 1, ?)`
      );
      const insertItemHistory = db.prepare(
        `INSERT INTO sniping_item_price_history (item_type_id, price, is_demo, completed_at)
         VALUES (?, ?, 1, ?)`
      );

      for (const si of verified.snipingItemIds) {
        const txnCount = randomInt(6, 10);
        for (let t = 0; t < txnCount; t++) {
          const sniper = randomElement(pool);
          const maptain = pickOther(pool, sniper);
          const price = jitterPrice(si.anchorPrice, 0.10);
          const ts = randomTimestamp(1, 7);
          const mapId = fakeMapId++;
          const sellId = (insertSnipingItemOrder.run(sniper, si.itemTypeId, "sniper_sell", price, "completed", null, null, ts, ts, ts)).lastInsertRowid;
          const buyId = (insertSnipingItemOrder.run(maptain, si.itemTypeId, "sniper_buy", price, "completed", mapId, "treasure", ts, ts, ts)).lastInsertRowid;
          const txnId = (insertSnipingItemTxn.run(sniper, maptain, mapId, price, snuid(sniper), snuid(maptain), ts, ts)).lastInsertRowid;
          insertTxnItems.run(Number(txnId), Number(buyId), Number(sellId), si.itemTypeId, price, ts, ts);
          insertItemHistory.run(si.itemTypeId, price, ts);
          counts.snipingOrders += 2;
          counts.snipingTxns++;
        }

        // Real user transactions
        for (const realId of realUserIds) {
          if (!mhAccounts.has(realId)) continue;
          for (let b = 0; b < randomInt(1, 3); b++) {
            const sniper = pickOther(demoUserIds, realId);
            const price = jitterPrice(si.anchorPrice, 0.08);
            const ts = randomTimestamp(1, 7);
            const mapId = fakeMapId++;
            const sellId = (insertSnipingItemOrder.run(sniper, si.itemTypeId, "sniper_sell", price, "completed", null, null, ts, ts, ts)).lastInsertRowid;
            const buyId = (insertSnipingItemOrder.run(realId, si.itemTypeId, "sniper_buy", price, "completed", mapId, "treasure", ts, ts, ts)).lastInsertRowid;
            const txnId = (insertSnipingItemTxn.run(sniper, realId, mapId, price, snuid(sniper), snuid(realId), ts, ts)).lastInsertRowid;
            insertTxnItems.run(Number(txnId), Number(buyId), Number(sellId), si.itemTypeId, price, ts, ts);
            insertItemHistory.run(si.itemTypeId, price, ts);
            counts.snipingOrders += 2;
            counts.snipingTxns++;
          }
          for (let s = 0; s < randomInt(1, 3); s++) {
            const maptain = pickOther(demoUserIds, realId);
            const price = jitterPrice(si.anchorPrice, 0.08);
            const ts = randomTimestamp(1, 7);
            const mapId = fakeMapId++;
            const sellId = (insertSnipingItemOrder.run(realId, si.itemTypeId, "sniper_sell", price, "completed", null, null, ts, ts, ts)).lastInsertRowid;
            const buyId = (insertSnipingItemOrder.run(maptain, si.itemTypeId, "sniper_buy", price, "completed", mapId, "treasure", ts, ts, ts)).lastInsertRowid;
            const txnId = (insertSnipingItemTxn.run(realId, maptain, mapId, price, snuid(realId), snuid(maptain), ts, ts)).lastInsertRowid;
            insertTxnItems.run(Number(txnId), Number(buyId), Number(sellId), si.itemTypeId, price, ts, ts);
            insertItemHistory.run(si.itemTypeId, price, ts);
            counts.snipingOrders += 2;
            counts.snipingTxns++;
          }
        }
      }

      // Open sniping item orders
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const userId of shuffled) {
        if (Math.random() < 0.4) {
          const si = randomElement(verified.snipingItemIds);
          const price = jitterPrice(si.anchorPrice, 0.08);
          const ts = randomTimestamp(0, 3);
          insertSnipingItemOrder.run(userId, si.itemTypeId, "sniper_sell", price, "open", null, null, ts, ts, ts);
          counts.snipingOrders++;
        }
        for (let b = 0; b < randomInt(0, 2); b++) {
          const si = randomElement(verified.snipingItemIds);
          const price = jitterPrice(si.anchorPrice, 0.08);
          const ts = randomTimestamp(0, 3);
          insertSnipingItemOrder.run(userId, si.itemTypeId, "sniper_buy", price, "open", fakeMapId++, "treasure", ts, ts, ts);
          counts.snipingOrders++;
        }
      }
    }
  })();

  const total = counts.slotOrders + counts.itemOrders + counts.mapOrders + counts.snipingOrders;
  const txnTotal = counts.slotTxns + counts.itemTxns + counts.mapTxns + counts.snipingTxns;
  console.log(`[demo] seeded: ${totalUsers} users, ${total} orders, ${txnTotal} transactions across all markets`);
  return { users: totalUsers, ...counts };
}

interface VerifiedTypes {
  slotIds: Array<{ id: number; anchorPrice: number }>;
  itemTypes: Array<{ id: number; slug: string; anchorPrice: number; qty: number }>;
  mapUnopenedIds: Array<{ id: number; anchorPrice: number }>;
  mapCompleteIds: Array<{ id: number; anchorPrice: number }>;
  mouseIds: Array<{ mouseTypeId: number; anchorPrice: number }>;
  snipingItemIds: Array<{ itemTypeId: number; anchorPrice: number }>;
}

function verifyAndEnableTypes(): VerifiedTypes {
  const db = getDb();
  const result: VerifiedTypes = {
    slotIds: [],
    itemTypes: [],
    mapUnopenedIds: [],
    mapCompleteIds: [],
    mouseIds: [],
    snipingItemIds: [],
  };

  // Slots – verify map_types exist, enable, and set supports_rt where applicable
  for (const st of SLOT_TYPES) {
    const row = db.prepare("SELECT id, enabled FROM map_types WHERE id = ?").get(st.id) as { id: number; enabled: number } | undefined;
    if (!row) { console.log(`[demo] slot map type id=${st.id} not found, skipping`); continue; }
    if (row.enabled === 0) db.prepare("UPDATE map_types SET enabled = 1 WHERE id = ?").run(st.id);
    if (RT_SLOT_CONFIG[st.id]) db.prepare("UPDATE map_types SET supports_rt = 1 WHERE id = ?").run(st.id);
    result.slotIds.push(st);
  }

  // Items – verify item_types exist and enable
  for (const it of ITEM_TYPES_DATA) {
    const row = db.prepare("SELECT id, type, enabled, is_tradable FROM item_types WHERE id = ?").get(it.id) as { id: number; type: string; enabled: number; is_tradable: number } | undefined;
    if (!row) { console.log(`[demo] item type id=${it.id} not found, skipping`); continue; }
    if (row.enabled === 0 || row.is_tradable === 0) {
      db.prepare("UPDATE item_types SET enabled = 1, is_tradable = 1 WHERE id = ?").run(it.id);
    }
    result.itemTypes.push({ id: it.id, slug: row.type, anchorPrice: it.anchorPrice, qty: it.qty });
  }

  // Maps Unopened – verify and enable
  for (const mt of MAP_UNOPENED_TYPES) {
    const row = db.prepare("SELECT id FROM map_types WHERE id = ?").get(mt.id) as { id: number } | undefined;
    if (!row) { console.log(`[demo] map type id=${mt.id} not found, skipping`); continue; }
    db.prepare("UPDATE map_types SET enabled_unopened = 1 WHERE id = ?").run(mt.id);
    result.mapUnopenedIds.push(mt);
  }

  // Maps Complete – verify and enable
  for (const mt of MAP_COMPLETE_TYPES) {
    const row = db.prepare("SELECT id FROM map_types WHERE id = ?").get(mt.id) as { id: number } | undefined;
    if (!row) { console.log(`[demo] map type id=${mt.id} not found, skipping`); continue; }
    db.prepare("UPDATE map_types SET enabled_complete = 1 WHERE id = ?").run(mt.id);
    result.mapCompleteIds.push(mt);
  }

  // Sniping Mice – verify mouse_types exist
  for (const m of SNIPING_MICE_DATA) {
    const row = db.prepare("SELECT id FROM mouse_types WHERE id = ?").get(m.mouseTypeId) as { id: number } | undefined;
    if (!row) { console.log(`[demo] mouse type id=${m.mouseTypeId} not found, skipping`); continue; }
    result.mouseIds.push(m);
  }

  // Sniping Items – verify item_types exist
  for (const si of SNIPING_ITEMS_DATA) {
    const row = db.prepare("SELECT id FROM item_types WHERE id = ?").get(si.itemTypeId) as { id: number } | undefined;
    if (!row) { console.log(`[demo] sniping item type id=${si.itemTypeId} not found, skipping`); continue; }
    result.snipingItemIds.push(si);
  }

  return result;
}

function getDemoCounts(): SeedCounts {
  const db = getDb();
  const cnt = (sql: string) => (db.prepare(sql).get() as { cnt: number }).cnt;

  return {
    slotOrders: cnt("SELECT COUNT(*) as cnt FROM orders WHERE is_demo = 1"),
    slotTxns: cnt("SELECT COUNT(*) as cnt FROM transactions WHERE is_demo = 1"),
    itemOrders: cnt("SELECT COUNT(*) as cnt FROM item_orders WHERE is_demo = 1"),
    itemTxns: cnt("SELECT COUNT(*) as cnt FROM item_transactions WHERE is_demo = 1"),
    mapOrders: cnt("SELECT COUNT(*) as cnt FROM map_orders WHERE is_demo = 1"),
    mapTxns: cnt("SELECT COUNT(*) as cnt FROM map_transactions WHERE is_demo = 1"),
    snipingOrders: cnt("SELECT COUNT(*) as cnt FROM sniping_orders WHERE is_demo = 1"),
    snipingTxns: cnt("SELECT COUNT(*) as cnt FROM sniping_transactions WHERE is_demo = 1"),
  };
}

export interface DemoStats {
  enabled: boolean;
  users: number;
  markets: Record<string, boolean>;
  slots: { orders: number; transactions: number };
  items: { orders: number; transactions: number };
  maps: { orders: number; transactions: number };
  sniping: { orders: number; transactions: number };
}

export function getDemoStats(): DemoStats {
  const db = getDb();
  const users = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE is_demo = 1").get() as { cnt: number }).cnt;
  const c = getDemoCounts();
  return {
    enabled: isDemoEnabled(),
    users,
    markets: getDemoMarketConfig(),
    slots: { orders: c.slotOrders, transactions: c.slotTxns },
    items: { orders: c.itemOrders, transactions: c.itemTxns },
    maps: { orders: c.mapOrders, transactions: c.mapTxns },
    sniping: { orders: c.snipingOrders, transactions: c.snipingTxns },
  };
}
