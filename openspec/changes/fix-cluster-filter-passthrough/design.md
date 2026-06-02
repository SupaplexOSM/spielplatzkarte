## Context

The tiered playground delivery system has two data paths:

- **Polygon tier** (zoom > 13): `get_playgrounds_bbox` returns full GeoJSON with all filter attributes; `playgroundStyleFn` uses `matchesFilters()` client-side to hide non-matching features — filters work correctly.
- **Cluster tier** (zoom ≤ 13): `get_playground_clusters` returns pre-aggregated bucket rows with counts only; the aggregation runs unconditionally — filters are silently ignored.

`playground_stats` (the materialized view feeding both RPCs) already carries all 11 filterable columns: `access_restricted`, `is_water`, `for_baby`, `for_toddler`, `for_wheelchair`, `bench_count`, `picnic_count`, `shelter_count`, `table_tennis_count`, `has_soccer`, `has_basketball`. The data is present; it is simply not threaded through.

The orchestrator (`tieredOrchestrator.js`) currently returns a bare `() => void` detach function. `StandaloneApp.svelte` uses `filterStore` reactively only for the pitch-layer toggle; it does not re-trigger the orchestrator on filter change.

## Goals / Non-Goals

**Goals:**
- Cluster buckets reflect only playgrounds matching the active `filterStore` flags.
- Bucket counts and completeness breakdowns are correct for the filtered set.
- Buckets with zero matching members are omitted (sparse map when filters are narrow).
- Filter changes at cluster zoom trigger a new server fetch; filter changes at polygon zoom do not (client-side re-style is sufficient).

**Non-Goals:**
- Filtering the polygon tier server-side — client-side `matchesFilters()` already handles it.
- Changing how `standalonePitches` works — it remains a layer-visibility toggle.
- Filtering other RPCs (`get_playgrounds_bbox`, `get_nearest_playgrounds`, etc.).
- Performance optimisation beyond what the existing GIST index provides.

## Decisions

### D1: Filter ownership — orchestrator internal vs. StandaloneApp-driven

**Decision**: StandaloneApp passes filters to the orchestrator; the orchestrator does not subscribe to `filterStore` internally.

**Rationale**: `attachTieredOrchestrator` returns `{ detach, rerun }`. `StandaloneApp` stores `rerun` and adds:
```js
$: if ($filterStore && $activeTierStore === 'cluster') rerun($filterStore);
```
This keeps the orchestrator a plain JS module (no new Svelte store subscriptions inside it) and is consistent with the existing pattern: StandaloneApp already subscribes to both `filterStore` and `activeTierStore` for other reactive side-effects. The orchestrator reads the filters it is given at each `orchestrate()` call, no internal state needed.

The `=== 'cluster'` guard avoids a spurious server fetch when filters change at polygon zoom.

**Alternative considered**: Orchestrator subscribes to `filterStore` internally. Rejected — the orchestrator already writes to `activeTierStore`; adding a read subscription would tighten the coupling further and make the module harder to test in isolation.

### D2: SQL filter parameters — individual booleans vs. JSON blob

**Decision**: 11 individual `boolean DEFAULT false` parameters on `get_playground_clusters`.

**Rationale**: PostgREST maps each URL param to a named function argument directly. Individual booleans are the natural PostgREST primitive; they appear in the OpenAPI schema automatically; inactive filters simply aren't sent in the URL (the DEFAULT handles absence). A JSON blob would require a custom parser inside the SQL function and would not benefit from the automatic schema exposure.

**Filter → column mapping** (mirrors `matchesFilters()` in `filters.js`):

| filterStore key | SQL param | `playground_stats` expression |
|---|---|---|
| `private` | `filter_private` | `NOT ps.access_restricted` |
| `water` | `filter_water` | `ps.is_water` |
| `baby` | `filter_baby` | `ps.for_baby` |
| `toddler` | `filter_toddler` | `ps.for_toddler` |
| `wheelchair` | `filter_wheelchair` | `ps.for_wheelchair` |
| `bench` | `filter_bench` | `ps.bench_count > 0` |
| `picnic` | `filter_picnic` | `ps.picnic_count > 0` |
| `shelter` | `filter_shelter` | `ps.shelter_count > 0` |
| `tableTennis` | `filter_table_tennis` | `ps.table_tennis_count > 0` |
| `soccer` | `filter_soccer` | `ps.has_soccer` |
| `basketball` | `filter_basketball` | `ps.has_basketball` |

Each becomes an `AND (NOT <param> OR <expr>)` clause in the `buckets` CTE.

### D3: API serialisation — only active flags vs. always all flags

**Decision**: Only active (true) filter flags are included in the URL params.

**Rationale**: Reduces URL length; the SQL `DEFAULT false` handles omitted params identically to `filter_x=false`. Simpler to reason about in network traces.

Implementation in `api.js`:
```js
const filterMap = {
  private: 'filter_private', water: 'filter_water', baby: 'filter_baby',
  toddler: 'filter_toddler', wheelchair: 'filter_wheelchair',
  bench: 'filter_bench', picnic: 'filter_picnic', shelter: 'filter_shelter',
  tableTennis: 'filter_table_tennis', soccer: 'filter_soccer',
  basketball: 'filter_basketball',
};
if (filters) {
  for (const [key, param] of Object.entries(filterMap)) {
    if (filters[key]) params.set(param, 'true');
  }
}
```

### D4: GRANT statement — update required after signature change

**Decision**: The existing `GRANT EXECUTE ON FUNCTION api.get_playground_clusters(int, float8, float8, float8, float8)` must be updated to include the 11 new parameters in the type list, OR rewritten to use `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO web_anon` (preferred for maintainability).

**Rationale**: PostgreSQL matches grants by full signature. The old grant will not cover the new signature. The schema-level grant eliminates this class of problem for future function additions.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| DB deploy order: old frontend hits new DB function without filter params | `DEFAULT false` on all new params ensures the old call signature still works — zero-downtime safe |
| New frontend hits old DB (`make db-apply` not yet run) | Existing 404 fallback in the orchestrator catches this; it falls back to legacy `get_playgrounds` for the session |
| `rerun()` called while a moveend fetch is in-flight | The existing `AbortController` pattern inside `orchestrate()` cancels the superseded request — no change needed |
| Centroid shift when filtered | Expected and correct: the geographic mean of filtered members differs from the mean of all members. Documented as correct behaviour. |
| Empty map when filters match nothing | Expected: no buckets → empty `clusterSource` → no dots shown. Correct mental model for the user. |

## Migration Plan

1. Merge PR → `make db-apply` on the running stack (drops and recreates `get_playground_clusters` with new signature).
2. `make docker-build` to deploy the new frontend.
3. No data migration — `playground_stats` materialized view is unchanged.
4. **Rollback**: revert the PR, `make db-apply`, `make docker-build`. The old signature is restored; the new frontend will 404 on filter params and fall back gracefully.
