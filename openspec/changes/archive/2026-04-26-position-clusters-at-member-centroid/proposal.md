## Why

The cluster tier (`api.get_playground_clusters`) currently snaps each playground centroid to a zoom-dependent grid (`ST_SnapToGrid`) and ships the **grid anchor** as the cluster position. The visual result is a rigid lattice of dots that has no relationship to the actual geography of playgrounds: at low zoom over Hessen, clusters line up on graph paper instead of hugging towns, valleys, and roads.

Users reading the map cannot tell, from cluster placement alone, where playgrounds are *actually* concentrated. A cluster of "5 playgrounds" sitting on a grid intersection in the middle of farmland — when in reality the five playgrounds are all clustered around the nearest village 800 m away — actively misleads spatial reasoning.

The grid is doing two jobs at once: **grouping** (which features belong to the same cluster) and **positioning** (where the dot is drawn). Splitting these — keeping the grid for grouping but using the **mean of the member centroids** for positioning — gives the user back the geographic reading of the map without changing any of the load-bearing properties of the current design (deterministic bucketing, federation alignment, single-pass SQL aggregation).

## What Changes

- **Backend (`importer/api.sql`)**: `api.get_playground_clusters` continues to bucket by `ST_SnapToGrid(centroid_3857, cell_size)` but emits the **mean of the member centroids** of each bucket as `lon` / `lat`, computed via `ST_Centroid(ST_Collect(centroid_3857))` per group. (Each playground contributes equally — this is an unweighted spatial mean, not count- or area-weighted.) The cell anchor is no longer projected back to WGS84 for the response. The edit spans both the `buckets` CTE (which must project `ps.centroid_3857` so it is available for aggregation) and the `aggregated` CTE / final SELECT (which carries the per-bucket centroid through to the output).
- **Response shape**: unchanged. Same JSON keys (`lon`, `lat`, `count`, `complete`, `partial`, `missing`, `restricted`), same per-bucket invariant (`count = complete + partial + missing + restricted`).
- **Determinism contract**: relaxed from "grid-aligned" to "function of the members of the bucket". For a fixed dataset and fixed `(z, bbox)`, the output is still bit-stable — the centroid is a pure function of the input centroids — but bucket positions are no longer co-located across cells.
- **Frontend**: no code changes. `clusterStyle.js` and the orchestrator already consume `(lon, lat)` as opaque coordinates.
- **Tests**: existing Playwright fixtures and any SQL regression snapshots that assert exact cluster coordinates are refreshed.
- **Docs**: `docs/reference/api.md` cluster section updated to describe the position semantics.

Out of scope (explicit non-goals):

- Switching to true proximity clustering (DBSCAN, k-means, Supercluster). Considered and rejected for this proposal — see `design.md` D2.
- Changing the cell-size table or the `clusterMaxZoom` boundary.
- Any frontend rendering changes (ring renderer, hover, click behaviour).
- Federation-side cross-backend cluster merging logic — the grid grouping property used by `add-federated-playground-clustering` is preserved.

## Capabilities

### Modified Capabilities

- `tiered-playground-delivery`: the `get_playground_clusters` response continues to satisfy bbox filtering and zoom scaling, but the `lon`/`lat` of each bucket is now the centroid of the bucket's members rather than the grid anchor.

## Impact

- `importer/api.sql` — `api.get_playground_clusters`: `buckets` CTE gains `ps.centroid_3857` in its projection; `aggregated` CTE carries the per-bucket mean centroid through; final SELECT projects that centroid to WGS84 instead of the cell anchor.
- `docs/reference/api.md` — clarify position semantics under `get_playground_clusters`.
- Test fixtures that assert exact cluster `lon`/`lat` coordinates — refresh.
- No changes to: `app/src/lib/api.js`, `app/src/lib/clusterStyle.js`, `app/src/lib/tieredOrchestrator.js`, the frontend stores, the response schema, the federation merge contract, or any compose/runtime configuration.
