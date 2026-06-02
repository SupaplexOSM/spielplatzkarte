## MODIFIED Requirements

### Requirement: Importer records successful-run timestamp

The importer SHALL record the timestamp of each successful run into a persistent, SQL-queryable location so that downstream clients (federation hub, monitoring tools) can observe data freshness per backend. The importer SHALL also manage the `importing` boolean flag in `api.import_status` around the osm2pgsql phase: set to `true` before the phase starts and cleared unconditionally on script exit.

#### Scenario: Successful run writes a timestamp

- **WHEN** the importer's full pipeline (osm2pgsql + schema apply via `psql … < /api.sql`) completes with exit code 0
- **THEN** the `api.import_status` singleton row is upserted with `last_import_at = now()`
- **AND** `importing` is set back to `false`

> The trigger keys on the *full pipeline* succeeding, not on `osm2pgsql` alone, because the `api.import_status` table is created by the schema-apply step itself. See design D3.

#### Scenario: Failed run does not update timestamp

- **WHEN** the importer exits with a non-zero status, is killed, or aborts at any point in the pipeline (PBF download, osmium prefilter, osm2pgsql, schema apply)
- **THEN** the previous `last_import_at` value is preserved unchanged
- **AND** no partial or speculative timestamp is written
- **AND** `importing` is set to `false` via the EXIT trap

#### Scenario: Singleton integrity enforced at schema level

- **WHEN** any client attempts to `INSERT` a second row into `api.import_status`
- **THEN** the insertion fails with a CHECK violation
- **AND** the existing row is unaffected

## ADDED Requirements

### Requirement: Daemon mode via env-var interval

When `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` are set, the importer SHALL run in daemon mode: execute the full pipeline, sleep for a uniformly random duration between the two bounds, then repeat indefinitely. When neither variable is set the importer runs once and exits (one-shot mode, backward compatible).

#### Scenario: Daemon loops after a successful import

- **GIVEN** `REIMPORT_INTERVAL_MIN_DAYS=2` and `REIMPORT_INTERVAL_MAX_DAYS=10` are set
- **WHEN** the import pipeline completes with exit code 0
- **THEN** the importer sleeps for a random duration between 2 and 10 days
- **AND** after the sleep, it runs the full pipeline again without restarting the container

#### Scenario: Daemon retries after a failed import

- **GIVEN** daemon mode is configured
- **WHEN** the import pipeline exits with a non-zero status
- **THEN** the importer sleeps for a short retry interval (at most 1 hour) before trying again
- **AND** `last_import_at` is NOT updated

#### Scenario: One-shot mode exits after a single run

- **GIVEN** `REIMPORT_INTERVAL_MIN_DAYS` is not set
- **WHEN** the import pipeline completes
- **THEN** the importer exits immediately (existing behaviour preserved)

### Requirement: Skip import if ran recently (startup grace check)

On startup, before the first import, the importer SHALL query `api.import_status.last_import_at`. If the last successful run is within the configured interval window, the importer SHALL sleep until the next scheduled time. If the table is absent or empty, it SHALL run immediately.

#### Scenario: Container restarts shortly after a recent import

- **GIVEN** `last_import_at` is 1 day ago and `REIMPORT_INTERVAL_MIN_DAYS=2`
- **WHEN** the container restarts (e.g. Watchtower image update)
- **THEN** the importer sleeps for `(last_import_at + random_interval) - now` before importing

#### Scenario: Container restarts after interval has elapsed

- **GIVEN** `last_import_at` is 12 days ago and `REIMPORT_INTERVAL_MAX_DAYS=10`
- **WHEN** the container restarts
- **THEN** the importer runs an import immediately

#### Scenario: First-ever run on a fresh database

- **GIVEN** `api.import_status` does not yet exist
- **WHEN** the container starts
- **THEN** the importer runs immediately without raising an error

### Requirement: compose.prod.yml daemon mode and Watchtower support

`compose.prod.yml` SHALL change the importer's restart policy to `on-failure` and expose `REIMPORT_INTERVAL_MIN_DAYS` / `REIMPORT_INTERVAL_MAX_DAYS` as passthrough env vars. A new `watchtower` service under the `auto-update` profile SHALL pull updated images daily.

#### Scenario: Watchtower pulls a new importer image

- **GIVEN** the `auto-update` profile is active
- **WHEN** Watchtower detects a new `spieli-importer:latest` image
- **THEN** it restarts the importer container
- **AND** the startup grace check prevents an immediate re-import if one ran recently
- **AND** the next scheduled run uses the updated `api.sql`

### Requirement: Installer prompts for auto-update preference

`install.sh` SHALL ask data-node operators whether to enable automatic updates (default: yes). Yes writes interval vars to `.env` and starts the `auto-update` profile; no preserves one-shot behaviour and prints manual instructions.

#### Scenario: Operator selects automatic updates

- **WHEN** the operator answers yes at the auto-update prompt
- **THEN** `REIMPORT_INTERVAL_MIN_DAYS=2` and `REIMPORT_INTERVAL_MAX_DAYS=10` are written to `.env`
- **AND** the stack starts with the `auto-update` profile

#### Scenario: Operator selects manual updates

- **WHEN** the operator answers no
- **THEN** no interval vars are written (one-shot mode)
- **AND** `install.sh` prints instructions for running the importer manually
- **AND** notes the systemd units in `deploy/` as a scheduling alternative
