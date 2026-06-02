# Tech Stack

## Components

| Component | Technology | Version | Role |
|---|---|---|---|
| Map rendering | [OpenLayers](https://openlayers.org/) | 10.x | Vector/tile layers, cluster rendering, click/hover handling |
| UI framework | [Svelte](https://svelte.dev/) | 5.x | Reactive components, store-based state |
| Build tool | [Vite](https://vitejs.dev/) | 6.x | Dev server, production bundler |
| Styling | [Bootstrap](https://getbootstrap.com/) | 5.x | Component classes (buttons, cards, modals) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) | 4.x | Utility classes, layout |
| Icons | [lucide-svelte](https://lucide.dev/) | 0.4x | SVG icon set |
| Cluster merging | [Supercluster](https://github.com/mapbox/supercluster) | 8.x | Hub mode: client-side kd-tree merge of per-backend clusters |
| Translations | [svelte-i18n](https://github.com/kaisermann/svelte-i18n) | 4.x | ICU message format, runtime locale switching |
| Database | [PostgreSQL](https://www.postgresql.org/) | 16 | Relational store for playground data |
| Spatial extension | [PostGIS](https://postgis.net/) | 3.4 | Geometry types, spatial functions (ST_Within, ST_DWithin, …) |
| API layer | [PostgREST](https://postgrest.org/) | v12 | Auto-generates HTTP endpoints from `api` schema SQL functions |
| OSM importer | [osm2pgsql](https://osm2pgsql.org/) | — | Reads PBF → PostgreSQL; uses Lua transform rules |
| Pre-filter | [osmium-tool](https://osmcode.org/osmium-tool/) | — | Bbox clip + tag filter before osm2pgsql (reduces ~300 MB → ~5 MB) |
| Web server | [nginx](https://nginx.org/) | — | Serves static build, proxies `/api/`, security headers, CORS |
| Containers | Docker / Docker Compose | — | Packaging, orchestration, profiles |
| E2E testing | [Playwright](https://playwright.dev/) | 1.x | Browser automation tests |
| CI/CD | GitHub Actions | — | Build gate, E2E tests, Docker image publishing (GHCR) |
| Translations platform | [Weblate](https://hosted.weblate.org) | — | Community translation management |

## Why this stack

**OpenLayers over Leaflet/MapLibre GL:** OpenLayers has a mature vector layer API with full control over canvas rendering — critical for the custom cluster ring style and the equipment/tree overlay layers. It also handles EPSG:3857/EPSG:4326 reprojection natively, which simplifies the bbox-parameter API contract.

**PostgREST over a custom API server:** The entire data layer is SQL functions. PostgREST exposes them as HTTP endpoints automatically — no custom backend code to maintain. Schema changes are applied by re-running `api.sql` with no service restarts beyond a `NOTIFY pgrst, 'reload schema'`.

**osm2pgsql + osmium:** osm2pgsql is the standard tool for the OSM → PostgreSQL pipeline and has active maintenance. osmium handles the pre-filter step (bbox + tag filtering) that reduces import time from minutes to seconds by giving osm2pgsql a small, focused PBF instead of a full Bundesland extract.

**Svelte 5 over React/Vue:** Svelte compiles to vanilla JS with minimal runtime overhead — important for a map-heavy app where the OL canvas is doing most of the work. The reactive store model maps naturally to "map state → UI state" flows. The app was started on Svelte 4 and migrated to Svelte 5; it still uses legacy stores rather than runes in most places.

**PostgreSQL + PostGIS over a dedicated geo database:** PostGIS is the industry standard for OSM → relational pipelines, well-tested with osm2pgsql, and gives full SQL expressiveness for the aggregation queries (cluster buckets, completeness scoring, region scoping). No separate geo service needed.

## Known limitations / future work

- **i18n partial** — svelte-i18n is integrated but device names in `objPlaygroundEquipment.js` are still German-only. Full i18n is tracked in epic #157.
- **Svelte stores vs runes** — the app uses Svelte 4-style writable stores. Migration to Svelte 5 runes is desirable but not yet done.
- **`unsafe-inline` in CSP** — Bootstrap and OpenLayers require inline styles. A nonce-based approach would tighten the CSP but requires changes to the nginx entrypoint.
- **No server-side rendering** — the app is a pure client-side SPA. SEO and initial paint performance are limited by bundle load time.
