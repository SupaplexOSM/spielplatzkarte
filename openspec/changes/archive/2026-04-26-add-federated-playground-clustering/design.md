## Context

The hub is the user-facing front for a federation of regional backends. It currently loads every playground polygon from every registered backend simultaneously — a pattern inherited from standalone mode, which works up to a few thousand features total but fundamentally does not scale to Europe-coverage (plausibly 300–500k playgrounds across 30+ regional instances).

Proposal `add-tiered-playground-delivery` gives each backend a contract that can answer viewport-shaped questions cheaply. This proposal is the hub-side consumer of that contract. The two live in the same architecture but have different concerns:

- **P1** is per-backend: what is the shape of an answer? How does a single backend honour a bbox request at different zooms?
- **P2** (this proposal) is hub-side: given that every backend speaks the P1 contract, how does the hub orchestrate across them, merge their answers, and render a coherent continent-wide view?

The hub has firm operational constraints: it is a static-file + registry deployment (nginx + Svelte build + `registry.json`), with a small shell-cron script adding `federation-status.json` via `add-federation-health-exposition`. This proposal honours those constraints — no hub-side service, no hub-side DB, no change to the registry directory beyond what `get_meta` already exposes.

## Goals / Non-Goals

**Goals:**

- Hub scales gracefully from 1 backend (single-country trial) to 30+ backends (Europe).
- At any zoom level, fan-out load is proportional to backends intersecting the viewport, not total backends.
- Partial-failure tolerance: offline or slow backends do not block the paint loop.
- Border seams between backends are invisible in cluster and centroid tiers (one coherent continent view, not a tiling of regional maps).
- No new hub-side runtime beyond the existing nginx + static build + cron script.
- Country-level macro view at zoom 0–5 is cheap — constant cost in backends, not features.

**Non-Goals:**

- A hub-side aggregator service. If we wanted to re-cluster server-side across backends, we'd need one. We don't; Supercluster handles it client-side at the merge step.
- A hub-side database or persistent state. Everything is derived from `get_meta` + `federation-status.json` + per-viewport fetches.
- Cross-backend filter pre-aggregation. Each backend returns its own centroids with filter attrs; filter counts are computed after merge.
- Country-level filter awareness. The macro view shows unconditional completeness counts from `get_meta`.
- Changes to the per-backend contract (belongs in P1 or its successor).
- Multi-hub topologies (hub-of-hubs). One hub, N backends.

## Decisions

### D1 — Bbox-based backend selection, auto-populated from get_meta

On hub load, the existing `registry.json` fetch kicks off `get_meta` calls per backend (the instance-pill already does this). The hub caches each backend's `bbox` from that response, keyed by URL. On each `moveend`, the viewport bbox is intersected with each cached backend bbox (simple `[minLon, minLat, maxLon, maxLat]` overlap test, microseconds). Only intersecting backends receive a tier fetch.

Rejected alternatives:

- **Bbox in `registry.json`**: bloats the directory, introduces a second source of truth (what happens when a backend's actual region is extended after an import?). Keep the registry pure.
- **Server-side routing service at the hub**: violates the static-file hub invariant. No.
- **No routing — query every backend always**: fan-out cost grows O(backends). Unacceptable at 30+.

Bbox is refreshed whenever `get_meta` is re-fetched (the existing 5-minute registry poll).

### D2 — Re-cluster after merge, using Supercluster weighted points

At the cluster tier, each backend returns pre-aggregated buckets (`get_playground_clusters`). Naively concatenating them produces visible seams at borders — each backend's bucket grid aligned to its own region. Instead, the hub treats each returned bucket as a single "weighted point" with `count`, `complete`, `partial`, `missing` properties, feeds the merged set into Supercluster with `map`/`reduce` callbacks that preserve those counts, and renders the output.

Two important properties:

- Supercluster's kd-bush runs in sub-100ms for even 40k input points. A fan-out of 30 backends each returning 50 buckets is 1500 points — negligible.
- Supercluster is deterministic given the same input, so cluster positions are stable across re-renders (no visual flicker on pan).

Rejected alternatives:

- **Enforce a shared bucket grid across backends**: requires backend coordination and couples release cycles across operators. No.
- **Re-bucket via PostGIS at merge time**: we're client-side; PostGIS isn't available.
- **Skip re-clustering, show backend seams**: visually unacceptable at borders.

### D3 — Progressive render on fan-out arrival, single AbortController

Each fan-out invocation creates one `AbortController`. Per-backend requests are fired in parallel; as each response settles, its contribution is merged into the relevant Supercluster index (or polygon source), and the map repaints. Users see features appear progressively, not all-or-nothing.

On the next `moveend`, the previous `AbortController` aborts; any in-flight requests cancel together. This is the same idiom used by P1's per-backend standalone orchestrator.

Rejected alternatives:

- **Wait for all backends before first paint**: one slow peer holds the whole viewport hostage. Unacceptable.
- **Per-backend AbortControllers**: more complex lifecycle, no real benefit.

### D4 — Skip offline backends silently; show outline in macro view

The `federation-status.json` signal (from `add-federation-health-exposition`) identifies backends whose last poll failed. The hub's bbox router filters these out — no request is attempted until the backend recovers. This avoids 3-second timeouts on every moveend for a dead peer.

In the zoom 0–5 macro view, offline backends still render as country rings, but outlined (not filled), with a small "offline" indicator. The user sees "there is data here, it's just currently unreachable" rather than a silent hole.

When a backend recovers, the next `moveend` (or the next registry-poll tick) picks it up automatically. No cache invalidation dance.

### D5 — Zoom tiers: 0–5 macro, 6–10 server clusters, 11–13 centroids, 14+ polygons

The macro-view tier is new in this proposal; tiers 6–14+ delegate to P1's per-backend RPCs. Threshold 5 is the break below which a viewport bbox at continental aspect ratio covers most of Europe — there is no request that is cheaper than macro-view at this zoom.

Between macro (5) and cluster (6), there's a narrow band where we're displaying many backend bboxes but not yet fetching their data. The one-zoom gap is a deliberate cheap zone — zoom 5 uses the `get_meta` snapshot (already in memory); zoom 6 is the first tier that issues a bbox-filtered fan-out. Users zooming in from continental view see rings dissolve into server clusters at the threshold.

### D6 — Country-level macro view uses get_meta, not a separate RPC

`get_meta` already returns `playground_count` and `bbox`; P1 extends it with `{complete, partial, missing}`. That is all the macro view needs. No separate "macro summary" RPC.

The ring centre is the bbox centroid. For oddly-shaped backends (e.g. a backend that covers a long coastal strip) the centroid can be over the sea — acceptable; this is a continental view, not a cartographic one. If it turns out to be a real problem, we can add an optional `centroid_lat/lon` to `get_meta` in a future tiny proposal.

### D7 — Initial map fit must not spuriously drop into macro view for one-backend hubs

When a hub is configured with only one backend (e.g. during federation bootstrapping, or a single-country deployment that nonetheless uses hub mode for future-proofing), the initial map fit based on the backend's bbox at standard padding typically lands at zoom 10–12 — above the macro threshold. Good.

But on very small regions (e.g. a single city backend), the fit might land above zoom 5 but *visually* look continental because there's so little data. We explicitly clamp the initial-fit zoom to be ≥ `clusterMaxZoom + 1` (i.e. zoom 6) when only one backend is registered. This ensures the user lands in a tier that issues real fetches, not the macro view.

### D8 — No hub-side caching beyond HTTP

Per-viewport responses from each backend are HTTP-cached by the browser (leveraging P1's `Cache-Control` and `data_version`-busting query param). The hub's Supercluster indexes are rebuilt per tier-change, not kept across moveends — simpler lifecycle, no stale-data risk, and clustering is cheap enough that rebuilding is fine.

## Risks / Trade-offs

- **Burst load on borders.** Panning across a border where two backends both carry data doubles the fan-out for one moveend. Mitigated by debounce (300 ms, same as standalone) — rapid pans collapse to a single fetch per backend.
- **Re-cluster perf at max federation size.** At 30 backends each returning 100 cluster buckets, merged input is 3000 weighted points. Supercluster handles that easily; benchmark on Europe-sized test registry before release to confirm.
- **Stale offline-backend display.** If a backend goes offline mid-session, the user may see some stale features for up to one `federation-status.json` poll interval (60s) before the offline marker appears. Acceptable — the data itself isn't wrong, just a few seconds out of date.
- **Border seams at cluster tier despite re-clustering.** Edge case: if one backend's cluster has `count = 1500` and another's has `count = 2` right at the border, Supercluster may still visually group them into one mega-cluster. The stacked-ring proportions are correct (hub computes them from the weighted counts); the visual is a little lopsided. Accept.
- **AbortController browser support.** Fine on every browser we target.
- **Macro-view centroid over water / disputed borders.** See D6. If painful, add `centroid_lat/lon` to `get_meta` later.
- **Registry-poll coupling.** Bboxes are refreshed on the 5-minute registry poll. A backend that changes its bbox mid-session (e.g. an operator extends the relation) sees the change only on the next poll. Acceptable.

## Open Questions

- **What does an in-progress `registry.json` update look like?** If an operator is editing the registry during a user session, does the hub drop removed backends immediately or on the next poll? Probably the next poll (mirrors all other registry semantics). Document either way.
- **Should the hub surface aggregate counts in the macro view centre too, or only in the instance pill?** A zoom-3 ring over France showing "48k" is useful; the same information is already in the pill. Leaning "yes, show it" — the ring is the primary visual at that zoom. Confirm in UX review.
- **Granularity of the filter badge post-merge.** At zoom 11, across 3 backends, filter-match count is accurate but slow if filter attrs require client-side evaluation for every centroid. Budget: 50k centroids × constant-time filter = ~1 ms. Fine.
- **Behaviour if `federation-status.json` is absent** (e.g. hub hasn't deployed `add-federation-health-exposition` yet). Fall back to "assume all backends reachable, rely on per-request timeout"? Yes — describe in the spec as a required fallback so the proposals can deploy in either order.
