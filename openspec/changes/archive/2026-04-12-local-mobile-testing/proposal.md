## Why

All recent mobile-facing fixes (search bar, photo modal, device images) can only be properly tested on a real phone. The app runs in Docker locally, but currently has no way for a phone on the same WiFi to reach it — the dev server binds to localhost only and there is no documented LAN access path.

## What Changes

- The Vite dev server is configured to bind to `0.0.0.0` so it is reachable on the local network
- A `make` target (or npm script) exposes the LAN URL after startup so the developer knows which address to open on the phone
- The Docker Compose setup (for production-like local testing) is configured to bind to `0.0.0.0` as well
- A short guide is added to the README / CLAUDE.md explaining how to use LAN testing (find IP, open on phone)

## Capabilities

### New Capabilities

- `lan-dev-server`: Vite dev server accessible from any device on the local network, with the LAN URL printed on startup

### Modified Capabilities

<!-- No existing spec-level requirements are changing -->

## Impact

- `vite.config.js` (or `package.json` scripts) — add `--host` flag to the dev server command
- `Makefile` — update `make dev` target (and optionally add `make dev-lan`)
- `public/config.js` / environment handling — no change needed; Overpass fallback already works without a backend
- Docker Compose (`compose.yml` / `compose.prod.yml`) — ensure the app container port binding uses `0.0.0.0`
- `README.md` or `CLAUDE.md` — brief note on LAN testing
