## ADDED Requirements

### Requirement: Cluster tier respects active filters
When one or more playground filters are active in `filterStore`, the cluster tier SHALL request only matching playgrounds from the server. Cluster bucket counts and completeness breakdowns SHALL reflect only the matching set. Buckets whose matching member count is zero SHALL be omitted from the response.

#### Scenario: Water filter applied at cluster zoom
- **WHEN** the user activates the "water playground" filter at zoom ≤ 13
- **THEN** the cluster layer SHALL show only buckets containing water playgrounds, with counts reflecting only those playgrounds

#### Scenario: No filters active
- **WHEN** no filters are active
- **THEN** cluster behaviour SHALL be identical to the pre-change baseline — all playgrounds aggregated

#### Scenario: Filter combination
- **WHEN** multiple filters are active simultaneously (e.g. water + bench)
- **THEN** only playgrounds matching ALL active filters SHALL be counted in clusters

#### Scenario: Filter with no matches
- **WHEN** an active filter matches zero playgrounds in the visible extent
- **THEN** the cluster layer SHALL show no dots (empty source), not stale dots from the previous state

### Requirement: Filter change triggers cluster re-fetch
When `filterStore` changes and the active zoom tier is `cluster`, the system SHALL issue a new `get_playground_clusters` request with the updated filter params within the existing debounce window (i.e. immediately, not waiting for the next `moveend`).

#### Scenario: Filter toggled at cluster zoom
- **WHEN** the user toggles a filter while at zoom ≤ 13
- **THEN** a new cluster fetch SHALL be issued and the cluster layer SHALL update without requiring a map pan or zoom

#### Scenario: Filter toggled at polygon zoom
- **WHEN** the user toggles a filter while at zoom > 13
- **THEN** no new server fetch SHALL be issued; client-side re-styling via `matchesFilters()` handles the update

### Requirement: `standalonePitches` excluded from cluster filter params
The `standalonePitches` key in `filterStore` is a layer-visibility toggle and SHALL NOT be forwarded as a filter param to `get_playground_clusters`.

#### Scenario: standalonePitches toggled
- **WHEN** `standalonePitches` is toggled in any direction
- **THEN** the cluster fetch params SHALL NOT include a `filter_standalone_pitches` param, and no cluster re-fetch SHALL be triggered by that toggle alone

### Requirement: Backwards-compatible DB function signature
All new filter parameters on `get_playground_clusters` SHALL have `DEFAULT false`. A caller omitting any filter param SHALL receive the same result as passing `false` for that param.

#### Scenario: Old client hits new DB
- **WHEN** a request arrives at the new `get_playground_clusters` without any filter params
- **THEN** the function SHALL return the same unfiltered aggregation as before the change
