## MODIFIED Requirements

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
