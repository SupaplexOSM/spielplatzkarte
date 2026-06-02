## 1. AppShell extraction

- [ ] 1.1 Create `app/src/components/AppShell.svelte` — move the layout, widgets, responsive logic, and keyboard handling from `StandaloneApp.svelte` verbatim
- [ ] 1.2 Add props: `playgroundSource`, `searchExtent` (store), `nearestFetcher`, `dataContribLinks`, `defaultBackendUrl`, `instancePanel` (optional snippet for bottom-left slot)
- [ ] 1.3 Remove direct references to `apiBaseUrl`, `osmRelationId`, `fetchNearestPlaygrounds` — use injected equivalents
- [ ] 1.4 Extract URL-hash parsing from `Map.svelte` into `app/src/lib/deeplink.js` — export `parseHash(h)` and `writeHash({ slug, osmId })`
- [ ] 1.5 `AppShell` consumes `deeplink.js` and wires hash parsing through the selection store
- [ ] 1.6 Confirm no hub-specific imports leak into `AppShell` (grep for `registry`, `InstancePanel`, etc.)

## 2. Standalone refactor

- [ ] 2.1 Refactor `app/src/standalone/StandaloneApp.svelte` to compose `AppShell`
- [ ] 2.2 Owns the playground source; passes a `searchExtent` store computed from current map view (same logic as today)
- [ ] 2.3 Passes `nearestFetcher = (lat, lon) => fetchNearestPlaygrounds(lat, lon, apiBaseUrl)`
- [ ] 2.4 Passes `dataContribLinks = { wikiUrl: regionPlaygroundWikiUrl, chatUrl: regionChatUrl }`
- [ ] 2.5 Retains existing initial data load (`loadStandaloneData`) and region-fit via Nominatim
- [ ] 2.6 No `instancePanel` prop passed (bottom-left slot empty → scale-line sits where it does today)
- [ ] 2.7 Manual smoke on dev server: search, filters (chips + panel), locate, nearby-playgrounds, hover preview, contribution modal, mobile bottom-sheet, zoom, deep-link `#W<osm_id>` — all pass

## 3. registry.json schema extension

- [ ] 3.1 Add `slug` field to registry entry schema (optional, lowercase ASCII + digits + hyphens)
- [ ] 3.2 Update `registry.js` to surface `slug` on each backend status record; validate format and treat invalid values as absent with a console warning
- [ ] 3.3 Update any example `registry.json` under `public/` or `docs/` to include a `slug` on each entry
- [ ] 3.4 Support both `{ instances: [...] }` and bare array formats as today

## 4. Registry-derived stores

- [ ] 4.1 Add `aggregatedBbox` readable store to `registry.js`: updates as each backend's `get_meta` returns; emits the union of individual bboxes as `[minLon, minLat, maxLon, maxLat]`, or `null` until at least one backend has reported
- [ ] 4.2 Add `fetchNearestAcrossBackends(lat, lon, limit = 10)` to `registry.js`: fires `get_nearest_playgrounds` against every reachable backend in parallel with a per-backend `AbortController` timeout (default 3 s), merges results, dedupes by `osm_id`, sorts by distance ascending, returns the top `limit`
- [ ] 4.3 Expose both as named exports from `createRegistry` alongside the existing `backends` and `registryError` stores

## 5. Hub refactor

- [ ] 5.1 Refactor `app/src/hub/HubApp.svelte` to compose `AppShell`
- [ ] 5.2 Wire `playgroundSource` from the existing shared `VectorSource`
- [ ] 5.3 Wire `searchExtent` from the registry's `aggregatedBbox` store (reactive — updates as backends report)
- [ ] 5.4 Wire `nearestFetcher` to `fetchNearestAcrossBackends`
- [ ] 5.5 Wire `dataContribLinks` with the generic OSM wiki URL and `chatUrl: null`
- [ ] 5.6 Pass the new `InstancePanel` pill as the `instancePanel` prop
- [ ] 5.7 Hub owns initial `view.fit()`: subscribes to `aggregatedBbox` once and fits the map; falls back to a Germany-wide default until the first bbox arrives (matches current behaviour)

## 6. InstancePanel redesign

- [x] 6.1 Rewrite `app/src/hub/InstancePanel.svelte` as the collapsed pill — globe icon + `<N> Regionen · <M> Spielplätze`
- [x] 6.2 Create `app/src/hub/InstancePanelDrawer.svelte` for the expanded state (move existing per-backend list rendering into it)
- [x] 6.3 Position: bottom-left, `1rem` from edges; drawer slides up on click with a short animation
- [x] 6.4 Scale-line shifts: update `custom-scale-line` CSS in `Map.svelte` to sit below the pill (sufficient `bottom:` offset)
- [x] 6.5 Interaction: click pill toggles drawer; ESC or outside click collapses; `aria-expanded` on pill; focus trap while drawer open
- [x] 6.6 Loading state: spinner in pill + "Lade Instanzen …" while `backends.length === 0`
- [x] 6.7 Error state: warning icon + "Registry nicht erreichbar" when `registryError` is set
- [x] 6.8 Mobile coordination: when the standalone-mode bottom-sheet is open, collapse the drawer automatically; pill stays visible but compact

## 7. URL hash scheme

- [x] 7.1 `parseHash` in `deeplink.js` matches both `#W<osm_id>` and `#<slug>/W<osm_id>`; returns `{ slug?: string, osmId: number } | null`
- [x] 7.2 Standalone: ignores any slug — always selects by osm_id from the single configured backend
- [x] 7.3 Hub with slug: resolves slug to backend via registry, waits for that backend's features to load, selects the matching osm_id
- [x] 7.4 Hub without slug: searches all loaded backends' features for matching osm_id; picks first hit; console warning if more than one match
- [x] 7.5 On selection in hub, `writeHash` emits `#<slug>/W<osm_id>` using the feature's `_backendUrl` resolved to slug; falls back to `#W<osm_id>` when the backend has no slug
- [x] 7.6 Selection-clear writes empty hash (`#`) — same as today

## 8. Tests

- [x] 8.1 Playwright: hub mode smoke — asserts presence and basic function of search, filters, locate, zoom, hover preview, contribution modal, nearby-playground suggestions
- [x] 8.2 Playwright: pill shows correct count after registry load; clicking expands drawer with backend list
- [x] 8.3 Playwright: ESC collapses drawer; outside click collapses drawer
- [x] 8.4 Playwright: deep-link `#<slug>/W<osm_id>` in hub selects correct playground on correct backend
- [x] 8.5 Playwright: deep-link `#W<osm_id>` without slug in hub still selects (broadcast search)
- [x] 8.6 Playwright: deep-link `#<anything>/W<osm_id>` in standalone selects osm_id regardless of slug
- [x] 8.7 Playwright: standalone mode regression — same assertions as before this change still pass

## 9. Documentation

- [x] 9.1 Create `docs/reference/registry-json.md` — documents the schema (both top-level shapes), the `slug`/`name`/`url` fields, validation rules, and the two new registry-derived capabilities (aggregated bbox, multi-backend nearest)
- [x] 9.2 Update `docs/reference/federation.md` with a brief note on the new hub UI (pill, drawer, deep-link scheme) and link to `registry-json.md`
- [x] 9.3 Add an ASCII or screenshot of the hub layout (pill bottom-left, scale-line below it)
- [x] 9.4 Update `mkdocs.yml` nav to include `registry-json.md`

## 10. Final validation

- [ ] 10.1 Local two-data-node + hub smoke: spin up two standalone instances, run hub pointing at both via `registry.json` with slugs; verify every item in section 8 manually
- [ ] 10.2 Verify zero-regression in a single-node deployment (Fulda-like): compare behaviour against `main` for all standalone interactions
- [ ] 10.3 Bundle size spot-check: hub bundle gains some code, standalone loses some; net should be roughly neutral. Record sizes before/after for the PR description
- [ ] 10.4 Update CHANGELOG or release notes if the project uses them (currently no — skip)
