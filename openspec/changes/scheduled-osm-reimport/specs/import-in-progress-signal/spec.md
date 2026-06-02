## ADDED Requirements

### Requirement: Importer sets `importing` flag before osm2pgsql runs
The importer SHALL set `api.import_status.importing = true` immediately before invoking osm2pgsql and clear it unconditionally on script exit (success, failure, or signal).

#### Scenario: Flag is true while osm2pgsql is running
- **WHEN** a client calls `/api/rpc/get_meta` while the importer's osm2pgsql phase is active
- **THEN** the response includes `"importing": true`

#### Scenario: Flag is cleared on successful import
- **WHEN** the importer pipeline completes with exit code 0
- **THEN** `api.import_status.importing` is set back to `false`
- **AND** a subsequent call to `/api/rpc/get_meta` returns `"importing": false`

#### Scenario: Flag is cleared when importer exits with an error
- **WHEN** the importer exits with a non-zero status (e.g. osm2pgsql failure, schema-apply error)
- **THEN** `api.import_status.importing` is set to `false` via the shell EXIT trap
- **AND** `last_import_at` is NOT updated (failure does not update the timestamp)

#### Scenario: Flag is cleared when importer receives SIGTERM
- **WHEN** the importer process receives SIGTERM (e.g. `docker stop` during an import)
- **THEN** the shell EXIT trap fires and sets `api.import_status.importing = false`

#### Scenario: Flag is absent before any import has run
- **WHEN** a client calls `/api/rpc/get_meta` on a freshly provisioned backend with an empty `api.import_status` table
- **THEN** `importing` is present in the response with value `false` (column default)

### Requirement: `get_meta` exposes `importing` as a JSON boolean
`api.get_meta` SHALL include an `importing` key in its JSON response whose value reflects the current `api.import_status.importing` column value.

#### Scenario: `get_meta` returns `importing: false` during normal operation
- **WHEN** no import is running and the column holds its default value
- **THEN** `GET /api/rpc/get_meta` returns a JSON object containing `"importing": false`

#### Scenario: `get_meta` returns `importing: true` during an import
- **WHEN** `api.import_status.importing` is `true`
- **THEN** `GET /api/rpc/get_meta` returns a JSON object containing `"importing": true`
