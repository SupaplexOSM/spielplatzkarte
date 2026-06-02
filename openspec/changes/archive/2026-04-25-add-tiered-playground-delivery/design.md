## Context

Today, `StandaloneApp.svelte:126–135` fetches every playground polygon for the configured relation at startup, adds them to a single `VectorSource`, and lets OpenLayers render the whole set at every zoom level. `app/src/lib/api.js::fetchPlaygrounds` is the only entry point. For Fulda this is ~100 features; for a region the size of Berlin it's ~2.5k; for Germany it would be 50k+ and tens of megabytes on first paint.

The project has chosen to expand toward Europe-scale coverage via a federation of regional backends (see `add-federated-playground-clustering`). That decision forces a pre-requisite: regardless of federation, every backend must be able to answer viewport-shaped questions — clusters at low zoom, centroids mid-zoom, polygons high-zoom — instead of region-shaped ones. This proposal delivers exactly that per-backend contract, without touching hub orchestration.

The UX anchor is the completeness signal: the playground polygon fill (green / amber / red) is the map's primary information channel. A clustering design that loses this information would be a regression. The stacked-ring cluster is the chosen visual compromise — each cluster is a ring segmented by count-of-complete / count-of-partial / count-of-missing, with the count in the centre. At 40+ children the ring is readable; at single digits the segments remain distinguishable.

## Goals / Non-Goals

**Goals:**

- Per-backend data contract that scales from one playground to Germany without changing request shape.
- Preserve the red/amber/green completeness scan at every zoom level.
- No new services, no new datastores; everything lives in the existing Postgres + PostgREST.
- Backward-compatible for one release: existing `get_playgrounds(relation_id)` stays callable to unblock tests and external tooling.
- Client orchestration is self-contained: a page refresh does not refetch what is already in view.

**Non-Goals:**

- Federation — P2 (`add-federated-playground-clustering`) depends on this proposal and lands separately.
- Vector tiles (MVT). Revisit only if Phase 1 payloads grow beyond ~500 KB per viewport request at mid-zoom. PostGIS + gzipped JSON is expected to carry Germany-sized regions comfortably.
- Server-side filter-aware clustering. Pre-aggregating by every filter combination is combinatorial and premature; filter count is computed client-side over the returned centroids.
- Changes to equipment / tree / POI RPCs. Those already take a bbox and work fine.
- Changes to the selection panel, deep-link, or search — they remain polygon-path features operating at zoom ≥ 14.

## Decisions

### D1 — Three-tier server contract, bucket clusters via ST_SnapToGrid

The server exposes exactly three tiers: clusters, centroids, polygons. Clusters are bucketed by `ST_SnapToGrid(way, cell_size)` where `cell_size` is a function of the requested zoom (roughly `156543.03 / 2^z` metres × a constant, tuned so a bucket maps to ~60 CSS pixels at the requested zoom). Each bucket emits `{lon, lat, count, complete, partial, missing}`.

Rejected alternatives:

- **PostGIS `ST_ClusterKMeans` / `ST_ClusterDBSCAN`**: produce better-looking clusters but require per-request computation over all features in the bbox; cost grows with density. Grid bucketing is `O(n)` with trivial constants and its results cache perfectly by `(z, bbox)`.
- **H3 / S2 bucketing**: attractive but adds a PG extension dependency. Keep the stack lean. Grid snap in Web Mercator is close enough; visual jitter at bucket boundaries is masked by the client-side re-cluster tier.
- **Emit pre-clustered points already merged across zooms**: over-constrains clients. Keeping `get_playground_clusters(z, bbox)` stateless and deterministic lets the hub cache per `(z, bbox)` HTTP key.

### D2 — Client-side clustering engine is Supercluster, not OL `Cluster`

OpenLayers' native `Cluster` source degrades past ~10k points per viewport and recomputes on every view change. Supercluster (Mapbox) uses a KD-bush and handles 100k+ points with sub-100 ms clustering. It also supports `map`/`reduce` callbacks, which we rely on (a) to preserve completeness counts when clustering centroids, and (b) in P2 to re-cluster across federated backends.

Cost: one new dependency (`supercluster`, ~15 KB gzipped, no transitive deps). Worth it.

### D3 — Stacked-ring renderer is canvas via OL `Style.renderer`, cached by shape

OL `Icon` / `Circle` styles can't draw the segmented ring. We use `Style({ renderer: (coords, state) => ... })` which gets the 2D context and draws the ring directly.

To keep frame cost down, the rendered bitmap is cached keyed on `(count_bucket, r_frac, p_frac, m_frac)` rounded to a fixed palette (say, 4 count buckets × 10% segment buckets = ~400 distinct bitmaps). On cache hit, the renderer blits; on miss, it draws once and stores. Memory cost is bounded; frame cost drops to draw-image calls.

### D4 — Zoom thresholds: ≤ 10 clusters, 11–13 centroids, ≥ 14 polygons

These numbers are calibrated, not fixed:

- At zoom ≤ 10 a single playground polygon occupies less than one CSS pixel. Clusters are the only sensible representation.
- At zoom 11–13 individual playgrounds are visible as dots but polygon outlines carry no useful detail. Centroids + client-side clustering provide responsive pan/zoom with completeness colour.
- At zoom ≥ 14 polygon boundaries matter for "which street is this on" wayfinding, and the selection UI relies on the polygon geometry to fit-to-extent.

The thresholds are surfaced as `config.js` constants (`clusterMaxZoom = 10`, `centroidMaxZoom = 13`) so operators can tune per deployment.

### D5 — Layer visibility is gated; non-active layers stay in memory

Rather than destroying the unused layers on zoom transitions, we hide them via `setVisible(false)`. This prevents flicker during pan-at-zoom-boundary (when two tiers are both potentially relevant within one frame) and lets the OL render pipeline keep its cached geometry.

The exception is the polygon source: it is bbox-scoped and refetched on each `moveend` that lands in the polygon tier, because the same bbox may produce different features (a pan brings new playgrounds in). The cluster and centroid sources similarly refetch on `moveend` inside their tier.

### D6 — Filter-awareness is two-tier

Clusters always show the completeness breakdown in the ring (what's on the map). When any filter is active, a small badge below the count shows "N match filter" — computed client-side from centroid attributes for the centroid tier, and requested from the server alongside the cluster bucket for the cluster tier (each cluster bucket ships filter-match counts for the current filter hash, server-side).

Actually: the cluster tier does **not** ship filter counts. Cluster-tier is zoom ≤ 10, where individual filter precision is visually meaningless — at that scale, a badge that says "147 match in this cluster" is noise, not signal. The badge appears only on the centroid tier (zoom 11–13) and above. At zoom ≤ 10 the filter state changes the ring display to neutral grey when a filter is active, communicating "filter doesn't resolve at this scale."

### D7 — Legacy `get_playgrounds(relation_id)` retained one release, then removed

Dropping it immediately breaks Playwright fixtures and any external consumer. Mark deprecated in `importer/api.sql` with a `COMMENT`, and log a one-time warning from `fetchPlaygrounds` in the client. Remove in the release after next; track via a separate tiny proposal.

Keeping it indefinitely is rejected: the materialised view behind it (`playground_stats`) then has to stay in lockstep with the new centroid attrs, and "which path does this client use?" becomes a support question.

## Risks / Trade-offs

- **Flicker at zoom boundary.** Mitigated by D5 (keep layers alive and hidden). A secondary mitigation: within ±0.5 of a threshold, both tiers render, with the inactive one at 40% opacity, for 200 ms. Hide behind a setting; default off until we observe it's actually a problem.
- **Cluster-grid jitter at bucket boundaries.** A cluster's centroid "jumps" to a different bucket when the bbox pans across a grid line. Mitigated by the client-side re-cluster on the centroid tier taking over at zoom 11. At the cluster tier this is below the threshold of user perception.
- **Memory at maximum centroid response.** A bbox covering 30k playgrounds returns ~3 MB of centroid GeoJSON. Supercluster's index is ~N × 40 bytes, so ~1.2 MB. Total well under the budget we'd worry about, but we cap response sizes server-side with `LIMIT` + a warning field so the client can hint "zoom in for accuracy".
- **Cache invalidation on import.** `get_playground_clusters` responses are HTTP-cached aggressively (no `Cache-Control` header → nginx/PostgREST defaults). After an osm2pgsql import, stale bucket responses linger. Mitigated by adding a short `Cache-Control: max-age=300` and, on import completion, touching a bump timestamp surfaced in `get_meta` that the client uses as a cache-bust query param.
- **Breakage for external tooling calling `get_playgrounds(relation_id)`.** Deprecation window covers this; removal will be its own proposal with a migration note.
- **Selection + deeplink flow depends on polygon features.** At zoom < 14, if a deeplink lands on `#W<osm_id>`, the polygon feature isn't loaded yet. Fix: deeplink restore triggers a single `get_playgrounds_bbox` call centred on the osm_id's known location (via `get_nearest_playgrounds`-style lookup) to hydrate just that feature, then selects it. Smaller hop than fetching the region.

## Open Questions

- **Exact grid-cell sizing per zoom level.** Initial proposal: `cell_size_m = 156543.03 × cos(lat) / 2^z × 60` (where 60 is the target pixel size of a bucket). Needs a feedback loop against real data density — Fulda, Berlin, and a Germany-sized test extract — before final tuning.
- **Should `get_playground_centroids` include the osm_id or only per-tier aggregates?** Currently specified to include `osm_id` so the client can select a playground from a centroid click without a round-trip. Adds ~15 bytes per feature. Worth it.
- **Response compression.** PostgREST emits JSON; nginx does gzip. Verify `br` (brotli) is on in the OCI image — a 40% size win for free. If not, add it in this proposal or spawn a tiny follow-up.
- **Playground `access=private` hatch fills.** Style fn still needs these at polygon tier. For centroid/cluster tier, do we distinguish at all? Leaning "no" — private playgrounds still contribute to counts; hatch is a high-zoom detail. Confirm with an eyeball test on Berlin data.
