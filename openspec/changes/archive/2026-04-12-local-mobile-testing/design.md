## Context

The app runs in two modes locally:

1. **Vite dev server** (`make dev` / `npm start`) — hot-reload frontend, Overpass fallback for data. Currently binds to `localhost:5173` only, unreachable from other devices.
2. **Docker Compose stack** (`make up`) — full production-like stack: nginx/app on `${APP_PORT:-8080}:80`. Docker's default port-binding already uses `0.0.0.0`, so the stack is *already* reachable at `<host-ip>:8080` from any device on the same network.

The gap is exclusively in the Vite dev server path. A secondary gap is discoverability: no target or output tells the developer what address to open on the phone.

## Goals / Non-Goals

**Goals:**
- Vite dev server accessible from any device on the local network
- A single command prints the LAN URLs (both Vite and Docker stack) so the developer can copy-paste them into the phone browser
- No security risk introduced (LAN-only, not exposed to the internet)

**Non-Goals:**
- Exposing the app to the internet / ngrok / tunnel setup
- Changing how Docker networking works (it already works)
- HTTPS / mDNS / hostname resolution — plain IP is sufficient

## Decisions

### 1. Configure Vite host via `vite.config.js` (not CLI flag)

**Decision:** Add `server: { host: true }` to `vite.config.js`.

**Why over adding `--host` to the npm script?** `vite.config.js` is the canonical place for Vite server config; it keeps `package.json` scripts clean and applies to both `npm start` and `make dev` without duplicating the flag.

`host: true` is equivalent to `0.0.0.0` — Vite will bind on all interfaces and print both `localhost` and the LAN URL on startup automatically.

### 2. Add `make lan-url` helper target

**Decision:** Add a `make lan-url` Makefile target that prints the current machine's LAN IP and both URLs (Vite dev and Docker stack).

**Why?** After `make dev` starts, Vite already prints the LAN URL in the terminal. But for the Docker stack (which runs detached), there is no URL output. A dedicated target gives a consistent, copy-pasteable answer regardless of which stack is running.

Implementation: use `ip route get 1` or `hostname -I` to find the primary LAN IP — both are available on Linux without extra tools.

## Risks / Trade-offs

- [Risk] Vite dev server bound to `0.0.0.0` is reachable by anyone on the same network, not just the developer's phone → Mitigation: acceptable for a local dev workflow; the app has no auth or sensitive data. Document this clearly.
- [Risk] `hostname -I` may return multiple IPs (VPN, Docker bridge, etc.) → Mitigation: take the first non-Docker address, or simply print all and let the user pick.
- [Risk] Firewall rules on the host may block port 5173 → Mitigation: document this in the guide; user can temporarily open the port or use the Docker stack on 8080 instead.
