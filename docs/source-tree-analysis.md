# Source Tree Analysis

Annotated directory tree for the spieli monorepo. Excludes `node_modules`, `dist`, `.git`, and build artefacts.

```
spieli/                            ← Monorepo root
│
├── app/                           ← Svelte 5 frontend (Part: frontend)
│   ├── index.html                 ← Vite entry point
│   ├── vite.config.js             ← Vite build config
│   ├── package.json               ← Frontend deps (Svelte, OL, Bootstrap, Tailwind)
│   ├── postcss.config.js          ← Tailwind PostCSS integration
│   ├── public/                    ← Static assets served by Vite / nginx
│   │   ├── config.js              ← Runtime config (overwritten by docker-entrypoint.sh)
│   │   └── img/                   ← Static images
│   └── src/                       ← Frontend source
│       ├── main.js                ← Entry point — mounts StandaloneApp or HubApp
│       ├── styles/app.css         ← Global styles (Tailwind base + Bootstrap overrides)
│       │
│       ├── lib/                   ← Pure JS modules (no Svelte)
│       │   ├── api.js             ★ All PostgREST HTTP calls — the API client
│       │   ├── config.js          ★ Reads window.APP_CONFIG; exports typed constants
│       │   ├── tieredOrchestrator.js ★ Debounced moveend handler, tier switching, AbortController
│       │   ├── completeness.js    ★ 3-state completeness logic (mirrors api.sql's SQL)
│       │   ├── deeplink.js        ★ URL hash parse/write (#W<osm_id> / #<slug>/W<osm_id>)
│       │   ├── objPlaygroundEquipment.js ★ Single source of truth for all device types
│       │   ├── equipmentGrouping.js ← Groups devices inside playground=structure polygons
│       │   ├── equipmentAttributes.js ← Renders per-device detail HTML from OSM tags
│       │   ├── vectorStyles.js    ← OL style functions (playground fill, equipment points)
│       │   ├── clusterStyle.js    ← Canvas renderer for cluster rings
│       │   ├── i18n.js            ← svelte-i18n setup and locale detection
│       │   ├── panoramax.js       ← Panoramax photo integration helpers
│       │   ├── playgroundHelpers.js ← Misc. feature property helpers
│       │   ├── region.js          ← Region name resolution
│       │   ├── reviews.js         ← Mangrove.reviews API integration
│       │   ├── utils.js           ← Debounce, escapeHtml, misc.
│       │   └── equipmentGrouping.test.js ← Unit tests (run via `make test-unit`)
│       │
│       ├── stores/                ← Svelte writable stores (shared reactive state)
│       │   ├── selection.js       ★ Selected playground feature + backend URL + hash write
│       │   ├── filters.js         ★ Active filter state + matchesFilters() predicate
│       │   ├── tier.js            ★ Active zoom tier ('cluster'|'polygon'|'macro'|null)
│       │   ├── overlayLayer.js    ← Equipment + tree arrays (PlaygroundPanel → Map bridge)
│       │   ├── playgroundSource.js ← Shared OL VectorSource reference (Map → other widgets)
│       │   ├── map.js             ← OL Map instance reference
│       │   └── hubLoading.js      ← Hub fan-out load progress {loaded, total, settling}
│       │
│       ├── components/            ← Shared Svelte UI components
│       │   ├── Map.svelte         ★ OL map, 5 layers, click/hover handlers
│       │   ├── PlaygroundPanel.svelte ★ Detail panel (equipment, trees, POIs, reviews)
│       │   ├── FilterPanel.svelte ← Filter dropdown + layer toggles
│       │   ├── SearchBar.svelte   ← Nominatim location search
│       │   ├── EquipmentList.svelte ← Renders device/pitch/bench lists in detail panel
│       │   ├── HoverPreview.svelte ← Floating card on playground hover (desktop)
│       │   ├── EquipmentTooltip.svelte ← Tooltip on equipment hover
│       │   ├── NearbyPlaygrounds.svelte ← Nearby list (uses playgroundSourceStore)
│       │   ├── LocateButton.svelte ← Geolocation button
│       │   ├── AppShell.svelte    ← Top-level layout shell + deeplink restore
│       │   ├── BottomSheet.svelte ← Mobile bottom sheet
│       │   ├── CompletenessLegend.svelte ← Colour legend
│       │   ├── FilterChips.svelte ← Active filter chip row
│       │   ├── AgeChip.svelte     ← Age range badge
│       │   ├── DataContributionModal.svelte ← "Daten ergänzen" OSM link modal
│       │   ├── MapCompleteLink.svelte ← MapComplete contribution link
│       │   ├── PanoramaxViewer.svelte ← Panoramax photo iframe
│       │   ├── POIPanel.svelte    ← Nearby POIs panel
│       │   ├── ReviewsPanel.svelte ← Mangrove reviews panel
│       │   └── ui/                ← Low-level design system primitives
│       │       ├── Badge.svelte
│       │       ├── Button.svelte
│       │       ├── Card.svelte
│       │       ├── Input.svelte
│       │       └── Sheet.svelte
│       │
│       ├── standalone/            ← Standalone mode root
│       │   └── StandaloneApp.svelte ★ Full standalone layout (sidebar, bottom sheet, etc.)
│       │
│       └── hub/                   ← Hub mode (APP_MODE=hub)
│           ├── HubApp.svelte      ★ Hub layout root
│           ├── hubOrchestrator.js ★ Hub fan-out to all backends, Supercluster merge
│           ├── InstancePanel.svelte ← Backend list drawer
│           ├── InstancePanelDrawer.svelte ← Drawer wrapper
│           ├── MacroView.svelte   ← Country-level macro ring view (zoom ≤ macroMaxZoom)
│           ├── bboxRouter.js      ← Filters backends by viewport bbox
│           ├── fanOut.js          ← Parallel fetch to all matching backends
│           ├── federationHealth.js ← /federation-status.json polling
│           ├── macroRingStyle.js  ← OL style for macro rings
│           ├── osmIdDedup.js      ← Deduplicates features with the same osm_id across backends
│           └── registry.js        ← Fetches and parses registry.json
│
├── db/
│   └── init.sql                   ← One-time DB init: PostGIS, hstore, api schema, web_anon role
│
├── importer/
│   ├── import.sh                  ★ Full import script: download → osmium clip → osm2pgsql → api.sql
│   ├── api.sql                    ★ All PostgREST API functions + playground_stats matview
│   └── Dockerfile                 ← Importer image (osm2pgsql, osmium-tool, psql)
│
│
├── oci/                           ← Docker build contexts
│   ├── app/
│   │   ├── Dockerfile             ← App image (nginx + Svelte build)
│   │   ├── nginx.conf             ← nginx: static serving, /api/ proxy, security headers, CORS
│   │   ├── docker-entrypoint.sh   ★ Startup: writes config.js from env, starts nginx
│   │   └── poll-federation.sh     ← Cron script: polls backends, writes federation-status.json + /metrics
│   └── docker-entrypoint.sh       ← Top-level entrypoint (hub cron setup)
│
├── locales/                       ← Translation files (svelte-i18n format)
│   ├── de.json                    ← German (primary)
│   ├── en.json                    ← English
│   └── cs.json fr.json …         ← Other languages
│
├── deploy/                        ← Systemd units for automated import on Linux hosts
│   ├── spieli-import.service      ← Runs `docker compose run --rm importer`
│   └── spieli-import.timer        ← Weekly trigger (adjust OnCalendar= for your schedule)
│
├── tests/                         ← Playwright E2E tests (run via `make test`)
│   ├── helpers.js                 ★ Shared helpers: injectApiConfig(), stubApiRoutes()
│   ├── smoke.spec.js              ← Basic page load + canvas visibility
│   ├── tiered.spec.js             ← Cluster/polygon tier RPC selection
│   ├── selection.spec.js          ← Playground selection + panel open
│   ├── hash-restore.spec.js       ← Deeplink URL hash restore
│   ├── hub-smoke.spec.js          ← Hub mode basic load
│   ├── hub-multi-backend.spec.js  ← Hub fan-out + Supercluster merge
│   ├── hub-deeplink.spec.js       ← Hub deeplink with backend slug
│   ├── hub-pill.spec.js           ← Instance pill count display
│   ├── hub-federation-health.spec.js ← Federation status polling
│   ├── hub-osm-id-dedup.spec.js   ← Cross-backend osm_id deduplication
│   ├── cluster-position.spec.js   ← Cluster position from member centroids
│   ├── osmIdDedup.spec.js         ← osmIdDedup unit-style test
│   ├── xss.spec.js                ← XSS / injection safety checks
│   └── fixtures/                  ← JSON fixtures for stubbed API responses
│
├── openspec/                      ← Capability specs + archived change decisions
│   ├── specs/                     ← Durable per-capability requirements
│   └── changes/archive/           ← Frozen records of shipped changes (tracked in git)
│
├── .github/workflows/
│   ├── build.yml                  ← Builds app + Docker images; publishes to GHCR on main/tags
│   ├── e2e.yml                    ← Playwright E2E on pull_request + main
│   └── docs.yml                   ← MkDocs build + GitHub Pages deploy
│
├── compose.yml                    ← Dev Docker Compose stack (db, postgrest, app, db2, postgrest2)
├── compose.prod.yml               ← Production Docker Compose (uses :latest images)
├── Makefile                       ← All common operations (make help for full list)
├── playwright.config.js           ← Playwright config (baseURL: localhost:8080)
├── mkdocs.yml                     ← MkDocs config
├── README.md                      ← Brief overview + deploy link
├── CONTRIBUTING.md                ← Contribution workflow (branch → commit → PR)
└── RELEASING.md                   ← Release checklist (version bump → tag → GHCR publish)
```

---

## Entry points

| Scenario | Entry |
|---|---|
| Browser visit | `app/src/main.js` → mounts `StandaloneApp` or `HubApp` |
| Docker container start | `oci/app/docker-entrypoint.sh` → writes `config.js` → starts nginx |
| First data import | `importer/import.sh` → osmium pipeline → osm2pgsql → `api.sql` |
| API function update (no re-import) | `make db-apply` → runs `api.sql` against the running DB |
| Adding a device type | `app/src/lib/objPlaygroundEquipment.js` |
| Adding a sport pitch translation | `locales/en.json` + `locales/de.json` |
| Adding a filter | `app/src/stores/filters.js` + `app/src/lib/api.js` + `importer/api.sql` + `app/src/components/FilterPanel.svelte` |

---

## Integration points

| From | To | Protocol |
|---|---|---|
| Browser | nginx | HTTP |
| nginx | PostgREST | HTTP proxy (`/api/` → `:3000`) |
| PostgREST | PostgreSQL | SQL (pg wire protocol) |
| Hub browser | Data-node nginx | CORS HTTP (`/api/rpc/*`) |
| Importer | Geofabrik | HTTPS download |
| Importer | Nominatim | HTTPS REST (bbox lookup) |
| Frontend | Nominatim | HTTPS REST (search) |
| Frontend | Panoramax | HTTPS iframe + API |
| Frontend | Mangrove.reviews | HTTPS REST (reviews) |
| Frontend | CartoDB | HTTPS (map tiles) |
