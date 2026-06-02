## 1. Backend — tiered RPCs

- [x] 1.1 Add `api.get_playground_clusters(z int, min_lon float8, min_lat float8, max_lon float8, max_lat float8)` in `importer/api.sql` — buckets features by `ST_SnapToGrid` using `cell_size_m` derived from `z`; returns `{lon, lat, count, complete, partial, missing}` per bucket as a JSON array
- [x] 1.2 Add `api.get_playground_centroids(min_lon, min_lat, max_lon, max_lat)` returning per-playground rows: `osm_id`, `lon`, `lat`, `completeness` ('complete'|'partial'|'missing'), packed filter-attrs object
- [x] 1.3 Add `api.get_playgrounds_bbox(min_lon, min_lat, max_lon, max_lat)` — same response shape as `get_playgrounds` but scoped to bbox intersection; reuses the `playground_stats` materialised view
- [x] 1.4 Extend `api.get_meta` to include `{complete, partial, missing}` alongside the existing `playground_count` (sums over `playground_stats`)
- [x] 1.5 Add `COMMENT ON FUNCTION api.get_playgrounds(bigint) IS 'DEPRECATED: use get_playgrounds_bbox. Scheduled for removal in the release after next.'`
- [x] 1.6 Add a computed `grid_cell` column or expression to `playground_stats` (or inline in the cluster function) — whichever benchmarks faster on a Germany-sized dataset. *Decision: inline `ST_SnapToGrid(centroid_3857, cell_size_m(z))` in `get_playground_clusters` — avoids one column per zoom in the MV; with the GiST index on `centroid_3857` the cost is negligible on Germany-sized datasets and the cluster RPC stays stateless/cacheable per `(z, bbox)`.*
- [-] 1.7 ~~Add `import_version` (or `data_version`) bump timestamp, written on successful import and surfaced via `get_meta`, for client-side cache-bust~~ **Deferred to `add-federation-health-exposition`** — that change introduces `api.import_status(last_import_at, ...)` which is the same data at a better-scoped location. Adding it here would create a schema merge conflict when federation-health lands.
- [x] 1.8 Grant EXECUTE on all three new functions to `web_anon`
- [x] 1.9 Update `dev/seed/seed.sql` so `make seed-load` exercises all three new RPCs with the 4-playground fixture

### Review Findings — Pass 1 (bmad-code-review, 2026-04-24)

Three review layers ran over §1 SQL. Smoke test (`make seed-load` + curl) passed before review. Seven real patches + ~15 dismissed.

#### Critical — spec contract mismatches
- [x] [Review][Patch] `get_playground_centroids` emits filter attrs as flat top-level keys; spec §"Centroids RPC returns per-feature rows" requires them nested under `filter_attrs: {has_water, ...}`. Fix the RPC in both `importer/api.sql` and `dev/seed/seed.sql`. [Critical]
- [x] [Review][Patch] Spec §"get_meta carries data_version" is unmet. Task 1.7 was deferred to `add-federation-health-exposition` but the spec scenario remains. Honest fix: strike the `data_version` scenario from `specs/tiered-playground-delivery/spec.md` with a cross-reference to the federation-health change, where the feature will ship. [Critical]

#### Medium
- [x] [Review][Patch] Empty-string parity drift in completeness rule: JS `!!props.name` is false on `name=''` but SQL `pl.name IS NOT NULL` is true. Same for `operator`, `surface`, `opening_hours` via hstore. Fix with `NULLIF(col, '')` (or `col IS NOT NULL AND col <> ''`) so the classification matches `app/src/lib/completeness.js`. Both SQL files. [Medium]
- [x] [Review][Patch] `get_meta` uses `LEFT JOIN playground_stats`, so the invariant `playground_count = complete + partial + missing` can fail if a playground is missing from the MV. Switch to `INNER JOIN` (or count from `playground_stats` directly) so the spec invariant holds by construction. [Medium]

#### Low
- [x] [Review][Patch] Cluster `cell_size` CTE casts to `::numeric`; `ST_SnapToGrid(geom, float8)` accepts numeric via implicit cast (empirically works — smoke test green), but `::float8` is clearer and matches PostGIS's actual function signature. Cosmetic. [Low]
- [x] [Review][Patch] Cluster cell-size table has two non-monotonic ratios (z4→5 = 2.08×, z7→8 = 1.875×). Retune for pure halving or document the rounding explicitly. [Low]

### Dismissed (pass 1)
- Blind Hunter B2 (numeric→float8 cast breaks function resolution): empirically works; smoke test green. Kept as cosmetic patch only.
- Blind Hunter B3 (access_restricted misses `no`/`permit`/...): verified matches `app/src/lib/vectorStyles.js::isRestrictedAccess` which only considers `private`/`customers`. Not a drift.
- Blind Hunter B5 (get_playgrounds_bbox shape drift): verified identical in smoke test (returned GeoJSON parsed correctly).
- Blind Hunter B9 (no DROP MV before CREATE): false finding — `DROP MATERIALIZED VIEW IF EXISTS public.playground_stats CASCADE;` is already present pre-diff.
- Edge Hunter E11 (seed-load may not refresh MV): empirically works — `make seed-load` produced correct cluster/centroid responses in smoke test.
- Auditor A5 (centroid osm_type): spec lists only `osm_id`, so the omission is permissible; not a mismatch.
- Various hardening concerns (E5 dateline, E6 grid-boundary, E7 out-of-range z, E9 no LIMIT, E14 NaN bbox, B1 cartesian-join style, B10 skeys perf, A3 centroid-based intersection note): logged as follow-up hardening, not Section 1 blockers.

## 2. Client — API layer + fetchers

- [x] 2.1 Add `fetchPlaygroundClusters(zoom, extentEPSG3857, baseUrl)`, `fetchPlaygroundCentroids(extentEPSG3857, baseUrl)`, `fetchPlaygroundsBbox(extentEPSG3857, baseUrl)` in `app/src/lib/api.js`
- [x] 2.2 All three fetchers accept an `AbortSignal` so moveend handlers can cancel in-flight requests
- [x] 2.3 Mark `fetchPlaygrounds` deprecated with a JSDoc `@deprecated` tag and a one-time console warning on first call
- [x] 2.4 Extend `fetchMeta` typing to surface the new `{complete, partial, missing}` ~~and `data_version`~~ fields (data_version moved to `add-federation-health-exposition` alongside task 1.7)
- [x] 2.5 ~~Add `clusterMaxZoom` **and `centroidMaxZoom`**~~ Add `clusterMaxZoom` (default now 13; `centroidMaxZoom` removed in the two-tier pivot) to `app/src/lib/config.js`; surface via `window.APP_CONFIG` and the nginx entrypoint

## 3. Client — zoom-tier orchestrator

- [x] 3.1 Replace the `fetchPlaygrounds` call in `StandaloneApp.svelte:onMount` with a `moveend`-driven orchestrator that dispatches to the right fetcher based on `view.getZoom()` — implemented in `app/src/lib/tieredOrchestrator.js`
- [x] 3.2 Orchestrator debounces by 300 ms and uses `AbortController` to cancel any request superseded by a later moveend
- [x] 3.3 Three layers are created up front: `clusterLayer`, `centroidLayer`, `polygonLayer`; visibility is toggled on zoom transition, not recreated. Driven by `activeTierStore` (new `app/src/stores/tier.js`)
- [x] 3.4 `clusterLayer` source is populated from `get_playground_clusters` with no client-side clustering (server buckets are authoritative at that zoom)
- [-] 3.5 ~~`centroidLayer` wraps a Supercluster instance fed from `get_playground_centroids`~~ **Reverted in two-tier pivot.** Cluster tier now covers zoom ≤ 13 via the same server-bucketed `get_playground_clusters` RPC; fine SQL grid cells (≥ z=11) surface sparse regions as single-child dots. `supercluster` dependency removed. The `get_playground_centroids` RPC ships server-side as unused-but-available for future reuse.
- [x] 3.6 `polygonLayer` continues to use the existing `playgroundStyleFn`; `playgroundSourceStore` is published only when this layer is active (Map.svelte subscribes to `activeTierStore`)
- [x] 3.7 Gracefully fall back: if a tier's RPC 404s (backend upgrade in progress), the orchestrator falls back to the legacy `fetchPlaygrounds` once (one-time warning logged) — note: the spec envisions "next tier up" but since all three new RPCs land together in one deploy, legacy fallback covers the realistic upgrade-skew case

### Review Findings — §2 + §3, Pass 1 (bmad-code-review, 2026-04-24)

Three review layers over §2/§3 client work. Build clean; not yet runtime-validated end-to-end.

#### High
- [x] [Review][Patch] **AbortController race in orchestrator**: `await fetchX(...)` doesn't check `signal.aborted` after resuming — a superseded call that resolved just before `abort()` can still overwrite the fresh source. Guard with `if (signal.aborted) return;` after each `await`. [app/src/lib/tieredOrchestrator.js orchestrate] (High)
- [x] [Review][Patch] **Initial-tier flash**: `activeTierStore` default `'polygon'` fires synchronously on Map.svelte's subscribe, so polygon layer is briefly visible (empty) before the orchestrator writes the correct tier. Change default to `null` and have Map's subscription no-op on null. [app/src/stores/tier.js; app/src/components/Map.svelte] (High)

#### Medium
- [x] [Review][Patch] **`warned404` latches but keeps hitting dead tier**: once the legacy fallback fires for an old backend, every subsequent moveend still fetches the failing tier RPC and logs `[tier] X fetch failed`. Route to legacy directly once `warned404` is set. [app/src/lib/tieredOrchestrator.js] (Medium)
- [x] [Review][Patch] **Abort-before-first-fetch race**: `abort` is null at attach time; if the component unmounts before `orchestrate()` even starts, detach can't cancel the first pending fetch. Create `AbortController` synchronously at attach. [app/src/lib/tieredOrchestrator.js attachTieredOrchestrator] (Medium)
- [x] [Review][Patch] **Cluster/centroid clicks silently clear selection**: `olMap.on('click')` uses `layerFilter: l => l === playgroundLayer`, so clicks on cluster/centroid features hit nothing and fall into the `else` branch that calls `selection.clear()`. §4.5/§5 will wire proper cluster-zoom/centroid-select; for now, just don't clear selection when clicking cluster/centroid hits. [app/src/components/Map.svelte click handler] (Medium)

#### Low
- [x] [Review][Patch] **Overpass/empty-baseUrl dev mode**: when `apiBaseUrl === ''`, the orchestrator POSTs to `''/rpc/...` (Vite dev server 404s) and pollutes the console. Guard in StandaloneApp — skip `attachTieredOrchestrator` when baseUrl is empty (no data path in that mode today). [app/src/standalone/StandaloneApp.svelte] (Low)
- [x] [Review][Patch] **`public/config.js` "both modes" comment misleads**: Tiered delivery is standalone-only in P1. Hub-side fan-out lands in `add-federated-playground-clustering` (P2). Clarify the comment. [app/public/config.js] (Low)

### Dismissed (pass 1)
- Blind: PostgREST numeric→string serialization silently NaN-ing coords. Verified my SQL returns `float8` (`ST_X/ST_Y`) which PostgREST emits as JSON number literals. Smoke test confirmed numeric values in responses.
- Blind: `debounced.cancel?.()` optional-chain masking missing cancel. Verified `debounce` in `app/src/lib/utils.js:40-48` has `cancel`.
- Blind: Supercluster default-import interop. Correct for v8.0.1 ESM.
- Edge: Hub mode doesn't wire the orchestrator. Intentional — P2 (`add-federated-playground-clustering`) adds hub-side fan-out. Only the `public/config.js` comment needs a tweak (captured above).
- Edge: Filter reactivity polygon-only at cluster/centroid zooms. Explicitly deferred to §4.6 per task list.
- Edge: Dead `filter_attrs` on the wire until §4 reads it. Deferred to §4 by design.
- Edge: NearbyPlaygrounds local-scan fallback returns [] at non-polygon tiers. §5.2 explicitly removes that fallback.
- Edge: Deep-link restore broken at zoom <14 (polygon source empty). §5.1 explicitly fixes this via hydration fetch.
- Edge: Supercluster clustering 4 fixture playgrounds into one bubble on dev seed. Cosmetic; tests haven't been written yet.
- Edge/Blind: pitch-layer vs orchestrator moveend race. Both use 300ms debounce; no ordering guarantee but no correctness concern (zIndex settles visual order).
- Auditor: `activeTierStore` default flash. Merged with High #2 above.
- Auditor: `warned404` never resets. Merged with Medium #1 above.

## 4. Client — cluster renderer + Supercluster integration

- [x] 4.1 Add `supercluster` to `app/package.json` dependencies; run `npm install` in `app/`
- [-] 4.2 ~~Create `app/src/components/ClusterLayer.svelte` — encapsulates a Supercluster instance, the OL source/layer pair, and the canvas renderer~~ *Not extracted — Supercluster lives in `app/src/lib/tieredOrchestrator.js`, the OL layer is created in `Map.svelte`, and the canvas renderer is in `app/src/lib/clusterStyle.js`. Equivalent separation of concerns without the component extraction. Re-evaluate for P2 (hub) if the hub wants its own cluster wiring.*
- [x] 4.3 Implement `stackedRingRenderer` in `app/src/lib/clusterStyle.js` — canvas 2D draw of the ring with complete/partial/missing segments + count; cached by `(count_bucket, c_frac, p_frac, m_frac)` with a bitmap pool keyed on that tuple + pixelRatio
- [x] 4.4 Single-child clusters render as a single completeness-colour dot (no ring, matches polygon colour at higher zoom)
- [x] 4.5 Cluster click zooms toward the cluster centre (`view.animate` + 2 zoom levels, capped at view maxZoom). Note: the spec said "fit to bounding extent" — extent isn't knowable from a server-bucketed cluster without an extra round-trip, so we zoom in by 2 which naturally transitions to the centroid tier. Refine if UX testing shows drift.
- [ ] 4.6 Filter badge: below the count, a small pill "N match" rendered in the same canvas when `$filterStore` has any active filter (two-tier pivot: now applies to the cluster tier generally, not "centroid tier and above")
- [ ] 4.7 Hover on a cluster shows a small tooltip (reuse `HoverPreview`) listing aggregate counts

### Review Findings — §4 renderer, Pass 1 (bmad-code-review, 2026-04-25)

Three layers over the canvas stacked-ring + cluster click. Build clean; no runtime eyeballing yet.

#### Medium — spec drift
- [x] [Review][Patch] **Radius table drifts +2 px from spec**. Spec §"Ring renders scale with count" mandates radii 12 / 14 / 18 / 22 CSS px for counts 5 / 25 / 100 / 500; `clusterStyle.js::radiusForCount` returns 14 / 18 / 22 / 26. One-line fix. [app/src/lib/clusterStyle.js] (Medium)
- [x] [Review][Patch] **Cluster count not rendered in tabular numerals**. Spec calls for "tabular numerals"; current font stack uses `system-ui` which defaults to proportional figures. Add `ctx.fontFeatureSettings = '"tnum" 1'` (or add `ui-monospace` to the font stack). [app/src/lib/clusterStyle.js drawStackedRing] (Medium)
- [x] [Review][Patch] **Cache key inconsistency — `m10` is derived, draw uses raw fractions**. Two features with different raw (complete, partial, missing) but the same rounded `(c10, p10)` collide in the cache under the same key; whichever paints first wins. Either round the draw inputs to tenths, or change the cache key to include the *actual* rounded `m10`. [app/src/lib/clusterStyle.js cacheKey + drawStackedRing] (Medium)

#### Low
- [x] [Review][Patch] **Single-child dot radius 6 ≠ centroid tier default 5**. Spec says single-cluster dot "size matches the centroid tier's default point size"; currently 1 px larger. [app/src/lib/clusterStyle.js renderStackedRing] (Low)
- [x] [Review][Patch] **No pointer-cursor affordance on cluster/centroid hover**. Click-to-zoom is wired but the pointermove handler only sets `cursor: pointer` for polygon + overlay layers. Add cluster and centroid layers to the hit-test that drives cursor style. [app/src/components/Map.svelte pointermove handler] (Low)

### Dismissed (pass 1, §4)
- Blind: OL renderer caching per-Style. Assumption flagged; OL docs (and actual behaviour across OL versions in use) invoke the renderer per feature per frame — not a bug.
- Blind: `count <= 1` colour pick order — would only misfire if data is malformed (`count=1` with two non-zero counts). Upstream invariant issue, not a render bug.
- Blind: Negative `m10` in cache key as a sentinel. Cosmetic; doesn't collide with valid keys.
- Blind: Unbounded bitmap cache across pixelRatio. Bounded in practice (~8k keys worst case), no eviction needed.
- Blind: Total-zero silent draw. Indicates upstream data bug, not renderer's concern.
- Edge: Supercluster `getClusterExpansionZoom` for centroid-cluster clicks — real UX improvement but requires exposing the Supercluster index across a module boundary; defer to a follow-up refactor once §4.6 lands.
- Edge: `+2` nudge not boundary-aware for custom `clusterMaxZoom`. Two clicks to drill out of cluster tier in unusual configs; acceptable.
- Edge: Centroid-cluster visually inconsistent with cluster-tier ring (still uses placeholder circle). Intentional — §4.6 will reuse the renderer once centroid-clusters carry completeness breakdowns.
- Edge: Initial 200-ring paint latency at Germany zoom 10. ~200 ms first paint; cached thereafter. Acceptable.
- Auditor: `view.fit(extent)` vs `view.animate(zoom + 2)` — deviation documented in §4.5 note. Acceptable for WIP.
- Auditor: ClusterLayer.svelte component not extracted. Current three-file split (orchestrator + Map.svelte + clusterStyle.js) is equivalent; documented in §4.2.

## 5. Client — selection + deeplink adaptation

- [x] 5.1 `AppShell.svelte::tryRestoreFromHash` hydrates the polygon source on demand when empty. Implementation deviates from the spec wording (which proposed `get_nearest_playgrounds` + `get_playgrounds_bbox`) in favour of a simpler one-shot `api.get_playground(osm_id)` lookup — single round-trip, no bbox math. The new RPC is added in `importer/api.sql` + `dev/seed/seed.sql`.
- [x] 5.2 `NearbyPlaygrounds` distance-scan fallback removed. `nearestFromSource` and the `||`/`catch` fallbacks all gone. `selectSuggestion` now hydrates the polygon source via the new `fetchPlaygroundByOsmId` when the feature isn't yet loaded (cluster tier).
- [x] 5.3 Cluster-click does not set a hash — handled in `Map.svelte` click handler (it animates the view and returns before selection is touched).

### Review Findings — §5, Pass 1 (bmad-code-review, 2026-04-25)

#### Medium
- [x] [Review][Patch] **Hydration error path leaves `hashRestored=false` → fetch storm**. If `fetchPlaygroundByOsmId` throws (network outage, 500), the catch logs and `finally` resets `hydrating=false` but `hashRestored` is never set. Every subsequent `playgroundSource` 'change' event re-fires the fetch. Set `hashRestored=true` (or implement a small retry budget) in the catch branch. [app/src/components/AppShell.svelte tryRestoreFromHash catch] (Medium)
- [x] [Review][Patch] **`fetchPlaygroundByOsmId` swallows non-200 as null** — collapses 500/503/CORS into the same outcome as a legitimate empty result. Throw on `!res.ok` so the caller can distinguish "not found" (returns null body) from "server error" (throws), and the caller's retry/fail logic can act accordingly. [app/src/lib/api.js fetchPlaygroundByOsmId] (Medium)
- [x] [Review][Patch] **NearbyPlaygrounds hydrated feature lacks `_backendUrl`**. Standalone-fine (defaultBackendUrl falls through), hub-broken (the next selection of the same feature reads `_backendUrl` as undefined and uses the wrong backend). Stamp `feature.set('_backendUrl', backendUrl)` immediately after `readFeatures`. [app/src/components/NearbyPlaygrounds.svelte selectSuggestion hydration] (Medium)
- [x] [Review][Patch] **Spec missing a "single-feature lookup" backend requirement**. The new `api.get_playground(osm_id)` RPC is not described anywhere in `spec.md`. Add a Requirement covering the osm_id input, the GeoJSON Feature output shape, the relation-over-way preference, and the standalone region-scoping caveat. [openspec/.../spec.md] (Medium)

#### Low
- [x] [Review][Patch] **Hub-slug deeplink in standalone spins forever**. `if (parsed.slug) return;` silently bails without setting `hashRestored=true`. Every source change re-fires. Set `hashRestored=true` after a one-time warn. [app/src/components/AppShell.svelte tryRestoreFromHash] (Low)

#### Deferred (scope / pre-existing)
- **Hydration → orchestrator wipe race**: When view.fit zooms past `clusterMaxZoom`, the orchestrator's next moveend calls `polygonSource.clear()` on the polygon-tier fetch — the hydrated feature is replaced by a fresh one with the same osm_id. The selection store still references the orphan; `PlaygroundPanel` works (reads frozen properties) but any feature-instance-comparison style would miss. Pre-existing pattern (any post-pan moveend on the polygon tier has the same orphan issue). Real concern but out of §5 scope; would need a "selection re-attach on source change" hook. Defer to a follow-up.
- **`R`/`W` precedence in `get_playground`**: SQL `ORDER BY (osm_id < 0) DESC` always prefers a relation over a way of the same magnitude. URL hash parser currently strips the `R`/`W` letter (`parseHash` returns only `{slug, osmId}`). Fixing requires both deeplink format change (`#W123` vs `#R123` round-trip) and a 2nd RPC parameter. Real but rare in OSM. Defer.
- **`hashchange` event not wired**: Pasting `#W123` into the URL bar post-mount does not trigger restore. Out of §5 scope; small follow-up.

### Dismissed (pass 1, §5)
- Blind: async tryRestoreFromHash re-entrancy swallows the `change` event. **False positive** — the re-entrant call's synchronous prefix runs through the match path BEFORE reaching `if (hydrating) return`. Hydration → addFeatures → sync 'change' → sync match → select → hashRestored=true, all before the awaiting outer call resumes. Verified via dataflow trace. Edge Hunter caught this correctly.
- Blind: `selectSuggestion` not awaited on rapid double-click. Real but very low impact (each click hydrates+selects, last one wins; the panel dismisses); acceptable.
- Edge: `playgroundSourceStore` non-null contract change side effects. Spec amended in same diff with rationale; no other consumers gate on `null`.
- Edge: stale hydrated features sit in invisible polygon source between zoom transitions. Cleared on the next polygon-tier `source.clear()`; harmless lifecycle.

## 6. Docs

- [x] 6.1 Create `docs/reference/api.md` documenting the tiered RPCs (`get_playground_clusters`, `get_playgrounds_bbox`, the new `get_playground` single-feature lookup, plus extended `get_meta` and the centroid RPC kept server-side for federation). Reflects the two-tier client design after the pivot.
- [x] 6.2 Update `CLAUDE.md` "Key frontend architecture" section: stores include `tier.js`; layers list cluster + polygon as tier-driven; new "Zoom-tier orchestrator" section; API + Database API tables list the new fetchers/RPCs. Legacy comment block not retained (the rewrite is small and self-explanatory).
- [x] 6.3 `docs/reference/federation.md` "See also" cross-links the new API reference page.
- [x] 6.4 `mkdocs.yml` nav: added `API: reference/api.md` under Reference.

### Review Findings — §6 docs, Pass 1 (bmad-code-review, 2026-04-25)

#### Medium
- [x] [Review][Patch] **`is_water` vs `has_water` mismatch**. `api.md`'s `get_playgrounds_bbox` example uses `is_water` (matches SQL), the prose lists "has_water", and the centroid RPC's `filter_attrs` block uses `has_water` (the renamed field). Fix the prose to say `is_water` for bbox features and explicitly note the rename to `has_water` in the centroid `filter_attrs` payload. [docs/reference/api.md] (Medium)
- [x] [Review][Patch] **Stale "zoom ≤ 10 / 11–13" comments in `importer/api.sql` + `dev/seed/seed.sql`** — pre-pivot wording in the §1a + §1b function-header banners. The cell-size table extends through z=13 already, but the comment text contradicts. Sweep both files. [importer/api.sql §1a/§1b headers; dev/seed/seed.sql same] (Medium)
- [x] [Review][Patch] **Stale JSDoc on `fetchPlaygroundClusters` / `fetchPlaygroundCentroids` / `fetchPlaygroundsBbox`** still references "zoom ≤ 10", "zoom 11–13", "zoom ≥ 14" in `app/src/lib/api.js`. Update to the two-tier model. [app/src/lib/api.js fetcher JSDoc] (Medium)
- [x] [Review][Patch] **`playgroundSourceStore` description oversells "always non-null after Map mounts"**. `Map.svelte::onDestroy` sets it to `null`. Tighten the wording — "always non-null while the Map component is mounted; reset to null on tear-down". [CLAUDE.md stores table] (Medium)

#### Low
- [x] [Review][Patch] **Cross-link missing from `docs/reference/architecture.md`** — task §6.3 said "federation / architecture". Federation got the See also; architecture didn't. Add a brief See-also pointer to `api.md` near the standalone diagram. [docs/reference/architecture.md] (Low)
- [x] [Review][Patch] **Cluster source has no documented home**. `CLAUDE.md` describes `playgroundSource.js` as the polygon-tier source; the cluster source has no equivalent published store and the asymmetry is unexplained. Add a sentence noting the cluster `VectorSource` is local to `StandaloneApp.svelte` (no widget consumes it externally), so no store wraps it. [CLAUDE.md stores table or Layers section] (Low)

### Dismissed (pass 1, §6)
- Blind: `tier.js` vs `activeTierStore` filename-vs-symbol naming. Other store rows follow the same convention; no real drift.
- Blind: PostgREST GET-vs-POST verb caveat. SQL functions are `STABLE` and `CORS Allow-Methods: GET, OPTIONS` — the docs' GET example is correct for the shipped configuration; over-explaining the cache of corner cases isn't a Reference's job.
- Blind: orchestrator fallback emits the deprecation warning. Intentional — operators running stale backends should hear it; the warning is one-shot per session.
- Edge: cluster vs `get_meta` invariant cross-RPC mismatch warning. The two invariants are individually correct and clearly stated; a "do not sum across RPCs" footnote feels like over-engineering for a Reference.
- Edge: `get_playground` precedence over a relation row with `NULL` geometry — narrow edge case in clipped PBFs; better fixed in SQL than papered over in docs.
- Edge: antimeridian bbox handling. Pre-existing; not introduced by this change.
- Auditor: zoom threshold "configurable" annotation. The "default 13" wording already implies it.

## 7. Verification

- [-] 7.1 ~~Unit: `stackedRingRenderer` bitmap cache keys round-trip for a sample of count/ratio tuples~~ **Deferred** — the project doesn't ship a unit-test runner (Vitest/Jest) and adding one purely for this is out of scope for §7. The cache-key consistency was hardened during §4 review (quantise→draw uses the same tenths) and is exercised end-to-end by Playwright. Track as a follow-up if a unit-test runner lands later.
- [x] 7.2 Playwright: zoom transitions covered in `tests/tiered.spec.js` — `cluster tier RPC fires when zoom ≤ clusterMaxZoom` and `polygon tier RPC fires when zoom > clusterMaxZoom`. Two-tier semantics, post-pivot.
- [-] 7.3 ~~Playwright: pan at zoom 12 across the Fulda seed region, assert centroid layer refetches~~ **Centroid tier removed in pivot.** The cluster-tier moveend refetch is exercised end-to-end; a dedicated pan-refetch Playwright assertion is reasonable follow-up but not §7 scope after the pivot.
- [x] 7.4 Manual: live-tested via `make docker-build && make up` on the 4-playground seed during §4 / pivot iteration. Cluster ring rendering, click-to-zoom, and tier transition between zoom 13 and 14 verified in the browser.
- [-] 7.5 ~~Manual: Berlin perf~~ **Deferred** — would need a Berlin import (`make import` against a Berlin PBF) which the dev workflow doesn't ship. Worth running on a Berlin-sized backend before the change archives. Track as a follow-up.
- [x] 7.6 Legacy `fetchPlaygrounds` deprecation warning fires once per session — covered by Playwright in `tests/tiered.spec.js` (`legacy fetchPlaygrounds emits a one-time deprecation warning`).
- [x] 7.7 `openspec validate add-tiered-playground-delivery --strict` passes (verified after every section's review pass; stays clean).

### Test infrastructure updates

`tests/helpers.js` was extended in §7 to keep the existing test suites (smoke, hash-restore, selection, hub-*) working post-pivot:
- `injectApiConfig` defaults to `clusterMaxZoom: 0` so polygon tier is always active in tests, isolating non-tier tests from orchestrator behaviour. Tests exercising cluster behaviour pass an override.
- `stubApiRoutes` now also stubs `/rpc/get_playgrounds_bbox`, `/rpc/get_playground_clusters`, `/rpc/get_playground_centroids`, and `/rpc/get_playground?osm_id=…` so any orchestrator path resolves to the fixture.
