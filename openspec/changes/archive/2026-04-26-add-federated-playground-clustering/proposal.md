## Why

The hub shipped in v0.2.0 fans out feature-fetching across multiple regional backends but has no clustering and no zoom-tier awareness — at Europe scale that means a Paris user's browser holds every polygon in DE, FR, NL, CH, IT, etc. simultaneously, which is not tractable.

Proposal `add-tiered-playground-delivery` gives each backend a zoom-scoped contract (clusters / centroids / polygons, all bbox-scoped). This proposal adds the hub layer on top: a bbox router that only queries backends whose region intersects the viewport, a fan-out + progressive-render pipeline that tolerates slow or offline peers, a client-side re-clusterer that merges server clusters across backends (so the seam between DE and FR disappears in the output), and a country-level macro view for the zoom-0-to-5 "continent overview".

The trigger to do this now is the Europe-coverage ambition: federation scale goes from 1–3 backends (the current trial topology) to plausibly 30+. Every architectural assumption that works in the small breaks in the large — most notably the "fetch everything, let the browser sort it out" pattern in hub-mode feature loading. This proposal closes that gap without introducing a new server tier or a central aggregator service — the hub stays a static-file + registry directory, as the federation deployment docs promise.

## What Changes

- **Hub — backend-bbox routing**:
    - On hub load, fetch `api.get_meta` for every backend in `registry.json` (already done for the instance-pill); extract each backend's `bbox` and cache in a `backends` store.
    - On each `moveend`, compute the viewport bbox in WGS84 and filter to the subset of backends whose bbox intersects — only those are queried.
    - Bboxes are auto-populated from `get_meta`; `registry.json` stays a URL directory. Operators do not hand-edit bboxes.

- **Hub — parallel fan-out with progressive render**:
    - Each tier's fetcher (clusters / centroids / polygons from P1) is wrapped in a hub-level `fanOut(fetcher, bboxFilter, signal)` that invokes the underlying fetcher in parallel across selected backends.
    - Results stream back as they arrive; the merged source is incrementally updated so the map repaints as each backend responds.
    - A single `AbortController` per fan-out; all pending backend requests cancel together on the next `moveend`.
    - Offline backends (per the `federation-status.json` signal from `add-federation-health-exposition`) are skipped silently — no request is issued until health returns.

- **Hub — client-side re-clustering across backends**:
    - Cluster tier: each backend returns its own bucketed clusters (via `get_playground_clusters`). The hub re-indexes the merged results through Supercluster as weighted points, using `map`/`reduce` callbacks that preserve the complete/partial/missing counts. The rendered clusters therefore span backends seamlessly at borders.
    - Centroid tier: each backend returns raw centroids; the hub builds one Supercluster index over the union.
    - Polygon tier: no re-merging needed; polygons from different backends never overlap geographically (relations are disjoint).

- **Hub — country-level macro view (zoom 0–5)**:
    - Below `clusterMaxZoom`, no backend fetches happen. Instead, one ring per backend is rendered at the backend's bbox centroid, sized by `playground_count` and segmented by the `{complete, partial, missing}` fields from `get_meta` (added in P1).
    - Clicking a country-ring zooms to that backend's bbox.
    - Offline backends render as outlined (not filled) rings with a small "offline" badge, sourced from `federation-status.json`.

- **Hub — filter-aware cluster badge** (carried from P1 into the federated context):
    - Filter-matching count is computed client-side after re-clustering over the merged centroids. Works seamlessly across backends because the filter attributes are on the centroid rows.
    - Not rendered on the country-level view (the `get_meta` macro summary doesn't carry filter attrs).

- **Docs**:
    - Extend `docs/reference/federation.md` with a "Scale and clustering" section describing the three tiers and the country-level view.
    - Update `docs/ops/federated-deployment.md` (in-flight in `document-federated-hub-deployment`) with a note on the bbox auto-population requirement (backends must implement P1).

Out of scope (explicit non-goals):

- A hub-side aggregator service. The hub remains static-file + registry.
- A hub-side database or cache beyond HTTP and in-memory Supercluster indexes.
- Cross-backend filter pre-aggregation.
- Country-level filter awareness.
- Changes to P1's per-backend contract — anything touching the RPCs belongs in P1 or its successor.

## Dependencies

- **Blocks on `add-tiered-playground-delivery`** (P1). The bbox-scoped RPCs are pre-requisites for any hub-side fan-out beyond what v0.2.0 already does.
- **Blocks on `add-federation-health-exposition`**. Skipping offline backends silently — and rendering them as outline-only in the macro view — depends on the `federation-status.json` signal that change introduces.
- **Soft dep on `document-federated-hub-deployment`**. Operator docs need to reflect the scale target; can land in either order without blocking.

## Capabilities

### New Capabilities

- `federated-playground-clustering`: Hub-side bbox routing, fan-out + progressive render, client-side re-clustering of multi-backend results, and the country-level macro view at zoom 0–5.

### Modified Capabilities

- `hub-ui-parity`: the hub's initial map fit logic gains a "zoom not lower than `clusterMaxZoom + 1` when only one backend is registered" clause, so single-backend hubs don't spuriously drop into the macro view. Existing scenarios remain correct.

## Impact

- `app/src/hub/HubApp.svelte` — replaces one-shot multi-backend fetchPlaygrounds with a zoom-tier orchestrator (hub equivalent of P1's standalone orchestrator).
- `app/src/hub/backends.js` (new or extension of `registry.js`) — bbox routing, health-signal integration, per-backend AbortController management.
- `app/src/hub/fanOut.js` (new) — parallel-fetcher utility with progressive merge.
- `app/src/hub/macroView.svelte` (new) — country-level ring renderer for zoom 0–5.
- `app/src/components/ClusterLayer.svelte` (from P1) — extended to consume weighted points from the hub's merge.
- `docs/reference/federation.md` — new scaling section.
- `docs/ops/federated-deployment.md` — cross-reference to this proposal (once the parent change lands).
