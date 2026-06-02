## Why

spieli deployments require OSM data to be kept fresh, but the importer must currently be triggered manually. Operators need a drop-in scheduling solution so data is updated automatically without custom cron jobs or manual intervention.

## What Changes

- Add `deploy/spieli-import.service` — a systemd service unit that runs `docker compose run --rm importer` in the project directory, picking up credentials from `.env`
- Add `deploy/spieli-import.timer` — a systemd timer unit that fires the service weekly (`OnCalendar=weekly`) and is `Persistent=true` so missed runs are caught on next boot
- Document the install/enable procedure in `CLAUDE.md`

## Capabilities

### New Capabilities
- `scheduled-importer`: Automated weekly OSM data import via systemd service + timer unit pair

### Modified Capabilities

## Impact

- New files under `deploy/` (no changes to existing source code)
- Operators must have systemd available on the host (standard on most Linux servers)
- Requires the project to be checked out at a known path on the server (set via `WorkingDirectory=` in the service unit)
- `.env` must exist at the project root (already required for `make up`)
