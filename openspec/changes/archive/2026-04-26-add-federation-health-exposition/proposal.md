## Why

The federation architecture shipped in v0.2.0 has no way to answer operator questions like "is the Berlin backend reachable from the hub?", "when did this region last import data?", or "which backends are the slowest?" Every answer lives transiently in a user's browser memory or is unavailable entirely.

Before the first external backend operator is onboarded (i.e. before backend #2 is run by someone other than the hub operator), the federation needs a minimum-viable observation hook so that (a) outages can be detected without a support ticket, (b) stale data is visible, and (c) operators using their own Prometheus/Grafana stacks have a scrape target.

This proposal delivers exactly that minimum — covering importer-failure and backend-down-unnoticed directly, giving a hook for latency monitoring via BYO Prometheus, and explicitly deferring frontend error reporting, distributed tracing, and in-repo dashboards to future proposals.

## What Changes

- **Backend (per data-node)**:
    - `importer/import.sh` records **two** timestamps after each successful osm2pgsql + schema-apply run, persisted in `api.import_status`:
        - `last_import_at` (always populated) — when our importer ran. Operator-facing: "is the cron healthy?"
        - `osm_data_timestamp` (populated when the source PBF carries an `osmosis_replication_timestamp` header; null otherwise) — when OSM produced the data this backend serves. User-facing: "how old is the data I'm looking at?"
        Both are read into `api.get_meta`'s response object alongside their derived `*_age_seconds` integers. The two timestamps diverge whenever the importer runs more often than the source PBF refreshes — the importer cron may run hourly against a Geofabrik extract that refreshes weekly, so `last_import_at` reads "5 min ago" while the OSM data itself is up to a week old.
    - The UPSERT runs *after* `api.sql` is applied, since the `api.import_status` table is created in that schema apply step (or moves to `db/init.sql` if we'd rather not couple the timestamp to the api.sql apply path — see design D3).
    - `api.get_meta` response gains four new fields: `last_import_at`, `data_age_seconds`, `osm_data_timestamp`, `osm_data_age_seconds`. The function already uses `region`/`bbox`/`counts` CTEs in `SECURITY DEFINER`; the addition is a new `import_status` CTE wired into the existing `json_build_object` output.

- **Hub container**:
    - Poll script (busybox cron, every 60 seconds) reads `registry.json`, fetches `get_meta` from each backend, records reachability + latency + data age.
    - Output written to two files served by the existing nginx:
        - `/federation-status.json` — human-readable rollup (per-backend status, last success, latency sample, data age, `generated_at`).
        - `/metrics` — the same data in Prometheus text exposition format.
    - Hub container image gains `busybox-suid` (or equivalent cron provider) and the poll script (no new compose services).

- **Hub UI**:
    - `app/src/hub/federationHealth.js` already exists as a stub — `isBackendHealthy()` always returns true and `hubOrchestrator.js` already calls `filterHealthy(selectBackends(...))` on every fan-out (wired by the archived `add-federated-playground-clustering` change). This change replaces the stub with a real implementation that polls `/federation-status.json`, merges per-backend status into the existing `backends` store, and surfaces freshness in `InstancePanelDrawer.svelte` — no new integration points in the orchestrator, no signature changes for `filterHealthy()`.
    - The drawer surfaces `osm_data_age_seconds` (user-facing: "OSM data: 2 days old"), falling back silently to `data_age_seconds` when the source PBF lacked the `osmosis_replication_timestamp` header. The operator-facing `data_age_seconds` is still exposed via Prometheus (`spielplatz_backend_data_age_seconds`) so monitoring dashboards can detect stuck cron jobs without UI noise.

- **Docs**:
    - New page `docs/ops/monitoring.md` — three recipes: (a) external uptime monitor on `/federation-status.json`, (b) BYO Prometheus scrape of `/metrics`, (c) Sentry free tier for frontend errors (link only).
    - `federation.md` and `registry-json.md` cross-link the new page.
    - `docs/reference/api.md` already carries a breadcrumb under `get_meta()` (".. moved to add-federation-health-exposition .."); remove on archive.

Out of scope (explicit non-goals):

- In-repo Grafana dashboards, alerting rules, or Prometheus config.
- Frontend error reporting or RUM wired in-repo.
- Distributed tracing (OpenTelemetry).
- Multi-hub coordination.
- Sidecar service or database for observation history.

## Capabilities

### New Capabilities

- `federation-health-exposition`: Hub-side polling and exposition of per-backend federation health via `/federation-status.json` and `/metrics`, plus the `last_import_at` field on backend `get_meta` responses.

### Modified Capabilities

- `scheduled-importer`: importer records a persistent last-successful-run timestamp after each import.
- `hub-ui-parity`: instance drawer displays data age and last-reachable timestamps from the federation-status endpoint.

## Impact

- `importer/api.sql` — new `api.import_status` table; `get_meta` adds an `import_status` CTE and projects `last_import_at` + `data_age_seconds` into the existing `json_build_object`.
- `importer/import.sh` — appends a final "mark import successful" step that UPSERTs `api.import_status` with `now()` after `psql … < /api.sql` returns 0. (The current sequence is: PostgreSQL wait → PBF download → osmium prefilter+tags-filter → osm2pgsql → apply api.sql → NOTIFY pgrst — the new UPSERT slots in between "apply api.sql" and "NOTIFY".)
- `oci/app/Dockerfile` — gains cron provider (`busybox-suid` or `dcron`).
- `oci/app/poll-federation.sh` — new poll script.
- `oci/app/docker-entrypoint.sh` — backgrounds the cron daemon before `exec nginx -g 'daemon off;'`. (Note: the file is `docker-entrypoint.sh`, not `docker-entrypoint.app.sh`.)
- `oci/app/nginx.conf` — adds `location = /metrics` (text/plain content type), CORS on `/federation-status.json` mirroring the existing `/api/` and `/version.json` blocks.
- `app/src/hub/federationHealth.js` — replaces the `isBackendHealthy` stub with a real poll/fetch of `/federation-status.json`. The orchestrator's `filterHealthy(...)` call site stays unchanged.
- `app/src/hub/registry.js` — extends the per-backend store entries with `dataAge`, `lastReachable`, `observationStale` fields populated from the federation-status endpoint.
- `app/src/hub/InstancePanelDrawer.svelte` — renders freshness labels next to the existing version/playground-count row.
- `dev/seed/seed.sql` — populates `api.import_status` with `now() - interval '3 days'` so dev experience matches production.
- `docs/ops/monitoring.md` — new file.
- `docs/reference/federation.md`, `docs/reference/registry-json.md`, `docs/reference/api.md` — cross-links + remove the existing breadcrumb under `get_meta()`.
- `mkdocs.yml` — nav entry.
- `compose.yml` — no changes.
