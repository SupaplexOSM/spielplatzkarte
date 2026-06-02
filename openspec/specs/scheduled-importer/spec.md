# scheduled-importer Specification

## Purpose

Keep OSM data and the backend API schema fresh automatically, reducing the maintenance burden for data-node operators. The importer supports two scheduling modes:

1. **Daemon mode** (recommended) — the importer container runs continuously, sleeping between runs for a randomised interval. No host-level scheduler required; the compose stack owns the schedule.
2. **Systemd mode** (alternative) — a systemd service + timer pair triggers `docker compose run --rm importer` on a weekly cadence. For operators who prefer host-level scheduling or already use systemd.

## Requirements

### Requirement: Daemon mode via env-var interval

When `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` are set, the importer SHALL run continuously: execute the full import pipeline, sleep for a uniformly random duration between the two bounds, then repeat. When neither variable is set the importer SHALL run once and exit (backward-compatible one-shot behaviour).

#### Scenario: Daemon mode loops after a successful import

- **GIVEN** `REIMPORT_INTERVAL_MIN_DAYS=2` and `REIMPORT_INTERVAL_MAX_DAYS=10` are set
- **WHEN** the import pipeline completes with exit code 0
- **THEN** the importer sleeps for a random duration between 2 and 10 days (selected uniformly at startup of each sleep)
- **AND** after the sleep, it runs the full pipeline again without restarting the container

#### Scenario: Daemon mode loops after a failed import

- **GIVEN** daemon mode is configured
- **WHEN** the import pipeline exits with a non-zero status
- **THEN** the importer sleeps for a shorter retry interval (at most 1 hour) before trying again
- **AND** `last_import_at` is NOT updated (failed run does not advance the schedule)

#### Scenario: One-shot mode exits after a single run

- **GIVEN** `REIMPORT_INTERVAL_MIN_DAYS` is not set
- **WHEN** the import pipeline completes (success or failure)
- **THEN** the importer exits immediately
- **AND** `docker compose restart: on-failure` handles retries only on non-zero exit

### Requirement: Skip import if ran recently (startup grace check)

On startup, before running the first import, the importer SHALL check `api.import_status.last_import_at` in the database. If the last successful import completed within the configured interval window, the importer SHALL sleep until the next scheduled time rather than importing immediately. If the table does not exist or the row is absent (first-ever run or fresh DB), the importer SHALL run immediately.

This prevents an unplanned import every time the container is restarted (e.g. by Watchtower after an image update) when a run has occurred recently.

#### Scenario: Container restarts shortly after a recent import

- **GIVEN** daemon mode is active and `last_import_at` is 1 day ago with `REIMPORT_INTERVAL_MIN_DAYS=2`
- **WHEN** the container restarts (e.g. image update via Watchtower)
- **THEN** the importer does NOT run an import immediately
- **AND** instead sleeps for approximately `(last_import_at + random_interval) - now`

#### Scenario: Container restarts after interval has elapsed

- **GIVEN** daemon mode is active and `last_import_at` is 12 days ago with `REIMPORT_INTERVAL_MAX_DAYS=10`
- **WHEN** the container restarts
- **THEN** the importer runs an import immediately (overdue)

#### Scenario: First-ever run on a fresh database

- **GIVEN** `api.import_status` does not yet exist (table created by the import itself)
- **WHEN** the container starts
- **THEN** the importer runs the import immediately
- **AND** no error is raised for the absent table

### Requirement: compose.prod.yml supports daemon mode

`compose.prod.yml` SHALL configure the importer service to restart on failure (`restart: on-failure`) and expose `REIMPORT_INTERVAL_MIN_DAYS` / `REIMPORT_INTERVAL_MAX_DAYS` as passthrough environment variables (empty by default = one-shot mode).

#### Scenario: Importer daemon survives a container crash

- **GIVEN** daemon mode is configured and the importer container crashes mid-sleep
- **WHEN** Docker restarts it (via `restart: on-failure`)
- **THEN** the startup grace check runs, determines whether to sleep or import, and continues normally

### Requirement: Optional Watchtower service for image auto-update

`compose.prod.yml` SHALL include a `watchtower` service under the `auto-update` profile. When the profile is active, Watchtower polls Docker Hub/GHCR daily for new importer and app images and restarts updated containers. Operators who prefer manual image control simply omit the `auto-update` profile.

#### Scenario: Watchtower pulls a new importer image

- **GIVEN** the `auto-update` profile is active and a new `spieli-importer:latest` image is available
- **WHEN** Watchtower detects the update
- **THEN** the importer container is restarted with the new image
- **AND** the startup grace check prevents an immediate re-import if one ran recently
- **AND** the next scheduled run uses the new `api.sql` (updated schema + RPCs)

### Requirement: Installer prompts for auto-update preference

`install.sh` SHALL ask data-node operators whether to enable automatic updates during setup. The default answer is yes (recommended). The choice affects which compose profiles are started and which env vars are written to `.env`.

#### Scenario: Operator chooses automatic updates (recommended)

- **WHEN** the operator answers yes (or presses Enter) at the auto-update prompt
- **THEN** `install.sh` writes `REIMPORT_INTERVAL_MIN_DAYS=2` and `REIMPORT_INTERVAL_MAX_DAYS=10` to `.env`
- **AND** starts the stack with the `auto-update` profile (includes Watchtower)
- **AND** the first import runs immediately as the daemon's first iteration

#### Scenario: Operator chooses manual updates

- **WHEN** the operator answers no at the auto-update prompt
- **THEN** `install.sh` does not write interval vars to `.env` (one-shot mode)
- **AND** the stack starts without the `auto-update` profile
- **AND** `install.sh` prints instructions for running the importer manually and notes the systemd units in `deploy/` as a scheduling alternative

### Requirement: Systemd units provided as alternative

The project SHALL continue to ship `deploy/spieli-import.service` and `deploy/spieli-import.timer` for operators who prefer host-level scheduling. Documentation SHALL describe both approaches and note that daemon mode requires no additional host configuration.

#### Scenario: Operator follows the documented systemd install steps

- **WHEN** an operator copies the unit files, edits `WorkingDirectory=` and `User=`, and runs `systemctl enable --now spieli-import.timer`
- **THEN** the timer fires weekly with `Persistent=true` and triggers a one-shot import

### Requirement: Importer records successful-run timestamp

The importer SHALL record the timestamp of each successful run into `api.import_status` so that downstream clients (federation hub, monitoring tools) can observe data freshness per backend.

#### Scenario: Successful run writes a timestamp

- **WHEN** the importer's full pipeline (osm2pgsql + schema apply via `psql … < /api.sql`) completes with exit code 0
- **THEN** the `api.import_status` singleton row is upserted with `last_import_at = now()`

> The trigger keys on the *full pipeline* succeeding, not on `osm2pgsql` alone, because the `api.import_status` table is created by the schema-apply step itself. See design D3.

#### Scenario: Failed run does not update timestamp

- **WHEN** the importer exits with a non-zero status, is killed, or aborts at any point in the pipeline
- **THEN** the previous `last_import_at` value is preserved unchanged
- **AND** no partial or speculative timestamp is written

#### Scenario: Singleton integrity enforced at schema level

- **WHEN** any client attempts to `INSERT` a second row into `api.import_status`
- **THEN** the insertion fails with a CHECK violation
- **AND** the existing row is unaffected
