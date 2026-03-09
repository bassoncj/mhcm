# @mhcm/server

WebSocket server for the MH Community Marketplace. Handles Discord OAuth authentication, four marketplace order books, transaction orchestration, and admin/moderation tooling.

## Running

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm run start
```

## Architecture

```
src/
├── index.ts              # Entry point, HTTP + WebSocket servers
├── config.ts             # Environment configuration
├── settings.ts           # Runtime settings (admin toggles, persisted in DB)
├── audit.ts              # Audit logging
├── drain.ts              # Graceful shutdown
├── xhr-logger.ts         # XHR logging for debugging
├── auth/
│   ├── sessions.ts       # JWT handling
│   ├── middleware.ts     # HTTP auth middleware
│   └── mh-client.ts      # MH corkboard verification (service account + proxy)
├── db/
│   ├── connection.ts     # SQLite connection + migration runner
│   ├── schema.ts         # Table definitions (programmatic)
│   ├── schema.sql        # Reference schema
│   ├── migrations/       # Schema migrations (core, slots, sniping, items, maps, risk, index)
│   ├── queries/          # Query functions by domain (44 files)
│   └── seed-*.ts         # Seed scripts (mice, maps, items, scrolls, ranks, environments, prices)
├── orders/               # Order books and matchers (one pair per marketplace)
│   ├── slot-book.ts      # Slot order CRUD + validation
│   ├── slot-matcher.ts   # Slot price-time priority matching
│   ├── sniping-book.ts
│   ├── sniping-matcher.ts
│   ├── item-book.ts
│   ├── item-matcher.ts
│   ├── map-book.ts
│   └── map-matcher.ts
├── transactions/         # Transaction state machines
│   ├── slot-orchestrator.ts
│   ├── sniping-orchestrator.ts
│   ├── item-orchestrator.ts
│   ├── map-orchestrator.ts
│   ├── verify-utils.ts       # Cross-verification (3 attempts, exponential backoff, park-on-timeout)
│   └── risk-check-utils.ts   # Goal risk evaluation (shared)
├── maps/
│   └── catalog.ts        # Map type catalog management, auto-learning
├── demo/
│   ├── demo-mode.ts      # Demo mode toggle
│   └── seed-demo-data.ts # Demo data generation
├── util/
│   ├── rate-limit.ts     # Token bucket rate limiting (per-user WS, per-IP HTTP)
│   └── group-thumb.ts    # Group thumbnail generation
├── ws/
│   ├── server.ts         # WebSocket server setup, ping/pong
│   ├── connections.ts    # Connection state, active maps, matcher exclusions
│   ├── handlers.ts       # Message router → domain handlers
│   └── handlers/         # Domain-split handlers (shared, slot, sniping, item, map, admin, mod)
│                         # admin and mod each backed by domain sub-files (5 + 4 files)
└── http/
    ├── router.ts         # Route dispatcher
    └── routes/           # Route handlers (auth only – all other operations are WS)
```

## Database

SQLite via `better-sqlite3` (synchronous API). Schema defined in `db/schema.ts`, migrations in `db/migrations/`.

### Demo Data

Isolated via `is_demo = 1` flag on all order/transaction/price_history tables (16 tables across 4 marketplaces). Two filtering modes:

- **Matchers**: Hardcoded `AND is_demo = 0` (demo orders never match)
- **Display queries**: Toggle-dependent `demoOrderFilter()` / `demoTxnFilter()`

## Order Matching

Each marketplace has a book (CRUD + validation) and matcher (price-time priority):

1. Buy orders sorted by price DESC, created_at ASC
2. Sell orders sorted by price ASC, created_at ASC
3. Match when buy price >= sell price, execute at seller's ask
4. Additional constraints per marketplace: tier compatibility (slots), MOQ enforcement (items), map class exclusion (maps), multi-target bundling (sniping)