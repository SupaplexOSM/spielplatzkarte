## Why

When a user activates filters (e.g. "water playground"), the polygon tier (zoom > 13) correctly hides non-matching playgrounds via client-side re-styling — but the cluster tier (zoom ≤ 13) ignores all filters entirely, because `get_playground_clusters` receives no filter parameters and aggregates every playground unconditionally. The map therefore shows misleading cluster counts and ring breakdowns at low zoom whenever any filter is active.

## What Changes

- `get_playground_clusters` in `importer/api.sql` gains 11 optional boolean filter parameters (all `DEFAULT false`); the `buckets` CTE gains matching `AND` clauses so non-matching playgrounds are excluded before aggregation.
- `fetchPlaygroundClusters` in `app/src/lib/api.js` accepts an optional `filters` object and serialises only the active (true) flags into the PostgREST URL params.
- `attachTieredOrchestrator` in `app/src/lib/tieredOrchestrator.js` returns `{ detach, rerun }` instead of a bare detach function; `rerun` re-runs `orchestrate()` with freshly supplied filters.
- `StandaloneApp.svelte` stores the `rerun` handle and adds a reactive statement: when `filterStore` changes and the active tier is `cluster`, it calls `rerun(currentFilters)`.

## Capabilities

### New Capabilities

- `cluster-filter-passthrough`: Server-side filter application for the cluster tier — active `filterStore` flags are forwarded to `get_playground_clusters` so clusters reflect only matching playgrounds, with correct counts and completeness breakdowns.

### Modified Capabilities

*(none — no existing spec-level requirements change; this fixes a gap in the existing tiered-playground-delivery behaviour)*

## Impact

- **`importer/api.sql`**: `get_playground_clusters` signature changes; `make db-apply` required after deploy.
- **`app/src/lib/api.js`**: `fetchPlaygroundClusters` call signature gains optional `filters` param — backwards-compatible (defaults to no filters).
- **`app/src/lib/tieredOrchestrator.js`**: return type changes from `() => void` to `{ detach: () => void, rerun: (filters?) => void }` — callers must update destructuring.
- **`app/src/standalone/StandaloneApp.svelte`**: update destructuring, add reactive rerun trigger.
- **`standalonePitches`** filter key is excluded — it is a layer-visibility toggle, not a playground data filter.
- No new dependencies. No schema migrations (the function is dropped and recreated by `make db-apply`).
