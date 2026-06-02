# federated-playground-clustering Specification

## Purpose
TBD - created by syncing change add-federated-playground-clustering. Update Purpose after archive.
## Requirements
### Requirement: Hub routes fetches by backend bounding box

The hub SHALL fetch playground data only from backends whose bounding box intersects the current viewport, and SHALL source those bounding boxes from each backend's `get_meta` response (not from `registry.json`).

#### Scenario: Viewport inside one backend queries only that backend

- **WHEN** the viewport falls entirely inside the bbox of backend A, and backends B and C have bboxes disjoint from the viewport
- **THEN** the hub issues a tier-appropriate fetch to backend A only
- **AND** backends B and C receive no request for this moveend

#### Scenario: Viewport crossing a border queries every intersecting backend

- **WHEN** the viewport intersects the bboxes of backends A and B but not of backend C
- **THEN** the hub issues parallel fetches to A and B
- **AND** backend C receives no request

#### Scenario: Bounding boxes are auto-populated from get_meta

- **WHEN** the hub loads `registry.json` and fetches `get_meta` for each entry
- **THEN** each backend's `bbox` field is cached in the in-memory backends store
- **AND** no `bbox` field is read from `registry.json` (even if one is present)

#### Scenario: Bounding boxes refresh on registry poll

- **WHEN** the existing 5-minute registry poll fires
- **THEN** `get_meta` is re-fetched per backend
- **AND** any changes in `bbox` are reflected in the backends store for subsequent moveends

### Requirement: Hub fans out fetches in parallel with progressive render

For any tier that requires a per-backend fetch, the hub SHALL invoke each selected backend's fetcher in parallel, render incrementally as responses arrive, and cancel all in-flight requests together on the next moveend.

#### Scenario: Progressive render

- **WHEN** the hub fans out a cluster fetch to backends A, B, and C, and C takes 2 seconds while A and B respond in 100 ms
- **THEN** the cluster layer renders data from A and B within ~100 ms (plus debounce)
- **AND** C's contribution appears when its response settles, without re-rendering the whole map

<!--
  The original spec scenario read "centroid fetch" — pre-pivot the hub had
  three tiers (cluster/centroid/polygon). Centroid was dropped in P1's
  two-tier pivot; the same progressive-render requirement applies to the
  cluster tier.
-->

#### Scenario: Slow backend does not block the paint

- **WHEN** one backend exceeds the 5-second per-request timeout
- **THEN** that backend's contribution is omitted from the current tier
- **AND** a console warning is emitted once per backend per session
- **AND** the map remains interactive throughout

#### Scenario: Moveend cancels previous fan-out

- **WHEN** a new moveend fires before the previous fan-out has settled for every backend
- **THEN** every in-flight per-backend request from the previous fan-out is aborted
- **AND** only the new fan-out's results contribute to the current render

#### Scenario: Single error does not reject the fan-out

- **WHEN** one backend returns HTTP 500 during a fan-out while others succeed
- **THEN** the successful backends' contributions render as normal
- **AND** the failed backend is logged as an error entry but does not propagate as a rejection

### Requirement: Offline backends are skipped silently

When `federation-status.json` reports a backend as `ok: false`, the hub's bbox router SHALL exclude that backend from tier fetches. In the macro view, the backend's ring SHALL still render, outlined rather than filled, with a visible offline marker.

#### Scenario: Offline backend excluded from fetches

- **WHEN** `federation-status.json` reports backend B as `ok: false`
- **THEN** fan-out does not issue any tier-fetch to backend B
- **AND** backend A and C (reachable) respond normally
- **AND** no timeout error is logged for B on this moveend

#### Scenario: Offline backend visible in macro view

- **WHEN** the zoom is in the macro tier (≤ 5) and backend B is offline
- **THEN** backend B's country ring still renders at its bbox centroid
- **AND** the ring is outlined (stroke only, no fill), rendered in a muted colour
- **AND** a small "offline" label is visible on the ring
- **AND** the counts displayed on B's ring are the last known counts from its most recent successful `get_meta` response

#### Scenario: Backend recovers without page reload

- **WHEN** a previously offline backend recovers (federation-status reports `ok: true` at the next poll)
- **THEN** the next moveend includes that backend in the fan-out
- **AND** the macro-view ring transitions from outlined to filled

#### Scenario: Fallback when federation-status.json is absent

- **WHEN** `GET /federation-status.json` returns 404
- **THEN** the hub assumes every backend is reachable
- **AND** logs a one-time console warning naming the missing endpoint
- **AND** fan-out proceeds with per-request timeouts as the only health signal

### Requirement: Hub re-clusters merged server results across backends

At the cluster tier, merged cluster buckets from multiple backends SHALL be re-clustered client-side so that no visible seam appears at a backend boundary.

#### Scenario: Re-cluster preserves total counts

- **WHEN** backend A returns buckets summing to count 2000 and backend B returns buckets summing to count 1500 inside the viewport
- **THEN** the rendered cluster layer, after re-clustering, shows a total count of 3500 across its rings
- **AND** the sum of `complete` segments equals the sum of `complete` inputs from A and B
- **AND** likewise for `partial`, `missing`, and `restricted` (the four-segment ring shipped with P1's restricted bucket)

#### Scenario: Border clusters merge visually

- **WHEN** two clusters from different backends sit within a visual threshold distance at the border
- **THEN** the re-clusterer may merge them into a single rendered ring whose count is the sum
- **AND** the ring's segment proportions reflect the combined counts

### Requirement: Hub renders a country-level macro view at zoom 0–5

At zoom levels at or below `macroMaxZoom` (default 5; introduced as a separate config knob during implementation so the cluster tier can keep its own `clusterMaxZoom = 13` threshold), the hub SHALL render one stacked-ring feature per registered backend, sized and segmented by the backend's `get_meta` aggregate counts, without fetching any per-playground data.

#### Scenario: Macro view renders one ring per backend

- **WHEN** the zoom is 3 (within the macro tier) and the registry contains N backends
- **THEN** exactly N rings are rendered, one per backend
- **AND** no per-playground fetch is issued at this zoom

#### Scenario: Macro ring position and sizing

- **WHEN** backend A has `bbox = [5, 47, 15, 55]` and `playground_count = 65000`
- **THEN** A's ring is centred at approximately `(10, 51)` (bbox centroid)
- **AND** the ring's radius is drawn from the same size scale used for individual clusters (bucketed by count; large buckets for higher counts)

#### Scenario: Macro ring segments reflect completeness

- **WHEN** backend A has `{complete: 12000, partial: 30000, missing: 23000}` in its `get_meta` response (P1 `get_meta` doesn't yet ship `restricted`; macro view treats it as zero in that case)
- **THEN** A's ring displays segments proportional to 12 : 30 : 23 : 0 (the four-segment renderer collapses the empty `restricted` arc)
- **AND** colours match the playground polygon completeness colours
- **WHEN** a backend extends `get_meta` with `restricted` in a future release
- **THEN** the macro ring renders four segments including the gray-hatched restricted arc, matching the cluster ring's four-segment layout

#### Scenario: Macro ring click zooms to backend bbox

- **WHEN** the user clicks a macro-view ring
- **THEN** the map view animates to fit the backend's bbox with standard padding
- **AND** the zoom lands in the cluster or polygon tier (depending on bbox size — centroid tier was dropped in P1's two-tier pivot)
- **AND** a tier fetch is issued to (only) that backend after the moveend debounce

### Requirement: Hub polygon tier concatenates without re-merging

At the polygon tier (zoom ≥ 14), the hub SHALL render polygons from every contributing backend in a single vector source, without attempting cross-backend merging.

#### Scenario: Polygon features tagged by source backend

- **WHEN** the polygon tier is active and two backends contribute features
- **THEN** every feature carries a `_backendUrl` property equal to its source backend
- **AND** selection events route to the correct backend by reading this property

#### Scenario: Polygon source is replaced on every tier fetch

- **WHEN** a new polygon-tier moveend fires
- **THEN** the polygon source is cleared and replaced with the merged fan-out result
- **AND** no stale features from a previous viewport linger

### Requirement: Initial hub map fit does not land in macro view for small deployments

When only one backend is registered, the hub's initial `view.fit` SHALL clamp to zoom `clusterMaxZoom + 1` or higher, so single-backend hubs do not spuriously land in the macro view.

#### Scenario: Single-backend hub lands above macro threshold

- **WHEN** a hub starts with exactly one backend whose bbox corresponds to a small region (e.g. a single city)
- **THEN** the initial map fit zoom is at least `clusterMaxZoom + 1` (default 14, since `clusterMaxZoom` defaults to 13)
- **AND** the user sees cluster or polygon features on first paint, not macro rings

#### Scenario: Multi-backend hub lands in whatever tier the union bbox dictates

- **WHEN** a hub starts with multiple backends whose union bbox spans multiple regions
- **THEN** the initial fit is not clamped beyond standard padding
- **AND** the resulting zoom may be in the macro tier (correctly showing the continent overview)

### Requirement: Hub deduplicates overlapping playgrounds by `osm_id` in the polygon tier

In hub mode, when two or more registered backends serve the same playground (overlapping coverage — e.g. a city backend inside a state backend, both shipping that city's playgrounds), the hub SHALL render exactly one feature per `osm_id` in the shared polygon `VectorSource`. The merge runs in `app/src/hub/hubOrchestrator.js` per-`orchestrate()` call, against a `Map<osm_id, Feature>` populated as backend arrivals progress through the polygon-tier `onResult` handler. The merge rule is deterministic: prefer the feature whose backend reports the freshest `last_import_at`, with `null` and unparseable timestamps always losing, and ties broken by raw-string URL alphabetical for absolute determinism across registry edits and arrival orderings.

#### Scenario: Two backends share an `osm_id`, fresher `last_import_at` wins

- **WHEN** backend A and backend B both return a feature with `osm_id = 12345` in the polygon tier, A's `get_meta` reported `last_import_at = "2026-04-25T03:00:00Z"` and B's reported `"2026-04-26T03:00:00Z"`
- **THEN** the polygon `VectorSource` contains exactly one feature with `osm_id = 12345` after both arrivals settle
- **AND** that feature's `_backendUrl` property equals B's URL (B is fresher)
- **AND** that feature's `_lastImportAt` property equals `"2026-04-26T03:00:00Z"` (frozen at parse time, read from the feature in subsequent cycles — never from the live `backends` store)

#### Scenario: Null or unparseable `last_import_at` always loses

- **WHEN** backend A reports `last_import_at = null` (or `undefined`, or any string for which `Date.parse(value)` returns `NaN`) and backend B reports any value where `Date.parse(value)` is finite
- **THEN** the kept feature comes from backend B
- **AND** the rule applies symmetrically — non-null/parseable beats null/unparseable in either arrival order

#### Scenario: Equal or both-missing timestamps tie-break by URL alphabetical

- **WHEN** backends A and B both report identical numeric `Date.parse(last_import_at)`, OR both report values that are absent / null / unparseable
- **THEN** the kept feature comes from whichever backend's `_backendUrl` string sorts first under JavaScript's raw `<` operator — code-unit-wise, no case-folding, no scheme/trailing-slash normalisation
- **AND** swapping the order of entries in `registry.json` does NOT change the winner — the URL string itself is the load-bearing key, not registry position

#### Scenario: Same instant emitted in different ISO TZ formats counts as a tie

- **WHEN** two backends return `last_import_at = "2026-04-25T12:00:00Z"` and `"2026-04-25T14:00:00+02:00"` respectively (the same instant, different TZ format)
- **THEN** `Date.parse(a) === Date.parse(b)` evaluates true, the timestamps are treated as equal, and the rule falls through to URL alphabetical
- **AND** the comparison MUST NOT use lexicographic string compare on the raw values — that would flip the winner non-deterministically based on the chosen TZ format, which is the bug PR #295 was rejected for

#### Scenario: Refresh cycle does not flip the winner on stable inputs

- **WHEN** the registry-poll refresh fires and re-fetches `get_meta` and the polygon-tier features from both backends, with neither backend's `last_import_at` having changed
- **THEN** the same backend remains the winner for every shared `osm_id`
- **AND** the rendered polygon source's content does not change (the orchestrator may issue intermediate `removeFeature`/`addFeatures` calls per backend arrival as a consequence of the per-`orchestrate()` map being rebuilt — the contract is on *winner identity*, not on event-count silence)

#### Scenario: Refresh cycle flips the winner when one backend imports newer data

- **WHEN** the previously-losing backend's `last_import_at` advances past the previously-winning backend's `last_import_at` between two registry-poll cycles
- **THEN** at the next refresh, the winner flips to the now-fresher backend for every shared `osm_id`
- **AND** the previously-winning feature is removed from the source via `removeFeature(s)` before the new feature is added via `addFeatures`

#### Scenario: Existing-feature timestamp is read from the feature, not the live `backends` store

- **WHEN** the dedup loop runs and an existing feature owned by backend B is in the source from a previous `orchestrate()` call (or a previous arrival in the same call), and the incoming feature is from backend A or B
- **THEN** the existing feature's `_lastImportAt` is read via `existing.get('_lastImportAt')` — a value that was frozen at the feature's parse time
- **AND** the comparison value is independent of any subsequent mutation of `backends.find(b => b.url === existingBackendUrl).lastImportAt`
- **AND** this contract holds even if a future refactor reintroduces in-place mutation of the `backends` store

#### Scenario: Single backend per `osm_id` is a no-op

- **WHEN** backend A returns a feature with `osm_id = 12345` and no other backend covers that playground in the same `orchestrate()` call
- **THEN** the feature is added to the source as-is
- **AND** no compare or remove is performed
- **AND** the feature carries `_backendUrl = A.url` and `_lastImportAt = A.lastImportAt ?? null`

#### Scenario: `_lastImportAt` storage and read symmetry

- **WHEN** a feature is parsed by `parsePolygonFeatures` from a backend whose `lastImportAt` is null or missing
- **THEN** the feature's `_lastImportAt` is set to JSON `null` (not omitted)
- **AND** readers of `existing.get('_lastImportAt')` MUST treat the returned `null`, `undefined` (legacy features without the property), and any string value where `Date.parse(value)` returns `NaN` identically — all three fall into the "no parseable timestamp" branch of the merge rule

#### Scenario: Source mutations are batched per arrival

- **WHEN** a polygon-tier arrival from backend X yields N losers (existing features evicted by the merge) and M winners (incoming features added)
- **THEN** the orchestrator calls `polygonSource.removeFeatures(toRemove)` once with all N losers, then `polygonSource.addFeatures(toAdd)` once with all M winners
- **AND** per-feature `removeFeature`/`addFeature` calls inside the loop are forbidden — they each fire a synchronous `change` event that triggers a renderer repaint

#### Scenario: Cluster tier is not affected by this change

- **WHEN** the active tier is the cluster tier (`zoom <= clusterMaxZoom`)
- **THEN** the dedup behaviour above does not run — the cluster tier merges by spatial proximity via Supercluster's existing kd-tree pipeline (a separate mechanism that does not surface `osm_id`)
- **AND** the polygon-tier dedup module does not touch `clusterSource` or `macroSource`

