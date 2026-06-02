## Why

Two related problems motivate this change:

**Hub visibility during imports.** When an OSM re-import is running, the backend's data is partially rebuilt — playgrounds may disappear or appear mid-import, making the map inconsistent. Hub operators and end-users currently have no visibility into this transient state; the hub drawer shows "healthy" even while a backend is actively replacing its dataset.

**Data-node maintenance burden (issue #406).** Data-node operators host a backend for the wider project but should not need to actively manage re-imports, schema updates, or software upgrades. Currently they must manually trigger re-imports, apply API schema changes after a hub release, and update container images themselves. Combining scheduled automatic re-imports with optional image auto-update (Watchtower) removes this burden while keeping manual control available for operators who prefer it.

## What Changes

- `api.import_status` gains a boolean column `importing` (default `false`)
- `importer/import.sh` sets `importing = true` before osm2pgsql runs, clears it on exit, and gains a daemon mode: when `REIMPORT_INTERVAL_MIN_DAYS` / `REIMPORT_INTERVAL_MAX_DAYS` are set it loops after each run, sleeping for a random interval between the bounds
- On daemon-mode startup, the importer checks `last_import_at` and skips an import if one ran recently, preventing unplanned re-imports on container restart (e.g. after a Watchtower image update)
- `get_meta` exposes the `importing` field
- `poll-federation.sh` carries `importing` through into `/federation-status.json`
- Hub drawer shows an "updating" badge next to the affected backend when `importing: true`
- `compose.prod.yml` changes the importer restart policy to `on-failure` and adds a `watchtower` service under the opt-in `auto-update` profile
- `install.sh` gains an auto-update prompt (default: yes) that writes interval vars to `.env` and starts the `auto-update` profile; operators who decline get manual instructions and a pointer to the systemd units in `deploy/`

## Capabilities

### New Capabilities

- `import-in-progress-signal`: Importer marks itself as active in `api.import_status` before the disruptive osm2pgsql phase and clears the flag on success or failure; backends expose this via `get_meta`.

### Modified Capabilities

- `scheduled-importer`: Replace the "configure a systemd timer" approach with a container-native daemon mode. The importer loops internally on a randomised 2–10 day interval (configurable). Systemd units remain as a documented alternative. Adds startup grace check, Watchtower support, and installer auto-update prompt.
- `federation-health-exposition`: Extend the hub's poll/status pipeline to carry `importing` through `/federation-status.json` and surface it in the hub drawer.

## Impact

- **`importer/api.sql`** — new `importing` column on `api.import_status`; `get_meta` adds the field
- **`importer/import.sh`** — importing flag lifecycle, daemon loop, startup grace check
- **`compose.prod.yml`** — importer `restart: on-failure`; new `REIMPORT_INTERVAL_*` env vars; new `watchtower` service under `auto-update` profile
- **`install.sh`** — new auto-update prompt; writes interval vars and starts `auto-update` profile when selected
- **`oci/app/poll-federation.sh`** — pass `importing` through to status JSON
- **`app/src/hub/InstancePanelDrawer.svelte`** (or equivalent) — render "updating" badge when `importing: true`
- **No breaking changes** — `importing` is an additive field; one-shot mode is preserved when interval vars are absent; existing `deploy/` systemd units remain valid
