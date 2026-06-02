## ADDED Requirements

### Requirement: Instance drawer shows data freshness and last-reachable

The hub instance drawer SHALL display per-backend data age and last-reachable time sourced from `/federation-status.json`, alongside the existing per-session error and loading indicators.

#### Scenario: Reachable backend shows data age

- **WHEN** the drawer is opened and a backend has `ok: true` in the status endpoint AND its `/federation-status.json` entry carries a non-null `osm_data_age_seconds`
- **THEN** the backend's row shows a humanised OSM-data-age label (e.g. "OSM data: 2 days old" / "OSM-Datenstand: 2 Tage alt") derived from `osm_data_age_seconds`
- **AND** the user-facing display answers "how old is the data I'm looking at?" — distinct from `data_age_seconds`, which answers the operator's "did the cron run?" and is exposed via Prometheus metrics rather than the drawer

#### Scenario: Reachable backend without OSM data age falls back to import age

- **WHEN** the drawer is opened and a backend has `ok: true` but `osm_data_age_seconds` is `null` (e.g. backend's PBF lacked the `osmosis_replication_timestamp` header, or the backend is on a pre-osm-data-age FHE deployment)
- **THEN** the backend's row shows a humanised data-age label derived from `data_age_seconds` (e.g. "data: 5 min old")
- **AND** the fallback is silent — no error, no warning, no UI hint that the OSM-age is missing

#### Scenario: Unreachable backend shows last-reachable

- **WHEN** the drawer is opened and a backend has `ok: false` in the status endpoint but a non-null `last_success`
- **THEN** the backend's row shows a humanised last-reachable label (e.g. "last reachable 8 min ago")

#### Scenario: Never-reachable backend shows explicit state

- **WHEN** the drawer is opened and a backend has `ok: false` with no prior `last_success`
- **THEN** the backend's row shows an explicit "never reachable" label (distinct from a loading state)

#### Scenario: Stale observation banner

- **WHEN** the status endpoint's `generated_at` is older than 2× `poll_interval_seconds`
- **THEN** the drawer shows a subtle banner indicating the server-side observation is stale
- **AND** the in-session browser observation remains the primary source of truth for the current drawer state (the banner is informational, not blocking)

#### Scenario: Status endpoint unavailable

- **WHEN** `/federation-status.json` is unreachable, returns non-2xx, or fails to parse
- **THEN** the drawer renders exactly as it does today — per-session error/loading state from the user's own browser polling, no freshness labels
- **AND** a single warning is logged to the console; no per-poll log spam
