## 1. GitHub issue & branch

- [x] 1.1 Confirm issue #305 is open and link this change to it
- [x] 1.2 Create branch `fix/305-cluster-filter-passthrough` from `main`

## 2. Database — `get_playground_clusters`

- [x] 2.1 Add 11 `boolean DEFAULT false` filter params to the function signature in `importer/api.sql` (`filter_private`, `filter_water`, `filter_baby`, `filter_toddler`, `filter_wheelchair`, `filter_bench`, `filter_picnic`, `filter_shelter`, `filter_table_tennis`, `filter_soccer`, `filter_basketball`)
- [x] 2.2 Add `AND (NOT filter_x OR <expr>)` clauses to the `buckets` CTE for each param, matching the mapping in design.md D2
- [x] 2.3 Update the `GRANT EXECUTE` statement to cover the new function signature (or switch to schema-level grant as noted in design.md D4)
- [ ] 2.4 Run `make db-apply` and verify the function is callable with no params (unfiltered baseline) and with individual filter flags

## 3. API — `fetchPlaygroundClusters`

- [x] 3.1 Add optional `filters` parameter to `fetchPlaygroundClusters` in `app/src/lib/api.js`
- [x] 3.2 Implement filter serialisation: iterate the `filterMap` (see design.md D3), append only active (true) flags as URL params
- [x] 3.3 Ensure `standalonePitches` is absent from the filter map

## 4. Orchestrator — `tieredOrchestrator.js`

- [x] 4.1 Change `attachTieredOrchestrator` to accept an optional `filters` snapshot in `orchestrate(filters)`
- [x] 4.2 Pass `filters` through to `fetchPlaygroundClusters` in the cluster tier branch
- [x] 4.3 Change the return value from `() => void` to `{ detach, rerun }` where `rerun(filters?)` calls `orchestrate(filters)` directly (not debounced)

## 5. StandaloneApp integration

- [x] 5.1 Update destructuring of `attachTieredOrchestrator` return value in `app/src/standalone/StandaloneApp.svelte` to `{ detach: detachOrchestrator, rerun: rerunOrchestrator }`
- [x] 5.2 Add reactive statement guarded by `rerunOrchestrator && activeTierStore === 'cluster'`, using a string fingerprint to exclude standalonePitches changes
- [x] 5.3 Verify the reactive statement fires only when tier is `cluster` (not on polygon zoom)

## 6. Manual verification

- [ ] 6.1 `make docker-build` and open the app at cluster zoom (zoom out to ≤ 13)
- [ ] 6.2 Activate "water playground" filter — confirm cluster dots update without panning
- [ ] 6.3 Activate a combination of filters — confirm counts reflect the intersection
- [ ] 6.4 Activate a filter that matches nothing — confirm the cluster layer shows no dots
- [ ] 6.5 Toggle back to no filters — confirm full cluster counts restore
- [ ] 6.6 Activate a filter at polygon zoom (zoom in to > 13) — confirm no extra network request is issued
- [ ] 6.7 Toggle `standalonePitches` — confirm no cluster re-fetch

## 7. PR

- [ ] 7.1 Commit with message `fix(clusters): pass active filters to get_playground_clusters — closes #305`
- [ ] 7.2 Open PR against `main`, reference issue #305 in the description
