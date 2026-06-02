# Local Development

**Requirements:** Node.js v18+, Docker with the Compose plugin

## Setup

```bash
make install      # install Node dependencies (once)
make up           # start db + PostgREST + nginx
make import       # download Hessen PBF and import Fulda Stadt (454863) — ~300 MB, run once
make dev          # Vite dev server with hot-reload at http://localhost:5173
```

For quick testing without a full import, load the bundled fixture (4 Fulda playgrounds):

```bash
make seed-load
```

Run `make help` to list all available targets.

## Hub mode

The stack includes a second backend (`db2` / `postgrest2`) pre-wired at `/api2/`. Both backends use the Hessen PBF — the importer caches it by filename, so the second import reuses the download.

```bash
# In .env: set APP_MODE=hub (and optionally OSM_RELATION_ID / OSM_RELATION_ID2)
make docker-build
make up
make import       # imports Fulda Stadt (454863) into db  — downloads Hessen PBF (~300 MB)
make import2      # imports Neuhof (454881) into db2 — reuses cached PBF
```

`registry.json` lists both backends (`/api` = Fulda, `/api2` = Neuhof). Open `http://localhost:8080` to see the Hub with two real regions.

## Frontend-only (no database)

When `apiBaseUrl` is empty in `app/public/config.js`, the frontend falls back to the Overpass API — no database required for basic frontend work:

```bash
make install
make dev
```
