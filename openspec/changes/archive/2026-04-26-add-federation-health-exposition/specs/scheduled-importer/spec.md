## ADDED Requirements

### Requirement: Importer records successful-run timestamp

The importer SHALL record the timestamp of each successful run into a persistent, SQL-queryable location so that downstream clients (federation hub, monitoring tools) can observe data freshness per backend.

#### Scenario: Successful run writes a timestamp

- **WHEN** the importer's full pipeline (osm2pgsql + schema apply via `psql … < /api.sql`) completes with exit code 0
- **THEN** the `api.import_status` singleton row is upserted with `last_import_at = now()`

> The trigger keys on the *full pipeline* succeeding, not on `osm2pgsql` alone, because the `api.import_status` table is created by the schema-apply step itself — an UPSERT issued before that step has run would fail on a fresh database. See design D3.

#### Scenario: Failed run does not update timestamp

- **WHEN** the importer exits with a non-zero status, is killed, or aborts at any point in the pipeline (PBF download, osmium prefilter, osm2pgsql, schema apply)
- **THEN** the previous `last_import_at` value is preserved unchanged
- **AND** no partial or speculative timestamp is written

#### Scenario: Singleton integrity enforced at schema level

- **WHEN** any client attempts to `INSERT` a second row into `api.import_status`
- **THEN** the insertion fails with a CHECK violation
- **AND** the existing row is unaffected
