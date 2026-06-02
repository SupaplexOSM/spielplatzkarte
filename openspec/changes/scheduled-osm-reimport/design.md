## Context

The spieli importer runs `osm2pgsql --slim --drop`, which drops and recreates the `planet_osm_*` tables in the `public` schema. During this phase (which can take several minutes on a real region PBF), the backend's playground data is partially absent or inconsistent. The `api` schema (including `api.import_status`) lives separately and remains fully queryable during the osm2pgsql run.

The hub polls each backend's `/api/rpc/get_meta` every 60 seconds via `poll-federation.sh` and writes `/federation-status.json`. The hub UI reads this file and renders per-backend status in the drawer. The plumbing exists; it just needs an `importing` flag to flow through it.

This change also addresses issue #406 (auto-update for data nodes): data-node operators should not need to manually trigger re-imports, apply schema changes, or update container images. The daemon mode and Watchtower profile together eliminate that burden while keeping manual control available.

## Goals / Non-Goals

**Goals:**
- Surface an `importing: true` signal in `get_meta` while osm2pgsql is running
- Carry that flag through to `/federation-status.json` and the hub drawer
- Clear the flag unconditionally on importer exit (success or failure)
- Enable automatic, recurring OSM re-imports via container-native daemon mode
- Prevent unplanned re-imports when the container restarts for unrelated reasons (e.g. image update)
- Provide an opt-in Watchtower profile for automatic image and schema updates
- Wire the auto-update choice into `install.sh` so operators set it once at install time
- Leave all existing clients unaffected (additive-only changes)

**Non-Goals:**
- Progress reporting (percentage complete, ETA)
- Pausing hub requests or blocking user interactions during import
- Changing the PBF source selection algorithm
- Removing the `deploy/` systemd units (kept as alternative for existing users)

## Decisions

### D1 — Column on `api.import_status`, not a separate table

The `importing` flag is a property of the same singleton that already holds `last_import_at`. Adding it as a column avoids a join, keeps `get_meta` a single-table read, and reuses the existing `ON CONFLICT (id) DO UPDATE` UPSERT pattern. No new table or schema migration strategy is needed — the column is added by `api.sql` which is re-applied on every `make db-apply` / import run anyway (idempotent DDL via `CREATE TABLE IF NOT EXISTS … ADD COLUMN IF NOT EXISTS`).

### D2 — Set flag with a bare `psql` call before osm2pgsql, clear it in an EXIT trap

`import.sh` already exports `PGPASSWORD` and has `set -e`. The flag must be cleared even when the script exits early (killed, network error, SQL error). Using a POSIX `trap 'psql … SET importing=false' EXIT` ensures the flag is cleared on any exit path, including `kill`. The flag is set to `true` immediately before the osm2pgsql invocation (not at script start) so the pre-flight validation and PBF download phases do not trigger the "updating" badge unnecessarily.

**Alternative considered**: clear the flag only on success (in a separate step after the schema apply). Rejected because a killed or crashed importer would leave `importing=true` indefinitely, misleading users.

### D3 — `get_meta` exposes `importing` as a JSON boolean

`get_meta` already builds a `json_build_object`; adding `'importing', importing` is a one-liner. No new RPC or schema change. The hub's existing `/api/rpc/get_meta` call picks it up transparently.

### D4 — Hub drawer shows a pill/badge, not an error state

`importing: true` is not an error — the backend is healthy but temporarily refreshing. The drawer already has `instance-badge` elements (e.g. for version). An "updating" badge (distinct colour from the error indicator) is the appropriate treatment. The hub UI must handle `importing` being absent (`undefined`) for backward-compatible operation against older backends.

### D5 — `poll-federation.sh` passes `importing` through to status JSON

The poll script already extracts fields from `get_meta` via `jq`. Adding `importing` to the extracted object requires a one-line `jq` change. The `/federation-status.json` schema gains an optional `importing` boolean per backend entry.

### D6 — Daemon mode in the container, not a host-level scheduler

**Options considered:**
- Systemd service + timer (already shipped in `deploy/`)
- External scheduler container (ofelia, etc.)
- Importer container with a built-in sleep loop

The daemon-mode loop in `import.sh` is chosen as the primary approach because it requires no host configuration, works on any OS with Docker, and is entirely self-contained in the compose stack. The systemd units in `deploy/` remain for operators who already have them configured; they are not removed.

The restart policy for the importer in `compose.prod.yml` changes from `restart: "no"` to `restart: on-failure`. In daemon mode the script loops forever (never exits 0), so `on-failure` only fires on an unexpected crash. In one-shot mode the script exits 0 on success — `on-failure` does nothing, preserving the existing behaviour.

### D7 — Startup grace check reads `last_import_at` before the first run

When the importer container restarts (e.g. after a Watchtower image update), a naïve daemon would immediately trigger a re-import regardless of when the last one ran. Instead, on startup the script queries `api.import_status.last_import_at`:

- If absent (fresh DB, table not yet created): run immediately.
- If within the configured interval: sleep for `(last_import_at + random_interval) - now`.
- If overdue: run immediately.

The DB query may fail if PostgREST isn't ready yet; the script retries with a short backoff (up to 30 seconds) before giving up and treating the absence as "run immediately."

**Why a random interval and not a fixed time?** Random jitter between `MIN` and `MAX` days prevents thundering-herd behaviour when many data-nodes are deployed from the same installer defaults. Each node drifts onto its own schedule naturally.

### D8 — Watchtower as opt-in `auto-update` compose profile

Watchtower requires mounting `/var/run/docker.sock`, which is a privilege escalation vector. Making it opt-in (profile `auto-update`) means operators who don't want it simply omit the profile — it is never started by default. The Watchtower service polls daily (`WATCHTOWER_POLL_INTERVAL: 86400`), which is sufficient given the startup grace check (D7) absorbs the restart without triggering an immediate re-import.

**Why not recommend external Watchtower?** Bundling it in `compose.prod.yml` means data-node operators get it with one installer prompt answer, with no additional research required.

### D9 — `install.sh` auto-update prompt, default yes

The installer already walks operators through deployment mode, region, and infrastructure choices. Adding one more question — "Automatically keep data and software up to date?" — at the end of the infrastructure section is consistent with the existing flow. Defaulting to yes (recommended) means the low-maintenance path is the easy path. Operators who choose no receive:
- A reminder to run `docker compose run --rm importer` periodically
- A pointer to `deploy/spieli-import.service` and `deploy/spieli-import.timer` for host-level scheduling

## Risks / Trade-offs

- **Race between poll and import start**: If the importer sets `importing=true` between two hub polls, the hub sees the "updating" state for up to 60 seconds after the import actually started. Acceptable — the signal is advisory, not transactional.
- **Stale `importing=true` if container is SIGKILL'd before the EXIT trap fires**: The trap fires on SIGTERM and normal exits; SIGKILL bypasses it. In practice, `docker compose` sends SIGTERM first. Operators can manually clear with `psql -c "UPDATE api.import_status SET importing=false WHERE id=1"`. Documented in ops/troubleshooting.
- **Old backends without `importing` field**: Hub must treat a missing or null `importing` as `false`. `jq` default (`// false`) handles this.
- **Watchtower Docker socket exposure**: Mitigated by making Watchtower opt-in and documenting the privilege implication. Operators on high-security hosts can use the systemd timer + manual image pulls instead.
- **Very long sleep in daemon mode**: The importer container sleeps for up to 10 days. Docker's `restart: on-failure` only helps if the container crashes — it won't re-run a healthy sleeping container that has somehow become stuck. Operators can force an early re-import by restarting the container (`docker compose restart importer`).

## Migration Plan

1. Deploy updated `api.sql` via `make db-apply` (adds `importing` column, `get_meta` exposes it). No data loss; existing rows get `importing = false` from the column default.
2. Deploy updated `import.sh` (flag lifecycle + daemon loop + startup grace check). No restart required for existing one-shot users.
3. Deploy updated `compose.prod.yml` (restart policy + Watchtower service). Existing deployments that don't set interval vars continue to work in one-shot mode.
4. Deploy updated `install.sh`. Existing `.env` files are not affected; the new vars are absent, preserving one-shot behaviour.
5. Deploy updated hub container image (`poll-federation.sh` + drawer badge). Hub immediately starts carrying `importing` in `/federation-status.json`.
6. Rollback: re-run `make db-apply` with the old `api.sql`; the column stays (harmless) but `get_meta` no longer emits it; hub silently treats absence as `false`.
