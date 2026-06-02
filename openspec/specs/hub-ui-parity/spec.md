# hub-ui-parity Specification

## Purpose
TBD - created by archiving change hub-ui-parity. Update Purpose after archive.
## Requirements
### Requirement: Feature parity with standalone

Hub-mode deployments SHALL render the same user-facing feature set as standalone-mode deployments: map, playground detail panel, search bar, filter chips, filter panel, locate button, zoom controls, hover preview, nearby-playground suggestions, data-contribution modal, and responsive mobile bottom-sheet.

#### Scenario: Hub loads with reachable backends

- **WHEN** a user opens a hub deployment and at least one backend is reachable
- **THEN** every standalone-mode widget is rendered and interactive
- **AND** no widget is hidden or disabled solely because `APP_MODE=hub`

#### Scenario: Hub search uses aggregated extent

- **WHEN** a user types a query in the search bar in hub mode
- **THEN** Nominatim is called with `viewbox` equal to the union of all backends' `get_meta.bbox` values
- **AND** if no backend has reported metadata yet, the search falls back to an unbounded query

#### Scenario: Hub initial map fit

- **WHEN** the hub loads and all backends have reported `get_meta`
- **THEN** the map view is fit to the union of their bounding boxes with standard padding
- **AND** if only one backend is registered the view is fit to that backend's bbox

### Requirement: Backend instance visibility

The hub SHALL display a collapsed pill in the bottom-left corner showing the count of registered regions and the summed playground count, expandable into a drawer that lists each backend's name, version, current playground count, and error state.

#### Scenario: Pill shows aggregated counts

- **WHEN** the registry has loaded and every backend has reported a feature count
- **THEN** the pill shows `<N> Regionen · <M> Spielplätze` where N is the backend count and M is the sum across backends

#### Scenario: Pill shows loading state

- **WHEN** the registry is still being fetched
- **THEN** the pill shows a spinner and a localised "loading instances" message

#### Scenario: Pill shows registry error

- **WHEN** the registry fetch fails
- **THEN** the pill shows a warning icon and a localised "registry unreachable" message

#### Scenario: Drawer opens and closes

- **WHEN** the user clicks the pill
- **THEN** a drawer slides up, listing every backend with name, version, count, and status
- **AND** keyboard focus moves into the drawer
- **AND** `aria-expanded=true` is set on the pill
- **WHEN** the user presses ESC, clicks outside the drawer, or clicks the pill again
- **THEN** the drawer collapses and focus returns to the pill

#### Scenario: Scale-line does not overlap the pill

- **WHEN** both the pill and the scale-line are visible in the bottom-left region
- **THEN** the scale-line is rendered below the pill without visual overlap

### Requirement: Deep-link with backend slug

The URL hash SHALL support a `#<slug>/W<osm_id>` form where `<slug>` identifies a backend in `registry.json`. The legacy `#W<osm_id>` form SHALL continue to work.

#### Scenario: Deep-link with slug in hub mode

- **WHEN** a user visits `/#bw/W1234567` on a hub registry containing a backend with `slug: "bw"`
- **THEN** the hub waits for that backend's features to load
- **AND** selects the feature whose `osm_id` equals `1234567` on that backend

#### Scenario: Deep-link without slug in hub mode

- **WHEN** a user visits `/#W1234567` on a hub
- **THEN** the hub searches every loaded backend's features for `osm_id = 1234567`
- **AND** selects the first match found
- **AND** logs a console warning if more than one backend contains that osm_id

#### Scenario: Deep-link in standalone mode ignores slug

- **WHEN** a user visits `/#anything/W1234567` on a standalone instance
- **THEN** the instance selects `osm_id = 1234567` from its single configured backend
- **AND** the slug is ignored with no warning or error

#### Scenario: Selection updates the hash with slug

- **WHEN** a user selects a playground in hub mode and the owning backend has a slug
- **THEN** `location.hash` is set to `#<slug>/W<osm_id>`

#### Scenario: Selection updates the hash without slug

- **WHEN** a user selects a playground in hub mode and the owning backend has no slug
- **THEN** `location.hash` is set to `#W<osm_id>` (legacy form)

### Requirement: Multi-backend nearest-playground search

In hub mode the nearby-playgrounds suggestion feature SHALL aggregate results from all registered backends, deduplicated by `osm_id` and sorted by distance ascending.

#### Scenario: Nearby suggestions span backends

- **WHEN** the user triggers the locate action and a position is obtained in hub mode
- **THEN** each reachable backend's `get_nearest_playgrounds` is called in parallel
- **AND** the merged results are shown, sorted by distance ascending
- **AND** results with duplicate `osm_id` across backends keep only the nearest entry

#### Scenario: Slow or failing backend does not block UI

- **WHEN** one backend's `get_nearest_playgrounds` fails or times out
- **THEN** results from the remaining backends are rendered without blocking user interaction
- **AND** the timeout does not exceed the configured per-backend limit

### Requirement: Generic data-contribution links in hub mode

In hub mode the data-contribution modal SHALL link to the generic OSM wiki page for the `leisure=playground` tag and SHALL NOT show a regional chat link.

#### Scenario: Contribution modal in hub

- **WHEN** the user opens the data-contribution modal in hub mode
- **THEN** the wiki link points to `https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground`
- **AND** no chat link section is rendered

#### Scenario: Contribution modal in standalone unchanged

- **WHEN** the user opens the data-contribution modal in standalone mode
- **THEN** the wiki link uses `regionPlaygroundWikiUrl` from configuration
- **AND** the chat link appears if and only if `regionChatUrl` is configured

### Requirement: Optional slug field in registry.json

A `registry.json` entry MAY include a `slug` string field identifying the backend for deep-link purposes. The field SHALL be optional and SHALL NOT break existing registries that omit it.

#### Scenario: Entry with slug

- **WHEN** a registry entry contains `"slug": "bw"` alongside `name` and `url`
- **THEN** the backend record exposes `slug: "bw"`
- **AND** deep-links of the form `#bw/W<osm_id>` resolve to this backend

#### Scenario: Entry without slug

- **WHEN** a registry entry omits `slug`
- **THEN** the backend record exposes `slug: null`
- **AND** broadcast-search (hash without slug) still works for playgrounds on this backend

#### Scenario: Invalid slug format

- **WHEN** a registry entry contains a `slug` that does not match `[a-z0-9-]+`
- **THEN** the slug is treated as missing
- **AND** a console warning identifies the offending entry by URL

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

