## 1. Database schema

- [x] 1.1 Add `importing BOOLEAN NOT NULL DEFAULT false` column to `api.import_status` in `importer/api.sql` (use `ADD COLUMN IF NOT EXISTS`)
- [x] 1.2 Add `'importing', importing` to the `json_build_object` in `get_meta` in `importer/api.sql`
- [x] 1.3 Run `make db-apply` and verify `curl .../rpc/get_meta | jq .importing` returns `false`

## 2. Importer script — importing flag

- [x] 2.1 Add a POSIX EXIT trap in `importer/import.sh` that runs `psql … UPDATE api.import_status SET importing = false WHERE id = 1`
- [x] 2.2 Insert a `psql … UPDATE api.import_status SET importing = true WHERE id = 1` call immediately before the `osm2pgsql` invocation
- [x] 2.3 Confirm the trap fires on both clean exit and simulated error (`kill -TERM`)

## 3. Importer script — daemon mode and startup grace check

- [x] 3.1 Wrap the main import logic in a `run_import` function
- [x] 3.2 Add startup grace check: query `api.import_status.last_import_at`; if within the configured interval, compute next scheduled time and sleep until then; if absent or overdue, proceed immediately. Handle DB unavailability with a short retry loop (max 30 s) before falling back to "run immediately".
- [x] 3.3 Add daemon loop: if `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` are set, after a successful import sleep for a uniformly random duration between the bounds, then loop back to `run_import`. On a failed run, sleep for a short retry interval (≤ 1 hour) before retrying.
- [x] 3.4 Ensure daemon mode never exits with code 0 between runs (loop is infinite); exit code propagates only on unexpected crash.
- [x] 3.5 Verify one-shot behaviour is unchanged when interval vars are absent

## 4. Hub poll pipeline

- [x] 4.1 Update `oci/app/poll-federation.sh` to extract `importing` from `get_meta` and include it in the per-backend entry written to `/federation-status.json` (default `false` if field absent via `jq`'s `// false`)
- [x] 4.2 Verify `/federation-status.json` includes `"importing": false` for all backends during normal operation

## 5. Hub drawer UI

- [x] 5.1 In the hub instances drawer component, read each backend's `importing` field from the federation-status data
- [x] 5.2 Render an "updating" badge (distinct colour from error/down state) next to the backend name when `importing: true`
- [x] 5.3 Confirm no "updating" badge appears when `importing` is `false` or absent

## 6. compose.prod.yml

- [x] 6.1 Change importer `restart: "no"` → `restart: on-failure`
- [x] 6.2 Add `REIMPORT_INTERVAL_MIN_DAYS: ${REIMPORT_INTERVAL_MIN_DAYS:-}` and `REIMPORT_INTERVAL_MAX_DAYS: ${REIMPORT_INTERVAL_MAX_DAYS:-}` to the importer environment (empty default = one-shot mode)
- [x] 6.3 Add `watchtower` service under `profiles: [auto-update]` with `WATCHTOWER_POLL_INTERVAL: 86400`, `WATCHTOWER_CLEANUP: "true"`, `restart: unless-stopped`, and `/var/run/docker.sock` volume mount

## 7. install.sh — auto-update prompt

- [x] 7.1 Add auto-update prompt in the "Optional: infrastructure" section (default yes, shown only for `data-node` and `data-node-ui` modes)
- [x] 7.2 On yes: write `REIMPORT_INTERVAL_MIN_DAYS=2` and `REIMPORT_INTERVAL_MAX_DAYS=10` to `.env`; append `auto-update` to the list of active profiles for the `docker compose up` invocation
- [x] 7.3 On no: omit interval vars from `.env`; after the final "Done!" block print: "Run imports manually: `docker compose run --rm importer`. See `deploy/` for systemd timer units."
- [x] 7.4 In auto-update mode, skip the "Run the OSM import now?" prompt — the daemon will run the first import automatically on container start

## 8. Tests

- [x] 8.1 Add a Playwright test to `tests/hub-pill.spec.js` that stubs `get_meta` with `importing: true` for one backend and asserts the "updating" badge appears in the drawer
- [x] 8.2 Add a scenario that stubs `importing: false` (or omits the field) and asserts no badge

## 9. Documentation

- [x] 9.1 Update `docs/reference/api.md` — add `importing` to the `get_meta` response table
- [x] 9.2 Add a note to `docs/ops/troubleshooting.md` explaining how to manually clear a stuck `importing=true` flag (`UPDATE api.import_status SET importing = false WHERE id = 1`)
- [x] 9.3 Update `docs/ops/configuration.md` — document `REIMPORT_INTERVAL_MIN_DAYS`, `REIMPORT_INTERVAL_MAX_DAYS`, and the `auto-update` compose profile
- [x] 9.4 Update the local-dev guide or ops docs to describe the two scheduling approaches (daemon mode vs systemd) and when to use each
- [ ] 9.5 Close issue #406 in the PR description or release notes, referencing this change
