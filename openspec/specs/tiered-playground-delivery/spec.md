# tiered-playground-delivery Specification

## Purpose
TBD - created by archiving change add-tiered-playground-delivery. Update Purpose after archive.
## Requirements
### Requirement: Backend exposes cluster aggregates scoped to zoom and bbox

Each data-node SHALL expose a function that returns pre-aggregated playground count buckets for a given zoom level and bounding box, so clients at low zoom can render cluster representations without fetching individual features. Buckets are grouped by snapping each playground's centroid to a zoom-dependent grid (the grouping key); the `lon`/`lat` emitted for each bucket is the unweighted spatial mean of its members' centroids — i.e. `ST_Centroid(ST_Collect(playground_stats.centroid_3857))` over the bucket's members, reprojected to WGS84 — so the bucket dot tracks the geographic distribution of the playgrounds it represents rather than a grid lattice.

#### Scenario: Clusters RPC returns bucketed counts

- **WHEN** a client calls `api.get_playground_clusters(z, min_lon, min_lat, max_lon, max_lat)` with a zoom level and a WGS84 bbox intersecting the configured region
- **THEN** the response is a JSON array of bucket objects, each containing `lon`, `lat`, `count`, `complete`, `partial`, `missing`, and `restricted` fields
- **AND** `count = complete + partial + missing + restricted` for every bucket

#### Scenario: Clusters RPC positions buckets at the mean of member centroids

- **WHEN** a bucket aggregates two or more playgrounds whose centroids are not symmetrically placed within the grid cell
- **THEN** the returned `lon` / `lat` equal the WGS84 reprojection of `ST_Centroid(ST_Collect(playground_stats.centroid_3857))` over the bucket's members (the unweighted spatial mean of their centroid geometries)
- **AND** the position is *not* the WGS84 projection of the grid cell anchor
- **AND** for a bucket with a single member, the returned `lon` / `lat` equal that member's centroid reprojected to WGS84

#### Scenario: Clusters RPC bucketing is deterministic for a fixed dataset

- **WHEN** a client calls the RPC twice with identical `(z, bbox)` against an unchanged dataset
- **THEN** the two responses contain the same set of buckets with identical `count` / `complete` / `partial` / `missing` / `restricted` values
- **AND** each bucket's `lon` / `lat` is identical between the two calls

#### Scenario: Clusters RPC honours bbox filter

- **WHEN** the caller supplies a bbox that covers only a subset of the region
- **THEN** only members whose centroid lies within the bbox contribute to a bucket
- **AND** a bucket is returned only when at least one of its members satisfies that filter
- **AND** no playgrounds outside the bbox contribute to any returned bucket

#### Scenario: Clusters RPC scales cell size with zoom

- **WHEN** the caller requests the same bbox at `z = 6` and at `z = 10`
- **THEN** the `z = 10` response contains more (smaller) buckets than the `z = 6` response
- **AND** the total `count` across all buckets is identical across zoom levels (no features lost to bucketing)

### Requirement: Backend exposes centroid features scoped to bbox

Each data-node SHALL expose a function returning lightweight per-playground rows (centroid + identity + completeness + filter attributes) for a bounding box. The standalone client does not consume this RPC in the two-tier design; it ships server-side so federation re-clustering (`add-federated-playground-clustering`) and any future centroid tier can use it without a schema change.

#### Scenario: Centroids RPC returns per-feature rows

- **WHEN** a client calls `api.get_playground_centroids(min_lon, min_lat, max_lon, max_lat)` against a region with N playgrounds in the bbox
- **THEN** the response contains exactly N rows
- **AND** each row contains `osm_id`, `lon`, `lat`, `completeness` (one of `"complete"`, `"partial"`, `"missing"`), and `filter_attrs` (an object with boolean keys `has_water`, `for_baby`, `for_toddler`, `for_wheelchair`, `has_soccer`, `has_basketball`, `access_restricted`)

#### Scenario: Centroid payload is compact

- **WHEN** the response is measured for a 1000-playground bbox
- **THEN** the uncompressed JSON is under 200 KB
- **AND** no polygon geometry, no tag hstore, and no stats counts are included

### Requirement: Backend exposes bbox-scoped playground polygons

Each data-node SHALL expose a function returning full playground polygons scoped to an intersecting bbox, in the same response shape as the legacy `get_playgrounds`, so high-zoom clients can render polygons without fetching the whole region.

#### Scenario: Bbox polygons RPC matches legacy shape

- **WHEN** a client calls `api.get_playgrounds_bbox(min_lon, min_lat, max_lon, max_lat)` for a bbox intersecting the region
- **THEN** the response is a GeoJSON `FeatureCollection`
- **AND** each feature has the same properties as a feature from `api.get_playgrounds(relation_id)` — `osm_id`, `name`, `leisure`, `operator`, `access`, `surface`, `area`, `tree_count`, `bench_count`, and the rest

#### Scenario: Bbox polygons RPC honours intersection

- **WHEN** the bbox intersects only part of the region
- **THEN** only playgrounds whose geometry intersects the bbox are returned
- **AND** a playground whose polygon partially overlaps the bbox edge is still returned in full (not clipped)

### Requirement: Backend exposes single-feature playground lookup

Each data-node SHALL expose a function returning a single playground feature by `osm_id`, so the client can hydrate a polygon on demand for deeplinks and nearby-list selections when the polygon source isn't populated for the current viewport.

#### Scenario: Single-feature RPC returns one feature

- **WHEN** a client calls `api.get_playground(osm_id)` for a known osm_id
- **THEN** the response is a single GeoJSON `Feature` with the same per-feature property shape as one element of `get_playgrounds_bbox.features[*]` (`osm_id`, `osm_type`, `name`, `leisure`, `operator`, `access`, `surface`, `area`, plus the `playground_stats` counts)
- **AND** when both a relation row (`osm_id < 0`) and a way row (`osm_id > 0`) exist with the same magnitude, the relation is returned (round-trip fidelity for `R`/`W` differentiation requires a follow-up to extend the deeplink format)

#### Scenario: Single-feature RPC returns null body on miss

- **WHEN** a client calls `api.get_playground(osm_id)` with an unknown osm_id
- **THEN** the response is JSON `null` (PostgREST scalar-return on zero rows), HTTP 200
- **AND** the frontend fetcher distinguishes this from server errors by throwing only on non-2xx responses

### Requirement: get_meta includes completeness counts

The `api.get_meta` response SHALL include per-backend aggregate completeness counts, so clients can render a macro view (proposal P2).

#### Scenario: get_meta carries completeness counts

- **WHEN** a client calls `api.get_meta`
- **THEN** the response includes `complete`, `partial`, `missing` integer fields in addition to the existing `playground_count`
- **AND** `playground_count = complete + partial + missing`

<!--
  The `data_version` cache-bust field was originally scoped into this change
  but moved to `add-federation-health-exposition`, which introduces
  `api.import_status(last_import_at, ...)` — the better-scoped home for
  import metadata surfaced via get_meta.
-->

### Requirement: Legacy get_playgrounds is retained one release, marked deprecated

The existing `api.get_playgrounds(relation_id)` function SHALL remain callable and correct for one release cycle after this change lands, so tests and external consumers can migrate. It SHALL be annotated as deprecated at the database level.

#### Scenario: Legacy RPC still responds

- **WHEN** a client calls `api.get_playgrounds(relation_id)` after this change is deployed
- **THEN** the response is unchanged from before this change
- **AND** a SQL `COMMENT` on the function names the intended replacement (`get_playgrounds_bbox`) and signals deprecation

### Requirement: Client orchestrates two layers by zoom

The standalone client SHALL render playground data through exactly two zoom-scoped layers (cluster, polygon) whose visibility is determined by the current map zoom, and SHALL refetch the relevant layer's source on each debounced `moveend`.

<!--
  Original design was three tiers (cluster ≤10, centroid 11-13, polygon ≥14).
  Pivoted to two tiers during implementation: the cluster tier now covers
  zoom ≤ clusterMaxZoom (default 13) and renders as either the stacked ring
  (multi-child bucket) or a single completeness dot (count === 1). Hub-side
  Supercluster re-clustering across backends lands in
  add-federated-playground-clustering (P2).
-->

#### Scenario: Zoom ≤ clusterMaxZoom shows the cluster layer only

- **WHEN** the map zoom is less than or equal to `clusterMaxZoom` (default 13)
- **THEN** the cluster layer is visible
- **AND** the polygon layer is hidden (but not destroyed)

#### Scenario: Zoom > clusterMaxZoom shows the polygon layer only

- **WHEN** the map zoom is greater than `clusterMaxZoom`
- **THEN** the polygon layer is visible, rendered with `playgroundStyleFn`
- **AND** the cluster layer is hidden
- **AND** `playgroundSourceStore` exposes the polygon layer's source (also non-null at cluster tier so widgets can hydrate single playgrounds on demand — see "Deeplink restore hydrates the polygon tier on demand")

#### Scenario: Moveend refetches the active layer

- **WHEN** the user pans or zooms and the resulting `moveend` settles
- **THEN** within 300 ms (debounce) the active tier's fetcher is invoked with the new bbox
- **AND** any in-flight request for the same layer from a previous `moveend` is cancelled via `AbortController`

#### Scenario: Tier not available falls back

- **WHEN** the active tier's RPC returns HTTP 404 (backend older than this change)
- **THEN** the client logs a one-time warning and falls back to `api.get_playgrounds(relation_id)` for that backend
- **AND** the cluster layer remains empty for the affected backend

### Requirement: Clusters are rendered as completeness-segmented stacked rings

Cluster features SHALL be rendered on the map as a ring divided into up to four segments proportional to the complete / partial / missing / restricted counts, with the total count as a number at the centre. The restricted segment (access-restricted playgrounds) renders with a hatched light-gray pattern mirroring the CompletenessLegend's "not public" swatch. Segment colours match the legend fill palette (not the darker polygon strokes).

#### Scenario: Ring segments are proportional

- **WHEN** a cluster has `complete = 6`, `partial = 19`, `missing = 22`, `restricted = 3` (count = 50)
- **THEN** the rendered ring has four segments whose arc lengths are proportional to 6 : 19 : 22 : 3
- **AND** the complete / partial / missing segments use the legend fill-base palette (`#228b22`, `#eab308`, `#ef4444`)
- **AND** the restricted segment uses a hatched light-gray pattern
- **AND** the centre displays `50` in bold tabular numerals
- **AND** the invariant `count = complete + partial + missing + restricted` holds by construction (enforced in the `get_playground_clusters` RPC)

#### Scenario: Single-feature cluster collapses to a dot

- **WHEN** a cluster has `count = 1`
- **THEN** no ring is drawn
- **AND** a solid dot is rendered in the single feature's completeness colour (or solid light gray if the feature is access-restricted)
- **AND** the dot size is 5 CSS px

#### Scenario: Ring renders scale with count

- **WHEN** cluster counts are 5, 25, 100, and 500 respectively
- **THEN** the outer ring radius is approximately 26 / 32 / 38 / 44 CSS pixels respectively (radii were retuned during live-browser review for visual prominence at the cluster tier's zoom range)
- **AND** the number remains readable at every size

#### Scenario: Filter-badge appears only when filters are active

- **WHEN** the filter store has any active filter
- **THEN** each rendered cluster shows a small "N match" pill below the count, where N is the filter-matching child count
- **WHEN** no filter is active
- **THEN** no filter badge is rendered

<!-- The filter-badge requirement is specified but deferred — task §4.6 in the change tasks list. The renderer + RPC are in place; the badge UI ships in a follow-up. -->

#### Scenario: Cluster click zooms to extent

- **WHEN** the user clicks a cluster
- **THEN** the map view animates toward the cluster's centre (currently +2 zoom levels — fit-to-extent of bucket children requires a follow-up since server-bucketed clusters don't carry per-child geometry)
- **AND** no selection is created (the hash is not modified)

### Requirement: Deeplink restore hydrates the polygon tier on demand

URL-hash restore of a specific playground SHALL work even when the polygon layer is not currently populated (i.e. the user's initial zoom is below the polygon tier).

#### Scenario: Deeplink at low zoom hydrates one feature

- **WHEN** a user opens `/#W1234567` on a page that loads at a zoom in the cluster tier (≤ clusterMaxZoom)
- **THEN** the client calls `api.get_playground(osm_id)` to fetch the single feature
- **AND** adds the result to the polygon `VectorSource`
- **AND** the source's `change` event triggers selection of the matched feature and fits the view to its extent at a zoom in the polygon tier
- **AND** in hub mode (registry-resolved backends) hydration is skipped — the registry's per-backend broadcast loading populates the source instead

