# MH Community Marketplace

A browser extension and server for trading MouseHunt treasure map slots, items, sniping services, and complete maps — with real-time order matching, automated transaction flows, and an admin/moderation panel.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Browser Extension                        │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │   Panel UI   │◄─►│   Service    │◄─►│  Content Script  │  │
│  │   (Preact)   │   │   Worker     │   │  (MH Game Page)  │  │
│  └──────────────┘   └──────┬───────┘   └──────────────────┘  │
└────────────────────────────┼─────────────────────────────────┘
                             │ WebSocket
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                          Server                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  WebSocket   │◄─►│    Orders    │◄─►│    SQLite DB     │  │
│  │   Handler    │   │   Matcher    │   │ (better-sqlite3) │  │
│  └──────────────┘   └──────────────┘   └──────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@mhcm/shared` | Shared TypeScript types, constants, and pricing utilities |
| `@mhcm/server` | WebSocket server, order matching engine, SQLite database |
| `@mhcm/extension` | Chrome/Firefox extension with Preact side panel UI |

## Features

- **Four Marketplaces**: Slot trading, item trading, sniping services, and map trading (unopened/completed)
- **Real-Time Order Book**: Live buy/sell aggregation with WebSocket push updates
- **Order Matching**: Price-time priority engine with MOQ enforcement, tier-aware matching, and cross-price fill logic
- **Automated Transactions**: Multi-step state machines handle invites, transfers, payments, and verifications via game API interception
- **Goal Risk Mitigation**: Buyers warned about difficult remaining goals before committing to a map slot
- **Return Tradables**: Post-completion chest opening and tradable item transfer for supported map types
- **Sniping Service**: Multi-target mouse/item sniping with AFK payment handling and grace periods
- **Tier System**: S/A/B tier classification for map goals with per-map overrides
- **Discord Authentication**: OAuth2 sign-in, requires MouseHunt Discord membership
- **Onboarding Wizard**: Step-by-step guide for new users, admin-configurable
- **Demo Mode**: Isolated test data with runtime toggle for development
- **Admin Panel**: Map/item type management, user moderation, audit log, rate limiting, alerts
- **Moderation Tools**: Mouse/item tier management, group creation, user suspension, risk location config

## Prerequisites

- Node.js 20+
- npm 10+

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Discord OAuth

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to **OAuth2** in the sidebar
4. Copy the **Client ID** and **Client Secret**
5. Add a redirect URI: `http://localhost:3080/api/auth/discord/callback`

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your Discord credentials:
```env
DISCORD_CLIENT_ID=your-client-id
DISCORD_CLIENT_SECRET=your-client-secret
JWT_SECRET=change-me-to-a-random-string

# Optional: set your Discord user ID to become admin on first sign-in
INITIAL_ADMIN_DISCORD_ID=your-discord-user-id
```

### 4. Build all packages

```bash
npm run build
```

### 5. Start the server

```bash
npm run dev:server
```

### 6. Load the extension

**Chrome:**
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `packages/extension/dist/chrome`

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in `packages/extension/dist/firefox`

## Development

### Build individual packages

```bash
npm run build:shared    # Build shared types
npm run build:server    # Build server
npm run build:extension # Build extension
```

### Watch mode

```bash
# Server with hot reload
npm run dev:server

# Extension with rebuild on change
cd packages/extension && npm run dev
```

## Project Structure

```
map-marketplace/
├── packages/
│   ├── shared/              # Shared types (@mhcm/shared)
│   │   └── src/
│   │       ├── types/       # TypeScript interfaces (slots, items, maps, sniping, messages)
│   │       └── pricing.ts   # Fractional pricing utilities (MOQ, totals, formatting)
│   ├── server/              # Backend server (@mhcm/server)
│   │   ├── seed/            # Seed data (mice, maps, FAQ, onboarding)
│   │   └── src/
│   │       ├── db/          # SQLite schema, queries, migrations, seed scripts
│   │       ├── orders/      # Order books and matching engines (4 marketplaces)
│   │       ├── transactions/ # Transaction orchestrators and state machines
│   │       ├── ws/          # WebSocket handlers (domain-split)
│   │       └── http/        # HTTP routes (auth only)
│   └── extension/           # Browser extension (@mhcm/extension)
│       └── src/
│           ├── panel/       # Side panel UI (Preact + Signals)
│           ├── service-worker/ # WebSocket client, message routing, step queue
│           └── content-script/ # Game page integration, XHR interception
├── scripts/                 # Build and code generation scripts
├── .env.example             # Environment template
└── package.json             # Workspace root
```

## Seed Data

The server seeds reference data on first startup:

| File | Description | Source |
|------|-------------|--------|
| `seed/mice.json` | Mouse types with group/tier info | [mouse.rip API](https://api.mouse.rip/mice) |
| `seed/treasure-chests.json` | Map types (treasure chests) | [mouse.rip API](https://api.mouse.rip/items) |
| `seed/mouse-aliases.json` | Alternative mouse names | Manual |
| `seed/faq.md` | FAQ content (compiled to TypeScript during build) | Manual |
| `seed/onboarding.md` | Onboarding wizard steps (compiled during build) | Manual |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3080` |
| `HOST` | Server host | `0.0.0.0` |
| `DB_PATH` | SQLite database path | `./data/marketplace.db` |
| `DEFAULT_SERVER_URL` | WebSocket URL baked into extension build | `wss://...` |
| `DISCORD_CLIENT_ID` | Discord OAuth client ID | (required) |
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret | (required) |
| `DISCORD_REDIRECT_URI` | OAuth callback URL | `http://localhost:3080/api/auth/discord/callback` |
| `MH_DISCORD_GUILD_ID` | MouseHunt Discord server ID | `275500515042385921` |
| `INITIAL_ADMIN_DISCORD_ID` | Discord user ID to auto-promote to admin | (optional) |
| `JWT_SECRET` | Session token signing secret | (required) |
| `JWT_EXPIRY` | Token expiration | `7d` |
| `BCRYPT_ROUNDS` | Hash rounds for password hashing | `12` |
| `ADMIN_SECRET` | Admin API secret | (required) |
| `MH_SERVICE_USERNAME` | MH service account username (for corkboard verification) | (optional) |
| `MH_SERVICE_PASSWORD` | MH service account password (for corkboard verification) | (optional) |
| `AUDIT_LOG_PATH` | Audit log file path | `./data/audit.log` |
| `SSL_KEY_PATH` | TLS private key (enables HTTPS/WSS) | (optional) |
| `SSL_CERT_PATH` | TLS certificate chain | (optional) |

## License

[AGPL-3.0-or-later](LICENSE)