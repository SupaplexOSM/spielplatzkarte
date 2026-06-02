## Context

`api.get_playground_clusters` was introduced by `add-tiered-playground-delivery` (archived). It serves zoom levels ≤ `clusterMaxZoom` (default 13) and is the only data path the standalone client uses below that boundary. The current implementation snaps each playground centroid to a metre-scale grid via `ST_SnapToGrid` and emits the **grid anchor** as the cluster's `lon`/`lat`.

That choice was load-bearing for two reasons at the time:

1. **Determinism / cacheability** — grid anchors are deterministic for a given `(z, bbox)` regardless of dataset shifts within a cell, which made the response trivially cacheable and made cross-backend cluster alignment cheap (`add-federated-playground-clustering`).
2. **Single-pass SQL** — `GROUP BY snapped_cell` aggregates count buckets and the position in one CTE, with no window functions and no per-feature post-processing.

The visible cost — and the one this proposal addresses — is that the cluster appears on a lattice. Where a town's playgrounds are all in the south-east quadrant of a cell, the dot still lands at the cell anchor, often in farmland or open water. At z=10 the cell is ~10 km wide; at z=11 ~5 km. That's enough for a viewer to read a wrong story about where playgrounds are.

## Goals / Non-Goals

**Goals:**

- Cluster dots track the *geographic distribution* of their members, not a lattice.
- No change to the cluster grouping (which features belong to which dot) — only to the position where the dot is drawn.
- No change to the response schema, the renderer, or the orchestrator.
- Preserve the grid-grouping property used by federation cross-backend merging.

**Non-Goals:**

- True distance-based clustering (DBSCAN). Considered in D2; deferred.
- Eliminating *all* lattice artefacts — two playgrounds split across a grid line will still produce two dots. The user-visible lattice goes away in the common case (cell with few members) but residual artefacts at cell boundaries remain.
- Re-tuning cell sizes or zoom thresholds.
- Touching `playground_stats.centroid_3857`. The polygon centroid stays the source of truth even though it can fall slightly outside long, linear playground polygons.

## Decisions

### D1 — Keep grid bucketing, swap the projected position

The grid stays as the **grouping key**. Only the **shipped position** changes from the cell anchor to `ST_Centroid(ST_Collect(centroid_3857))` over the bucket's members. (Unweighted spatial mean — each member playground contributes once.)

The edit threads the member centroid through both CTEs because `aggregated` reads from `buckets`, and `buckets` currently projects only `cell, completeness, access_restricted`:

```sql
-- buckets CTE: add ps.centroid_3857 to the projection
buckets AS (
  SELECT
    ST_SnapToGrid(ps.centroid_3857, cs.m) AS cell,
    ps.centroid_3857,                                 -- NEW
    ps.completeness,
    ps.access_restricted
  FROM public.playground_stats ps, bbox b, cell_size cs
  WHERE ST_Intersects(ps.centroid_3857, b.geom)
),

-- aggregated CTE: carry the per-bucket mean centroid through
aggregated AS (
  SELECT
    cell,
    ST_Centroid(ST_Collect(centroid_3857)) AS bucket_centroid_3857,   -- NEW
    COUNT(*)::int                                                                                 AS count,
    SUM(CASE WHEN NOT access_restricted AND completeness = 'complete' THEN 1 ELSE 0 END)::int     AS complete,
    SUM(CASE WHEN NOT access_restricted AND completeness = 'partial'  THEN 1 ELSE 0 END)::int     AS partial,
    SUM(CASE WHEN NOT access_restricted AND completeness = 'missing'  THEN 1 ELSE 0 END)::int     AS missing,
    SUM(CASE WHEN access_restricted                                   THEN 1 ELSE 0 END)::int     AS restricted
  FROM buckets
  GROUP BY cell
)

-- final SELECT: project bucket_centroid_3857 to WGS84 in place of the cell anchor
'lon', ST_X(ST_Transform(bucket_centroid_3857, 4326)),
'lat', ST_Y(ST_Transform(bucket_centroid_3857, 4326)),
```

**Why this shape:**

- SQL edit confined to the existing function. No new indexes, no new functions, no schema churn.
- Bucketing is unchanged → `count`/`complete`/`partial`/`missing`/`restricted` are bit-identical to the current implementation for any input.
- Federation cross-backend merging in `add-federated-playground-clustering` keys on the grid cell, not on `lon`/`lat`. Grouping stays grid-aligned, so the federation contract is preserved (see D3).
- Cost: one extra `ST_Collect` + `ST_Centroid` per bucket per call. Buckets are O(visible cells), at most a few hundred per moveend, so the overhead is negligible compared to the existing scan.

### D2 — Reject DBSCAN / Supercluster for this proposal

Distance-based clustering (DBSCAN via `ST_ClusterDBSCAN`, or shipping centroids and clustering client-side with Supercluster) would eliminate residual lattice artefacts at cell boundaries. Rejected here because:

- **Federation friction**: DBSCAN is bbox-local and not stable across backends. Two backends running DBSCAN independently and concatenating results re-creates the federation cross-cluster problem `add-federated-playground-clustering` solved using grid alignment. Solving it again would require either client-side re-clustering or a cross-backend coordination protocol.
- **Pan stability**: distance-based clusters can flip boundaries when the bbox crosses an `eps`-radius edge; grid clusters do not. The pan-flicker UX cost is non-trivial.
- **Tuning surface**: `eps` and `minpoints` would need a per-zoom table the same shape as the current cell-size table, with no obvious default that matches the current visual density.
- **Disproportionate to the problem**: the user-visible complaint is *the lattice*, not *the grouping*. Weighted centroid removes the lattice; DBSCAN solves a problem we have not yet been asked to solve.

If a follow-up demands true proximity grouping, the natural path is a separate proposal that ships centroids to the client and clusters with Supercluster — leveraging the existing `api.get_playground_centroids` RPC (already shipped, currently client-unused) — and lets federation merge naturally on the client.

### D3 — Federation: per-backend grouping is preserved, but the cross-backend merge uses Supercluster on `lon`/`lat`

The naïve framing of "federation merge keys on the cell grid" is wrong, and worth correcting before discussing this proposal's effect. `add-federated-playground-clustering` (archived) ships per-backend cluster buckets to the client and reduces them with Supercluster (`app/src/hub/hubOrchestrator.js:bucketToSuperclusterPoint`). Supercluster builds a kd-tree on each point's `[lon, lat]` and collapses points that fall within a zoom-dependent radius. The grouping cell is **not** part of the merge key — it never enters Supercluster.

What the grid does buy in federation is a different, weaker property: two backends running the *same* `ST_SnapToGrid(centroid_3857, m)` over the *same* dataset would produce identical buckets, so identical `lon`/`lat` would arrive at the hub and Supercluster would trivially collapse them. The legacy grid-anchor projection extended that property to the merge: same cell ⇒ same anchor ⇒ same point in the kd-tree. Member-centroid projection breaks that extension — two backends contributing to the same cell now ship near-but-distinct centroids, and whether Supercluster collapses them depends on its radius parameter at the active zoom.

This proposal accepts the change. Per-backend grouping is preserved (each backend's per-cell members produce a single bucket), and the cross-backend merge degrades from "trivial collapse via point-equality" to "proximity merge via Supercluster's radius". The visible hub-mode consequence: toggling a backend via the `InstancePanel` can shift the dot for a shared cell between the two backends' centroids, since the kd-tree no longer treats them as a single point. The dot is always *somewhere within the cluster's footprint* (not on a grid lattice), so the geographic-reading goal of this proposal is met — but the framing "merge contract preserved" overstates the case and we should not lean on it. The accurate framing is: **per-backend bucketing is unchanged; cross-backend collapse is a documented, accepted regression**.

A correctness-improving follow-up — computing a count-weighted mean `(c₁·n₁ + c₂·n₂) / (n₁ + n₂)` in the Supercluster reducer when two points share a grid cell (the cell would need to be added to bucket properties for this) — is tracked separately under Open Questions and is out of scope here because it touches federation merge code, needs its own test surface against the hub fixture, and is not necessary to deliver the user-visible "lattice is gone" benefit.

### D4 — Determinism is preserved, the contract wording changes

The current spec asserts "bucket centres are deterministic for a given `(z, bbox)` input (grid-aligned)". The first half (determinism) still holds — `ST_Centroid(ST_Collect(...))` is a pure function of the input centroids. The second half (grid-aligned) becomes false. The spec delta updates the wording to say *positions are deterministic functions of the members of the bucket*, which is the actually-load-bearing property.

## Risks / Trade-offs

- **Cluster overlap at cell boundaries**: when two adjacent cells both have dense, off-centre clusters, the two weighted centroids can land visually close (occasionally < cluster-ring-radius apart). The renderer doesn't currently de-overlap clusters. Mitigation: monitor with the existing Playwright cluster snapshots; add a follow-up if the overlap is observable in real datasets.
- **Polygon centroid pathology**: `playground_stats.centroid_3857` is the polygon centroid, which for linear or U-shaped playgrounds can fall outside the polygon. The cluster centroid is therefore the centroid-of-centroids, not the centroid-of-on-the-ground-positions. In practice the difference is sub-metre for normal polygons and is dominated by the 1–10 km cell size at cluster zooms.
- **Test snapshot churn**: any test asserting exact cluster `lon`/`lat` becomes invalid. Acceptable cost — the asserted values were never user-visible coordinates anyway.

## Migration Plan

None required. The change is a server-side SQL update applied via `make db-apply`. Deployed backends pick it up at the next deploy with no client coordination, no schema migration, and no data backfill.

## Open Questions / Follow-ups

- **Hub-side count-weighted centroid for shared cells** *(deferred, not blocking)*. Today the hub picks one backend's reported position when two backends contribute to the same cell, producing visible jitter on backend toggle. A follow-up should compute `(c₁·count₁ + c₂·count₂) / (count₁ + count₂)` in the hub merger (the centroids c₁/c₂ are already in the merge input, the counts are already used for ring rendering). Deferred from this proposal because: (a) it lives in federation merge code, not the backend RPC; (b) it needs its own test surface against the hub fixture; (c) the user-visible "lattice is gone" goal of this proposal is met without it. Track as a separate change before the federation onboarding milestone.
