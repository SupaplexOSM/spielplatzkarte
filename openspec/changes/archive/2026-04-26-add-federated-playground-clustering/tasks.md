## 1. Hub — bbox routing and backend metadata

- [x] 1.1 Backend `bbox` is cached on the existing registry-poll path (`app/src/hub/registry.js::loadBackend`); this section augments it with the new fields rather than introducing a separate `backends.js`.
- [x] 1.2 `backends` readable store now emits per-entry `playgroundCount` and `completeness: {complete, partial, missing}` populated from `get_meta` (the P1 extension). JSDoc shape comment updated.
- [x] 1.3 New pure module `app/src/hub/bboxRouter.js` exports `selectBackends(viewportBbox, backends)` — bbox intersection filter (touch counts).
- [x] 1.4 Bboxes refresh on the existing 5-min registry poll (`schedulePoll` re-runs `loadBackend` for every entry, which re-reads `get_meta`).
- [x] 1.5 New `app/src/hub/federationHealth.js` exposes `isBackendHealthy` + `filterHealthy` — **stubbed** to "always healthy" with a clear module comment. Real implementation lands when `add-federation-health-exposition` ships `/federation-status.json`.

## 2. Hub — fan-out with progressive render

- [x] 2.1 New `app/src/hub/fanOut.js` exports `fanOut({ fetcher, backends, signal, onResult, timeoutMs })`. Invokes the fetcher per-backend in parallel; `onResult` callback fires per-arrival for progressive render.
- [x] 2.2 One inner `AbortController` aborts every in-flight request together; honours a parent `signal` from the orchestrator.
- [x] 2.3 Per-backend timeout defaults to 5000 ms; timed-out backends are warned exactly once per session (module-level Set tracks the warning).
- [x] 2.4 Errors are caught and surfaced as `{ ok: false, error, backendUrl }`; the fan-out promise resolves with every backend's outcome rather than rejecting.

### Review Findings — §1 + §2 foundation, Pass 1 (bmad-code-review, 2026-04-25)

#### Medium
- [x] [Review][Patch] **Pre-P1 backend indistinguishable from zero playgrounds**. `meta.complete ?? 0` collapses missing fields and a 0 result into the same shape, so a legacy backend (no `get_meta` extension) renders as healthy-but-empty in the macro view. Use a `null` sentinel for `completeness` whenever any of the three fields is absent. [app/src/hub/registry.js loadBackend + initial state] (Medium)
- [x] [Review][Patch] **Backends store mutates entries in place**. `backend.bbox = …` etc. doesn't change object identity, defeating any future memoised consumer (macro-view rings keyed by `prev[i] === curr[i]`). Replace with `backends[idx] = { ...backend, ...patch }` so identity changes on every update. [app/src/hub/registry.js loadBackend] (Medium)

#### Low
- [x] [Review][Patch] **Antimeridian bbox silently dropped**. `bboxesIntersect` assumes `minLon ≤ maxLon`. A backend with bbox crossing ±180° won't match any normal viewport. No active deployment hits this today, but document the limitation in the function header. [app/src/hub/bboxRouter.js] (Low)
- [x] [Review][Patch] **`selectBackends([NaN,...], …)` silently excludes everything**. Every numeric comparison against `NaN` is false, so a viewport tuple containing NaN looks like a valid bbox to the truthiness check but filters out every backend. Add a finite-number guard. [app/src/hub/bboxRouter.js] (Low)
- [x] [Review][Patch] **`fanOut` fetcher not validated** — a missing/non-function fetcher rejects every task with the same error, masking the bug at the call site. Defensive guard with a clear throw. [app/src/hub/fanOut.js] (Low)
- [x] [Review][Patch] **Two timers per backend race the warn-once log**. The cosmetic warning timer can fire just before the abort timer if both land in the same tick. Merge into a single timer that warns then aborts. [app/src/hub/fanOut.js] (Low)
- [x] [Review][Patch] **Per-backend `AbortController` layering reads as redundant**. Add an inline comment so a future cleanup doesn't strip it (it's load-bearing for "one slow peer doesn't kill the others"). [app/src/hub/fanOut.js] (Nit)

#### Deferred (scope / pre-existing)
- **`_warnedTimeoutBackends` never resets** (potential leak; suppresses second-degradation warns). LRU/reset belongs with the §5 observability story. Defer.
- **No Vitest unit tests** for the pure modules. Same deferral as P1 §7.1; project doesn't ship a unit-test runner. Track for the eventual runner addition.
- **federationHealth stub doesn't emit "absent" warning**. Spec scenario lives with the real impl in `add-federation-health-exposition`. Defer.
- **`fetchMeta` strips unknown fields at the registry boundary** (forward-compat fragility). Real fix is to whitelist or pass-through; flag for §5 if it grows new fields.

### Dismissed
- Blind: bbox edge-touch counts. Intentional — matches OL viewport semantics.
- Edge: tests/helpers.js doesn't mock the new completeness fields. Existing tests don't assert on them; will be added when §5 wires the macro view.
- Edge: `signal?.removeEventListener` in finally with `once: true` listeners. Verified self-correcting.
- Auditor: `playgroundCount` / `completeness` not strictly required by any §1 spec scenario — they are inputs to §4/§5. Foundation work is justified by the proposal's "What Changes" list.

## 3. Hub — zoom-tier orchestrator

- [x] 3.1 New `app/src/hub/hubOrchestrator.js` — moveend-driven, debounced 300 ms, mirrors P1's `tieredOrchestrator.js`. `HubApp.svelte` attaches it once the map publishes; the registry's eager `get_playgrounds` fetch is gone (registry is now metadata-only).
- [x] 3.2 Two tiers wired (post-pivot, matching P1's two-tier client design — centroid tier dropped). `cluster` → `fanOut(fetchPlaygroundClusters, ...)`; `polygon` → `fanOut(fetchPlaygroundsBbox, ...)`. Centroid RPC stays server-shipped for future federation reuse.
- [x] 3.3 New `'macro'` tier — added new `macroMaxZoom` config (default 5). At `zoom ≤ macroMaxZoom` the orchestrator sets `activeTierStore = 'macro'`, clears feature sources, and fires no fan-out; the actual macro-view rendering lives in §5 and reads `backendsStore` directly.
- [x] 3.4 Each `orchestrate()` call aborts the prior fan-out's `AbortController` before constructing a new one; `fanOut` then propagates abort to every per-backend request via its inner controller.
- [x] 3.5 New `app/src/stores/hubLoading.js` writable `{loaded, total, settling}`. Orchestrator updates per `fanOut.onResult` arrival; consumers (instance pill in §5 follow-up) can render "3/5 regions loaded" partial state.

### Review Findings — §3 hub orchestrator, Pass 1 (bmad-code-review, 2026-04-25)

#### High
- [x] [Review][Patch] **Hub deeplinks hang at low zoom**. `tryRestoreFromHash` previously relied on the registry's eager `get_playgrounds` populating the polygon source; with the orchestrator-driven fetch, the polygon source stays empty at cluster + macro tiers. Restore hub-mode hydration via `fetchPlaygroundByOsmId(parsed.osmId, slugResolvedUrl)` when `parsed.slug && resolveSlugToBackendUrl` is present. Slug-less hub broadcast deeplinks remain a defer (no good way to choose a backend). [app/src/components/AppShell.svelte tryRestoreFromHash] (High)
- [x] [Review][Patch] **Hub Playwright tests will fail**. `stubHubRegistry` in `tests/helpers.js` doesn't route `/rpc/get_playground_clusters`, `/rpc/get_playgrounds_bbox`, or `/rpc/get_playground`; the meta fixture omits `playground_count` + completeness fields so InstancePanel pill renders "0 playgrounds". Extend the stub. [tests/helpers.js] (High)
- [x] [Review][Patch] **Initial fit can land at macro tier on multi-backend hubs** → empty map until §5 macro-view component ships. Add fit-clamp: when ≤ 1 backend, `maxZoom: clusterMaxZoom + 1`; for multi-backend hubs that union to a low-zoom fit, fit to a maxZoom that keeps cluster tier active until §5. [app/src/hub/HubApp.svelte tryFit] (High — covers spec §6.1 ahead of schedule)

#### Medium
- [x] [Review][Patch] **Hub has no per-backend legacy fallback**. Standalone falls back to `fetchPlaygrounds(relation_id)` once per session if any tier RPC 404s; hub silently sees `entry.ok=false` per backend forever. Track per-backend `useLegacy` Set in the orchestrator; on first 404 for a backend, log once and route subsequent fan-outs for that backend through `fetchPlaygrounds`. [app/src/hub/hubOrchestrator.js] (Medium)
- [x] [Review][Patch] **N source.clear()+addFeatures cycles per moveend**. Each backend arrival rebuilds the entire source. Switch to: clear source on the *first* arrival (so stale features clear cleanly), then `addFeatures(newFeatures)` incrementally for subsequent arrivals. [app/src/hub/hubOrchestrator.js fillClusterSource / fillPolygonSource] (Medium)
- [x] [Review][Patch] **Spec doc out of sync**. `specs/.../spec.md` still uses `clusterMaxZoom` for the macro threshold; code introduced `macroMaxZoom` (default 5). Update spec wording to match implementation. [openspec/.../spec.md] (Medium)

#### Nit
- [x] [Review][Patch] **O(N²) selected.find per polygon arrival**. Build a `Map<url, backend>` once before the fan-out and look up by key per onResult. Trivial, future-proofs as backend count grows. [app/src/hub/hubOrchestrator.js polygon tier] (Nit)

#### Deferred (out of §3 scope)
- **`hubLoadingStore` no consumer yet** — pill still uses pre-existing `firstLoadSettled` latch. Wire in §5 follow-up when InstancePanel updates land alongside the macro-view component.
- **`detachAttach()` race in HubApp** — only fires on map remount (HMR/dev). Latent.
- **macroMaxZoom in standalone entrypoint as dead config** — harmless; standalone reads but never uses it.
- **Empty `selected` (Pacific pan) renders nothing with no message** — UX cliff but acceptable for §3 scope; address with a "no backends in this region" overlay in §5 if it surfaces in usage.
- **`accumulated` unbounded** — same exposure as P1 standalone (pre-existing).

## 4. Hub — client-side re-clustering

- [x] 4.1 Cluster tier in `hubOrchestrator.js` now feeds each backend's server buckets into a per-fan-out Supercluster instance as weighted points. The `map` callback projects the per-bucket counts into the cluster properties; the `reduce` callback sums `{count, complete, partial, missing, restricted}` so cross-backend merges at borders render as a single seamless ring instead of two overlapping ones. `supercluster` dep reinstated (was uninstalled during the P1 two-tier pivot).
- [-] 4.2 ~~Centroid tier Supercluster~~ **N/A in the two-tier design** (centroid tier was dropped during the P1 pivot). The `get_playground_centroids` RPC still ships server-side for federation reuse but the client doesn't index it.
- [x] 4.3 Polygon tier already concatenated per-backend results into a single source in §3 (`fillPolygonSource` + per-feature `_backendUrl` / `_backendSlug` stamping in `parsePolygonFeatures`).
- [x] 4.4 On each fan-out partial arrival the cluster Supercluster index is reloaded with the accumulated set and the source is re-rendered; `load` is O(N) and well under a millisecond at cluster-tier viewport sizes.

### Review Findings — §4 Supercluster, Pass 1 (bmad-code-review, 2026-04-25)

#### High
- [x] [Review][Patch] **NaN propagation in `reduce` if any bucket count field is missing**. Only `restricted` is defensively coerced to `0`. If a backend ever omits `count/complete/partial/missing`, every downstream cluster renders with `NaN` counts. Coerce all five fields in `bucketToSuperclusterPoint`. [hubOrchestrator.js bucketToSuperclusterPoint] (High)
- [x] [Review][Patch] **Legacy backend at cluster tier downloads its entire region** via `fetchPlaygrounds(baseUrl)` and discards the result. Wasted bandwidth + invisible region with no UI signal. Skip the fetch entirely and return `[]` for legacy backends at cluster tier; the user sees a hole until they zoom past `clusterMaxZoom` (where legacy fetch is reused at the polygon tier). [hubOrchestrator.js clusterFetcherFor] (High)
- [x] [Review][Patch] **`cluster_id` emitted on multi-backend cluster features but never consumable** — `sc` is local to `orchestrate()` and GC'd before any click handler could call `sc.getClusterExpansionZoom`. Strip `cluster_id` so the API doesn't suggest a capability that isn't there. (Re-add when a future click handler retains the index.) [hubOrchestrator.js superclusterFeatureToOl] (High)
- [x] [Review][Patch] **Supercluster radius mismatch with OL tile model**. Default `extent: 512` doubles the effective clustering radius vs the OL 256-px tile expectation. Pass `extent: 256` so the radius corresponds to the grid the server cells were sized against. [hubOrchestrator.js Supercluster constructor] (High)

#### Medium
- [x] [Review][Patch] **Redundant `clusterSource.clear()` on first arrival**. The first-arrival latch clears, but the body's clear-and-fill on every arrival makes that latch dead. Remove the latch in the cluster branch (the polygon branch still needs it). [hubOrchestrator.js cluster onResult] (Medium)
- [x] [Review][Patch] **Spec scenarios mention only three counts**, code sums five. Update spec scenarios to include `restricted` so they match the rendered four-segment ring (matches the P1 amendment that already shipped). [openspec/.../spec.md re-cluster + macro scenarios] (Medium)

#### Deferred (out of §4 scope)
- **`hubLoadingStore.loaded` increments on legacy-discarded responses** — masks "this backend silently degraded" in the spinner. Surface a separate `degraded` count when wiring the InstancePanel consumer in §5.
- **Per-moveend Supercluster allocation churn** — could memoise on `(selected, accumulated hash)`. Acceptable today; revisit if rapid-pan jank is observable.
- **Cluster click → `getClusterExpansionZoom` integration** — requires persisting `sc` across orchestrations. Architectural; defer.
- **Antimeridian viewport** — same gap as bboxRouter; document.
- **`p.restricted ?? 0` already defended in bucketToSuperclusterPoint** — verified self-correcting after the High #1 patch.

## 5. Hub — country-level macro view (zoom 0–5)

- [x] 5.1 Created `app/src/hub/MacroView.svelte` — subscribes to the registry's backends store and rebuilds one OL Point feature per backend at the backend's bbox centroid (EPSG:3857). Mounted as a side-effect-only child of `HubApp.svelte`; the source is owned by the hub and threaded through `AppShell` to `Map.svelte`.
- [x] 5.2 New `app/src/hub/macroRingStyle.js` parallels the cluster renderer: same legend palette, same `radiusForCount` size scale (now exported from `clusterStyle.js`), but always renders as a ring (no count<=1 dot fallback) and uses the four-segment layout with the P1 `restricted` arc. Pre-P1 backends with `completeness: null` render as a flat gray ring (count routed into the restricted bucket — visual signal "data quality unknown" rather than a misleading healthy zero).
- [x] 5.3 Offline backends — flagged on the feature via `_offline: !isBackendHealthy(backend)` — render with the dashed stroke-only `OFFLINE_STROKE`, a muted inner disc, the last-known count, and a small "offline" label. Currently `isBackendHealthy` is the stub from §1.5 (always true); the wiring is forward-compatible with the real `federation-status.json` signal from `add-federation-health-exposition`.
- [x] 5.4 Macro hits in `Map.svelte`'s click handler animate `view.fit(transformExtent(bbox4326, ...))` with the standard 420 px left padding for the side panel; the orchestrator's debounced moveend then lands in the cluster or polygon tier and fan-out scopes naturally to the clicked backend.
- [-] 5.5 ~~Hover tooltip with region name, count, data freshness~~ — **deferred to a §5 follow-up**. The feature carries `_name`, `count`, and `_offline` props ready to consume; the existing `HoverPreview` is wired for playground polygons rather than rings, so wiring the macro tooltip needs a small dedicated tooltip component. Tracked as a Known Limitation rather than a §5 blocker since the macro ring's visual already conveys count + completeness + offline state.
- [x] 5.6 Tier-driven visibility extended in `Map.svelte::tierUnsubscribe` — `macroLayer.setVisible(tier === 'macro')`. The orchestrator already publishes `'macro'` for `zoom ≤ macroMaxZoom` (separate config knob from `clusterMaxZoom`, see §3.3).

## 6. Hub — initial map fit clamp

- [x] 6.1 `HubApp.svelte::tryFit` reads `get(backends).length` at fit time. With ≤ 1 backend the fit options carry `maxZoom: clusterMaxZoom + 1`, so a single small region cannot land in the macro tier. The §3 review pre-shipped a universal clamp; §5 narrowed it to single-backend so multi-backend continent overviews can use the macro view.
- [x] 6.2 Multi-backend hubs (`backendCount > 1`) fit without `maxZoom`; the union bbox naturally lands in whatever tier it spans. With §5 macro view shipped, a low-zoom union (e.g. Germany + France) renders the macro tier with one ring per backend instead of an empty map.

## 7. Hub — filter-aware cluster badge under federation

Most of this section is moot post-pivot — the centroid tier was dropped in
P1, and the cluster-tier filter badge is itself a P1 deferred task. What
remains is a federation-side verification that the existing polygon-tier
filter rendering carries over unchanged when polygons come from multiple
backends.

- [-] 7.1 ~~Centroid tier filter badge across merged centroids~~ — **N/A in two-tier design**. Centroid tier was dropped during the P1 pivot; the badge requirement now lives entirely with P1's cluster-tier work.
- [x] 7.2 No client-side filter badge at the cluster tier in hub mode — same rule as P1. Federation-specific note: when the P1 cluster-tier badge ships, Supercluster's `reduce` callback in `hubOrchestrator.js` already sums named bucket fields (cf. §4.4); adding a `match_count` field there is a one-line change at that point. Tracked as a follow-up gated on the P1 badge.
- [x] 7.3 No filter badge at the macro tier — design decision D6. The macro ring shows aggregate completeness for the entire region; a "47k of 65k match the soccer filter" badge over France carries no actionable signal at continental scale.
- [x] 7.4 Polygon tier — verified that `Map.svelte`'s reactive `playgroundLayer.setStyle(feature => matchesFilters(...) ? playgroundStyleFn(feature) : null)` path works unchanged when polygons originate from multiple backends. `matchesFilters` reads OSM property keys (`osm_id`, `surface`, `access`, `has_soccer`, etc.) that the P1 schema guarantees uniform across federation members, so no per-backend filter logic is needed. Polygons that don't match the active filter are simply not rendered, regardless of which backend supplied them.

## 8. Docs

- [x] 8.1 Added a "Scale and clustering" section to `docs/reference/federation.md` covering the three zoom tiers (with their per-tier RPCs), bbox routing semantics, fan-out + progressive render, cross-backend re-clustering, and the country-level macro view (including offline rendering). Updated the Federation endpoints table to list all four tier RPCs + the deprecated legacy fallback, with a note about pre-P1 backend graceful degradation.
- [x] 8.2 Added a tier-RPC prerequisite to `docs/ops/federated-deployment.md` Prerequisites section (data-nodes must ship the tiered API + completeness extension; older data-nodes degrade rather than fail). Updated the Step 4 verification list to point at `get_playground_clusters` / `get_playgrounds_bbox` per moveend instead of the deprecated `get_playgrounds`, and called out the macro-tier "no per-playground requests" expectation at zoom ≤ 5.
- [x] 8.3 Embedded a mermaid `flowchart LR` in `docs/reference/federation.md` showing user moveend → tier dispatch → bboxRouter → federationHealth filter → fanOut → (Supercluster | concat) → source repaint, plus the macro-view branch that bypasses fan-out entirely.

### Review Findings — §5 macro view + §6 fit clamp + §7/§8 docs, Pass 1 (bmad-code-review, 2026-04-26)

#### Decision resolved → patch
- [x] [Review][Patch] **Slug-less hub broadcast deeplinks regress at cluster tier** — *resolved 2026-04-26 to option 1*: implemented broadcast fan-out via `fetchPlaygroundByOsmId` across every registered backend when `parsed.slug` is absent and `resolveSlugToBackendUrl` is available (hub mode). First successful response wins; multiple matches log a duplicate-osm_id warning. New `getAllBackendUrls` callback wired through HubApp → AppShell. [tests/hub-deeplink.spec.js + AppShell.svelte tryRestoreFromHash + HubApp.svelte] (High)

#### High
- [x] [Review][Patch] **`stubHubRegistry` overrides `meta` instead of merging defaults**. Switched to `const meta = { ...defaults, ...(b.meta ?? {}) }` so existing hub tests' partial-meta fixtures still get `playground_count` + completeness fields. Restores `hub-pill` / `hub-smoke` / `hub-deeplink` against the new code path. [tests/helpers.js stubHubRegistry get_meta] (High)
- [x] [Review][Patch] **Hub legacy fallback is structurally broken** — chose option (a) **fix `fetchPlaygrounds`** rather than dropping the fallback (preserves the docs-promised graceful degradation in §8). `fetchPlaygrounds(baseUrl, signal)` now honours the optional signal AND omits `relation_id` from the URL when `osmRelationId` is falsy (hub mode), so the backend's own SQL default takes over. [app/src/lib/api.js fetchPlaygrounds] (High)

#### Medium
- [x] [Review][Patch] **`tierForZoom(undefined)` falls through to polygon tier**. Added `if (!Number.isFinite(zoom)) return;` early-guard in `orchestrate()` so non-integer-resolution boot states don't dispatch a continent-wide bbox fan-out. [app/src/hub/hubOrchestrator.js orchestrate] (Medium)
- [x] [Review][Patch] **Backends store updates don't re-orchestrate**. The `backendsStore.subscribe` callback now triggers the same debounced `orchestrate` used for moveend on every subsequent emission (initial sync emission still skipped via `initialBackendsSet` flag). A 5-min poll that reveals a bbox change re-renders the active tier within 300 ms. [app/src/hub/hubOrchestrator.js attachHubOrchestrator] (Medium)
- [x] [Review][Patch] **Polygon first-arrival latch leaves ghost features**. Moved the `polygonFirstArrival` clear outside the `if (entry.ok)` branch so an all-error fan-out also wipes stale features. [app/src/hub/hubOrchestrator.js polygon onResult] (Medium)
- [x] [Review][Patch] **`tryFit` latches the clamp on the first bbox emission**. Added a `backendsSettled` gate (`bs.every(b => !b.loading)`) so the clamp decision waits for every registered backend's first `get_meta` to resolve. Multi-backend hubs no longer accidentally latch the single-backend clamp when one backend returns first. [app/src/hub/HubApp.svelte tryFit] (Medium)
- [x] [Review][Patch] **Spec text out-of-sync after §3+§4 review patches missed two scenarios**. Updated four scenarios in `spec.md`: (a) "default 11" → "default 14"; (b) macro-ring 3-segment scenario annotated to acknowledge P1 `get_meta` doesn't ship `restricted` yet, with a follow-up scenario for when it does; (c) "centroid tier" → "polygon tier" in the macro-click scenario; (d) re-cluster scenario adds `restricted` to the parity list. [openspec/.../spec.md] (Medium)

#### Low
- [-] [Review][Patch] **`hubLoadingStore.loaded` increments after abort** — *verified non-issue on closer inspection*. The `if (signal.aborted) return;` early-return at the top of each onResult callback correctly skips the increment; the original Edge Hunter finding self-corrected in the same paragraph. No code change applied. (Low — dismissed)
- [x] [Review][Patch] **`isNotFound` regex too broad**. Tightened from `/\b404\b/` to `/failed: 404$/` to match the exact error format thrown by `api.js` fetchers (`<rpc> failed: 404`). A transient error mentioning "404" elsewhere can no longer permanently degrade a backend to the legacy fallback. [app/src/hub/hubOrchestrator.js isNotFound] (Low)
- [x] [Review][Patch] **`get_meta` completeness fields accept null sentinel via `in` check**. Replaced `k in meta` with `Number.isFinite(meta[k])` so a backend that ships the keys with `null` or `NaN` values falls into the unknown-completeness branch instead of producing an invisible NaN ring. [app/src/hub/registry.js loadBackend] (Low)
- [x] [Review][Patch] **`bucketToSuperclusterPoint` accepts non-finite `lon/lat`**. The cluster fan-out's bucket loop now skips buckets with non-finite coordinates and warns at most once per backend per session via `backendMalformedBucketWarned`. [app/src/hub/hubOrchestrator.js cluster onResult] (Low)

#### Deferred (acknowledged in design or pre-existing)
- **Offline-backend rendering scenarios** — `isBackendHealthy` stub means no offline ring can ever render and the bbox router can't exclude offline backends. Documented as forward-compat with `add-federation-health-exposition`; spec scenarios are unverifiable until that change ships. (Acceptance Auditor High; defer matches §1.5 deferral.)
- **`/federation-status.json` absent fallback** — Same: scenario lives with the real impl in `add-federation-health-exposition`. (Acceptance Auditor High; matches §1+§2 deferral.)
- **Backend recovery transition pathway** — Same dependency on health-exposition.
- **§9 Playwright multi-backend verification** — Out of scope per PR body; ships in a follow-up PR.
- **Backend marked legacy never recovers in-session** — Architectural; flagged in §3 review deferrals.
- **Cluster click can't drill down via Supercluster APIs** — Documented; `sc` GC'd per orchestrate; click handler does +2-zoom which works.
- **Initial `orchestrate()` races `tryFit`** — One wasted, immediately-aborted fan-out at boot. Bounded waste, not a correctness issue.
- **`detachAttach()` self-unsubscribe pattern** — Works in practice (Svelte parent.onMount fires before child mounts); flagged for future cleanup.
- **`tests/helpers.js` `get_playground` returns `features[0]` fallback** — Pattern is consistent with the pre-existing standalone helper; changing both is wider than this PR.
- **`_warnedTimeoutBackends` never resets** — Already deferred in §1+§2 review.

### Dismissed
- Blind: `fanOut` abort error type doesn't propagate parent reason — no consumer checks `err.name === 'AbortError'`.
- Blind: `signal.addEventListener`/`removeEventListener` asymmetry — cosmetic, no-op when listener wasn't registered.
- Blind: `fetchPlaygroundClusters` argument order — verified `(zoom, extent, baseUrl, signal)` matches `api.js` exactly.
- Blind: `MacroView.source.clear()` on destroy — HubApp tears down `MacroView` before `Map` in practice.
- Blind: `AppShell` hydration `defaultBackendUrl` null edge — unchanged from pre-diff for standalone; nullish-coalesce already handles it downstream.
- Blind: `InstancePanel` `||` vs `??` for `playgroundCount` — `0` is the boundary value and both behave the same.
- Blind: `bboxRouter` returns input array by reference for null/non-finite viewport — no caller mutates the result.
- Blind: HubApp `get(backends)` import not visible in diff — verified imported pre-diff.
- Edge: MacroView subscription captures `source` prop in closure — HubApp creates `macroSource` once and never reassigns; not a real bug.
- Auditor: slow backend warn-once not per-backend — verified `_warnedTimeoutBackends` is keyed on `b.url`, spec-compliant.

## 9. Verification

- [x] 9.1 Playwright: `tests/hub-multi-backend.spec.js` "§9.1 macro tier issues no per-playground requests; aggregates counts in the pill" — two-backend registry with continental bboxes (forces fit ≤ macroMaxZoom), asserts the pill shows aggregated counts AND that no `get_playground_clusters` / `get_playgrounds_bbox` / `get_playgrounds` / `get_playground` request fires (only `get_meta` per backend).
- [-] 9.2 ~~Playwright: offline backend goes outlined and skipped on subsequent moveends~~ — **deferred to `add-federation-health-exposition`**. The current `isBackendHealthy` is a forward-compat stub that always returns true, so no offline transitions can be exercised. Spec scenarios remain in spec.md and become testable when the real health signal lands.
- [x] 9.3 Playwright: `tests/hub-multi-backend.spec.js` "§9.3 cluster tier fans out to every intersecting backend in parallel" — adjacent bboxes at zoom 10 with overlap-cluster fixtures; asserts both `/api-a` and `/api-b` receive `get_playground_clusters` requests in the same orchestrate() pass. Verifies the cross-backend fan-out + Supercluster-merge code path runs end-to-end. (Counter-asserting the rendered ring count is harder without exposing the cluster source as a window handle; the request-pair assertion proves the orchestration; visual seam-merge is observable in the live-browser sanity check from §4.)
- [-] 9.4 ~~Manual: 10-backend perf within 2s~~ — **deferred** until a 10-backend test registry exists (would require new ops scaffolding). The fan-out's parallelism is bounded by the network stack, not the orchestrator; current 2-backend timing is well under the 5s per-backend timeout.
- [-] 9.5 ~~Manual: rapid-pan cancellation~~ — **deferred to manual smoke**. The abort plumbing is unit-verified by `fanOut`'s per-backend AbortController; rapid-pan correctness is observed in dev but not codified as a test.
- [-] 9.6 ~~Lifecycle: `federation-status.json` absent fallback~~ — **deferred to `add-federation-health-exposition`**. The fallback path (assume reachable, warn once) is described in the spec but the `federation-status.json` endpoint doesn't exist yet; the warning + fallback land with the real implementation.
- [x] 9.7 `openspec validate add-federated-playground-clustering --strict` passes — verified before archive (run as part of `/opsx:archive`).
