# @mhcm/extension

Browser extension for the MH Community Marketplace. Provides the trading UI as a side panel and integrates with the MouseHunt game page via content scripts.

## Building

```bash
# Chrome (default)
npm run build

# Firefox
npm run build:firefox

# Both
npm run build:all

# Watch mode (Chrome)
npm run dev
```

Output goes to `dist/chrome` or `dist/firefox`.

## Loading in Browser

**Chrome:**
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `dist/chrome`

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in `dist/firefox`

## Architecture

```
src/
├── content-script/          # Injected into game page
│   ├── index.ts             # Entry point
│   ├── bridge.ts            # Panel ↔ main world communication
│   ├── main-world.ts        # Injected into page context (XHR interception, game state)
│   ├── game-api.ts          # MH game API wrappers (invite, transfer, leave, etc.)
│   └── panel-frame.ts       # Side panel iframe management
├── service-worker/          # Background service worker
│   ├── index.ts             # Entry point, message routing, step queue
│   ├── ws-client.ts         # WebSocket connection to server
│   └── state.ts             # Cached state (active maps, config, onboarding)
├── panel/                   # Side panel UI (Preact)
│   ├── app.tsx              # Main app component, auth gate, routing
│   ├── components/
│   │   ├── slots/           # Slot marketplace (order book, create order, home, selector)
│   │   ├── sniping/         # Sniping marketplace (wizard, selectors, order book, home)
│   │   ├── items/           # Item marketplace (order book, create order, home, selector)
│   │   ├── maps/            # Map marketplace (order book, create order, home, selector)
│   │   ├── transactions/    # Transaction status displays (one per marketplace + history)
│   │   ├── auth/            # Login, register, MH account linking, settings fix
│   │   ├── admin/           # Admin dashboard, alerts manager, audit log
│   │   ├── moderation/      # Moderation panel, mouse tiers, item moderation, user list
│   │   ├── notifications/   # Notifications view
│   │   ├── onboarding/      # Onboarding wizard, doodle background
│   │   └── common/          # Shared components (stepper, modals, icons, charts, toasts, etc.)
│   ├── hooks/
│   │   ├── useServiceWorker.ts    # SW message router
│   │   ├── useAuth.ts             # Authentication hook
│   │   └── message-handlers/      # Domain-split message handlers (7 files)
│   ├── utils/               # Shared panel utilities (format, markdown)
│   ├── signals/             # Preact Signals state (17 files, one per domain)
│   ├── styles/              # CSS split by domain (20 files, imported via main.css)
│   ├── data/                # Generated data (FAQ, onboarding content)
│   └── platform/            # Browser API abstraction
├── options/                 # Extension options page
├── shared/                  # Shared utilities (messaging types, constants)
├── manifest.chrome.json
└── manifest.firefox.json
```

## Communication Flow

```
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│  Panel UI   │◄────────►│   Service   │◄────────►│   Server    │
│  (iframe)   │  chrome   │   Worker    │ WebSocket│             │
└──────┬──────┘ messages  └─────────────┘          └─────────────┘
       │
       │ postMessage
       ▼
┌─────────────┐          ┌─────────────┐
│   Content   │◄────────►│  Main World │
│   Script    │ postMsg   │  (injected) │
└─────────────┘          └──────┬──────┘
                                │
                                │ MH game APIs
                                ▼
                         ┌─────────────┐
                         │  MouseHunt  │
                         │  Game Page  │
                         └─────────────┘
```

## State Management

Uses [Preact Signals](https://preactjs.com/guide/v10/signals/) for reactive state. One signal file per domain:

| Signal File | Purpose |
|-------------|---------|
| `auth.ts` | User session, login state |
| `connection.ts` | WebSocket connection status |
| `slots.ts` | Slot order book, map types, user orders |
| `sniping.ts` | Sniping order book, mouse/item targets |
| `items.ts` | Item order book, item types |
| `maps.ts` | Map order book, map types |
| `game-state.ts` | Game page data (active maps, user info) |
| `admin.ts` | Admin panel state |
| `moderation.ts` | Moderation panel state |
| `onboarding.ts` | Onboarding wizard progress |
| `risk-check.ts` | Goal risk check prompts |
| `rt-confirm.ts` | Return tradables confirmation |
| `alerts.ts` | System alerts |
| `beta.ts` | Beta access state |
| `notifications.ts` | User notifications |
| `theme.ts` | Light/dark theme |
| `toast.ts` | Toast notifications |

## Styling

CSS split by domain into 20 files, imported via `styles/main.css`. Theme variables defined in `variables.css` with light/dark mode support via `[data-theme="light"]`.