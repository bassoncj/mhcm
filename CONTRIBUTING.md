# Contributing

Thanks for your interest in contributing to MH Community Marketplace!

## Getting Started

1. Fork and clone the repo
2. `npm install` to install dependencies
3. `cp .env.example .env` and fill in your Discord OAuth credentials (see [README](README.md))
4. `npm run build` to build all packages
5. `npm run dev:server` to start the development server
6. Load the extension from `packages/extension/dist/chrome` (see README for browser-specific instructions)

## Project Structure

This is a monorepo with three packages:

- **`packages/shared`** – Types, constants, and pricing utilities shared between server and extension
- **`packages/server`** – Node.js backend with WebSocket handlers, order matching, and SQLite
- **`packages/extension`** – Browser extension with Preact UI, service worker, and content scripts

Build order matters: `shared` must build before `server` and `extension`. The root `npm run build` handles this automatically.

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Build all packages to verify: `npm run build`
4. Test manually in the browser with the extension loaded
5. Open a pull request with a clear description of what changed and why

## Code Style

- TypeScript throughout – no `any` unless absolutely necessary
- Preact with Signals for UI state (not React)
- SQLite queries are synchronous (better-sqlite3)
- Keep imports organized: external packages first, then internal
- Prefer editing existing files over creating new ones

## Reporting Bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Browser and extension version

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0-or-later](LICENSE) license.