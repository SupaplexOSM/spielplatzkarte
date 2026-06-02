## Why

The current data path — `api.get_playgrounds(relation_id)` returns every polygon in a region in a single call — worked for Fulda (~100 features), was tolerable for Berlin (~2.5k), and breaks completely at Germany scale (~50–70k, 30–100 MB GeoJSON on first paint). The stated ambition is Europe-wide coverage via a federation of regional backends. Before federation can be clustered (see `add-federated-playground-clustering`), each backend needs to serve data that can survive a viewport-shaped request, not a region-shaped one.

This proposal delivers the per-backend half: zoom-tiered, bbox-scoped RPCs plus a client that swaps representations as the user zooms. Standalone deployments benefit immediately — a Berlin-sized instance stops shipping a 5 MB payload on load, Germany becomes viable single-instance, and the stacked-ring cluster UX preserves the red/yellow/green completeness scan that the whole map is built around.

## What Changes

- **Backend (per data-node)**:
    - New `api.get_playground_clusters(z, bbox)` — pre-aggregated count buckets with per-bucket completeness breakdown `{complete, partial, missing}`, bucketed by a zoom-appropriate grid (PostGIS `ST_SnapToGrid` on the web-mercator geometry).
    - New `api.get_playground_centroids(bbox)` — lightweight per-feature rows: `osm_id`, centroid lon/lat, completeness, and a small packed set of filter attributes (`has_water`, `for_baby`, `for_toddler`, `for_wheelchair`, `has_soccer`, `has_basketball`, `access_restricted`).
    - New `api.get_playgrounds_bbox(bbox)` — same response shape as today's `get_playgrounds`, scoped to an intersecting bbox instead of a relation.
    - `api.get_meta` gains `{complete, partial, missing}` counts so the hub's low-zoom macro view (proposal P2) has a precomputed source.
    - Existing `api.get_playgrounds(relation_id)` is marked deprecated but retained one release for Playwright fixtures and external tooling; removal tracked separately.

- **Client — frontend**:
    - `StandaloneApp` replaces the one-shot `fetchPlaygrounds` with a zoom-tier orchestrator driven by `moveend`. Three tiers:
        - zoom ≤ 10 → cluster layer fed by `get_playground_clusters`
        - zoom 11–13 → centroid layer fed by `get_playground_centroids`, clustered client-side via Supercluster
        - zoom ≥ 14 → polygon layer fed by `get_playgrounds_bbox`, rendered with the existing `playgroundStyleFn`
    - A new `ClusterLayer` component wraps a `VectorLayer` whose style function renders the stacked ring (complete/partial/missing proportional segments + count) via a cached canvas renderer.
    - Layer visibility is zoom-gated; the layer not in use is hidden, not destroyed, so a zoom-out does not discard in-flight centroid data.
    - Filter awareness: clusters display completeness breakdown unconditionally; a small "N match filter" badge appears only when a filter is active.
    - `app/src/lib/api.js` gains `fetchPlaygroundClusters`, `fetchPlaygroundCentroids`, `fetchPlaygroundsBbox`; `fetchPlaygrounds` is deprecated but retained one release.
    - Existing features that iterate `playgroundSource.getFeatures()` — URL-hash restore, `NearbyPlaygrounds` fallback — gracefully no-op when the polygon layer isn't populated, falling back to the PostgREST `get_nearest_playgrounds` path.

- **Docs**:
    - `docs/reference/api.md` (new) — documents the three tiered RPCs, zoom thresholds, and response shapes.
    - `CLAUDE.md` "Key frontend architecture" section updated to describe the zoom-tier layer orchestration.

Out of scope (explicit non-goals):

- Federation — covered by `add-federated-playground-clustering` (P2), which layers on top of this proposal.
- Vector tiles (MVT) — reconsidered only if Phase 1 payloads grow beyond the viewport budget.
- Changes to equipment/tree/POI RPCs — those are already bbox-scoped and unchanged.
- Server-side filter pre-aggregation — clusters carry completeness only; filter counts are derived client-side.

## Capabilities

### New Capabilities

- `tiered-playground-delivery`: Zoom-tiered, bbox-scoped playground data contract and the client-side orchestrator that consumes it. Covers the three new RPCs, the zoom-tier layer swap, and the stacked-ring cluster renderer.

### Modified Capabilities

- None. The playground-rendering logic in `Map.svelte` is not currently covered by a capability spec; `hub-ui-parity` concerns hub-specific widgets and is untouched here.

## Impact

- `importer/api.sql` — three new functions, extension to `get_meta`, one new spatial index (geohash or grid column on `planet_osm_polygon` restricted to `leisure=playground`).
- `app/src/lib/api.js` — three new fetchers; `fetchPlaygrounds` deprecated.
- `app/src/lib/vectorStyles.js` — new `stackedRingStyleFn` for clusters, new `centroidStyleFn`.
- `app/src/components/Map.svelte` — swap from single polygon layer to three zoom-gated layers.
- `app/src/standalone/StandaloneApp.svelte` — moveend-driven orchestrator; one-shot fetch removed.
- `app/src/components/ClusterLayer.svelte` — new, encapsulates Supercluster + canvas renderer.
- `app/src/stores/playgroundSource.js` — now published only when the polygon tier is active.
- `package.json` — adds `supercluster` dependency.
- Playwright tests — updated to exercise zoom-tier transitions; legacy fixtures call `get_playgrounds_bbox` against the seed region.
- `docs/reference/api.md` — new page; `mkdocs.yml` nav updated.
