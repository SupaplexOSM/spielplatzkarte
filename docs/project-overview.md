# Project Overview — spieli

spieli is a free, interactive web map for exploring playgrounds based on OpenStreetMap (OSM) data. It is deployable per-region (city, Kreis, Bundesland) by setting two environment variables (`OSM_RELATION_ID` and `PBF_URL`). Multiple regional instances can be aggregated into a single federated Hub map. The UI is built in Svelte 5; the data layer is PostgreSQL/PostGIS accessed via PostgREST; everything ships as a Docker Compose stack.

---

## At a glance

| Item | Value |
|---|---|
| Current version | `0.4.1-rc` (see `app/package.json`) |
| Primary language | JavaScript / Svelte 5 (frontend), SQL (API layer), Shell (operations) |
| License | GNU GPL v3.0 |
| Origin | Fork of [Berliner Spielplatzkarte](https://github.com/SupaplexOSM/spielplatzkarte) by Alex Seidel |
| Repository | github.com/mfuhrmann/spieli |
| Docs site | mfuhrmann.github.io/spieli |

---

## Architecture in one diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│  Svelte 5 app, OpenLayers map, Bootstrap + Tailwind UI              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP
                ┌────────────��──▼──────────────────┐
                │  nginx (oci/app/nginx.conf)       │
                │  serves static assets             │
                │  writes config.js at startup      │
                │  proxies /api/ → PostgREST         │
                └───────────┬──────────────────────┘
                            │ HTTP (PostgREST)
                ┌───────────▼──────────────────────┐
                │  PostgREST v12                    │
                │  turns SQL functions in the       │
                │  `api` schema into REST endpoints  │
                └───────────┬──────────────────────┘
                            │ SQL
                ┌───────────▼──────────────────────┐
                │  PostgreSQL 16 + PostGIS 3.4      │
                │  pre-loaded by osm2pgsql importer │
                └──────────────────────────────────┘
```

---

## Deployment modes

Two orthogonal switches define how the stack runs:

| `DEPLOY_MODE` | Services started |
|---|---|
| `data-node` | db + PostgREST (no web UI) |
| `ui` | app/nginx only (no database) |
| `data-node-ui` | full stack (default) |

| `APP_MODE` | Frontend behaviour |
|---|---|
| `standalone` | regional map — fetches from one PostgREST backend |
| `hub` | aggregation map — fetches from all backends in `registry.json` |

The most common configuration is `DEPLOY_MODE=data-node-ui` + `APP_MODE=standalone`.

---

## Repository layout

| Path | Role |
|---|---|
| `app/` | Svelte 5 frontend — source in `app/src/` |
| `app/src/components/` | Svelte UI components |
| `app/src/lib/` | Pure JS modules (API client, config, styles, tiered orchestrator) |
| `app/src/stores/` | Svelte writable stores (selection, filters, tier, overlay) |
| `app/src/hub/` | Hub-mode components and orchestrator |
| `app/src/standalone/` | Standalone-mode root component |
| `db/` | PostgreSQL schema initialisation (`init.sql`) |
| `importer/` | osm2pgsql import script + PostgREST API SQL (`api.sql`) |
| `processing/` | Lua rules + SQL scripts used during OSM import |
| `oci/app/` | Docker build context: nginx config, entrypoint, Dockerfile |
| `oci/docker-entrypoint.sh` | Hub-level entrypoint (federation polling cron) |
| `locales/` | Translation files (`*.json`, one per language) |
| `deploy/` | Systemd unit files for scheduled weekly imports on Linux |
| `tests/` | Playwright E2E test suites |
| `openspec/` | Capability specs and archived change decisions |
| `docs/` | MkDocs documentation site source |

---

## Key technologies

| Layer | Technology |
|---|---|
| Map rendering | OpenLayers 10 |
| UI framework | Svelte 5 + Vite 6 |
| Styling | Bootstrap 5 + Tailwind CSS 4 |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| API layer | PostgREST v12 |
| OSM import | osm2pgsql + osmium-tool |
| Web server | nginx |
| Containers | Docker / Docker Compose |
| E2E testing | Playwright |
| Translations | svelte-i18n + Weblate |
| CI/CD | GitHub Actions |

---

## Data flow

```
Geofabrik PBF extract
        │
        ▼
osmium extract (bbox clip)
        │
        ▼
osmium tags-filter (keep playground/tree/pitch/POI tags)
        │
        ▼
osm2pgsql → PostgreSQL tables (planet_osm_point, planet_osm_polygon)
        │
        ▼
api.sql → playground_stats materialized view + api schema functions
        │
        ▼
PostgREST → /api/rpc/* HTTP endpoints
        │
        ▼
Browser → tiered orchestrator → OL cluster layer / polygon layer
```

---

## App modes in detail

### Standalone mode (`APP_MODE=standalone`)

The default. One region, one database. The tiered orchestrator fires on every `moveend`:

- **Zoom ≤ 13** → `get_playground_clusters(z, bbox)` → cluster layer (rings, sized by `complete/partial/missing/restricted` counts)
- **Zoom > 13** → `get_playgrounds_bbox(bbox)` → polygon layer (full GeoJSON polygons, colour-coded by completeness)

Clicking a playground writes `#W<osm_id>` (or `#<slug>/W<osm_id>` in hub mode) to the URL hash and opens `PlaygroundPanel`, which loads equipment, trees, POIs, and reviews.

### Hub mode (`APP_MODE=hub`)

Aggregates multiple regional data-nodes. The hub orchestrator adds a macro view (zoom ≤ `macroMaxZoom`, default 7) rendering one ring per backend from `get_meta`. At higher zooms it fans out to all backends whose bbox intersects the viewport, merges results via Supercluster, and renders the union.

---

## See also

- [Full documentation](index.md)
- [Source tree analysis](source-tree-analysis.md)
- [Architecture reference](reference/architecture.md)
- [API reference](reference/api.md)
