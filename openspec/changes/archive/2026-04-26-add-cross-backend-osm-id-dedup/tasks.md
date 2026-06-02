## 1. Frontend — dedup at the polygon-tier `onResult` in `hubOrchestrator.js`

- [ ] 1.1 In `app/src/hub/hubOrchestrator.js` `parsePolygonFeatures(geojson, backendUrl, backend)`, alongside the existing `f.set('_backendUrl', backendUrl)` call, add `f.set('_lastImportAt', backend.lastImportAt ?? null)`. The value is **frozen at parse time** — every dedup cycle reads it from the feature via `feature.get('_lastImportAt')`, never from a live `backends`-store lookup. The frozen-value property is decoupled-from-future-store-mutations design (see design D3) — even though the current store uses immutable patches and a live read would be safe today, the contract is defensive against any future mutation refactor.
- [ ] 1.2 In the polygon-tier `onResult` handler (currently at `hubOrchestrator.js` `polygonSource.addFeatures(features)` after `const features = parsePolygonFeatures(entry.value, entry.backendUrl, backend)`), maintain a per-`orchestrate()`-call `Map<osm_id, Feature>` (e.g. `polyByOsmId`). Reset to a fresh empty `Map` at the top of each `orchestrate()` call.
- [ ] 1.3 Walk the incoming features once. For each, look up by `osm_id` in `polyByOsmId`:
    - **Absent** → push to `toAdd`; set `polyByOsmId.set(osmId, incoming)`.
    - **Present** → invoke `pickWinner(existing, incoming)` (extract into a sibling pure module, e.g. `app/src/hub/osmIdDedup.js`, exporting `pickWinner` and ideally `applyDedup({incomingFeatures, polyByOsmId})` returning `{toAdd, toRemove}`). The merge rule (verbatim from design D2):
        - Define `parseable(v)` ≡ `v != null && Number.isFinite(Date.parse(v))`.
        - 1. `parseable(a) && parseable(b)` → newer wins (`Date.parse(a) - Date.parse(b)`, numeric).
        - 2. `parseable(a)` XOR `parseable(b)` → the parseable one wins.
        - 3. Otherwise → URL alphabetical via raw JS `<` on `_backendUrl` (no case-folding, no normalisation).
    - If `pickWinner` returns `'incoming'` → push existing to `toRemove`, push incoming to `toAdd`, update `polyByOsmId.set(osmId, incoming)`. If `'existing'` → drop incoming.
- [ ] 1.4 After the loop, batch the source mutations: `polygonSource.removeFeatures(toRemove)` (single call) followed by `polygonSource.addFeatures(toAdd)` (single call). Per-feature `removeFeature`/`addFeature` calls each fire a synchronous `change` event — the batch form caps repaints at two per arrival regardless of dedup volume (design D7).
- [ ] 1.5 In `app/src/hub/registry.js`, extend the initial backend shape with `lastImportAt: null` next to the existing `version`, `region`, `bbox`, `playgroundCount`, `completeness` fields. In `loadBackend()`, after the existing completeness extraction, write `patch.lastImportAt = meta.last_import_at ?? null`. Use `meta.last_import_at` (snake_case wire format from `add-federation-health-exposition`) → `lastImportAt` (camelCase JS field). This is the only `registry.js` change.
- [ ] 1.6 Optional: log a single `[hub] dedup: replaced osm_id=X (backend=… newer than backend=…)` per replacement, de-duplicated per `osm_id` per session via a `Set` so a chronic overlap doesn't flood the console.

## 2. Tests

- [ ] 2.1 Unit test for `pickWinner` covering the merge rule (one assertion per row):
    - Both parseable + incoming newer → `'incoming'`.
    - Both parseable + existing newer → `'existing'`.
    - Both parseable + same instant in different TZ formats (`2026-04-25T12:00:00Z` vs `2026-04-25T14:00:00+02:00`) → tie → URL alphabetical.
    - Existing parseable + incoming `null` → `'existing'`.
    - Existing parseable + incoming `undefined` → `'existing'` (treated identically to null).
    - Existing parseable + incoming malformed string (`Date.parse → NaN`) → `'existing'`.
    - Existing `null` + incoming parseable → `'incoming'`.
    - Both `null` + lower-URL existing → `'existing'`.
    - Both `null` + lower-URL incoming → `'incoming'`.
    - Both `null` + identical `_backendUrl` (impossible in practice, but specify) → `'existing'` (incoming dropped — first-write-wins on identity collision).
- [ ] 2.2 Add `tests/hub-osm-id-dedup.spec.js` with an end-to-end Playwright fixture: two backends with overlapping `osm_id`, both reachable, distinct `last_import_at`. Assert the polygon source contains exactly one feature with that `osm_id` after the cluster→polygon transition, and its `_backendUrl` matches the freshness-winning backend. Use Playwright `page.evaluate` against a temporarily-exposed `window.__polygonSource` (gated behind `import.meta.env.DEV` if necessary) or a data-attribute hook on the map element.
- [ ] 2.3 Refresh stability: trigger a registry-poll refresh with both backends' stubs unchanged, assert the winner backend is unchanged. (Subsumes the "no flip on stable inputs" spec scenario.)
- [ ] 2.4 Refresh transition: change one backend's stub `last_import_at` to a fresher value, trigger refresh, assert the winner flips deterministically.
- [ ] 2.5 **Degraded-mode E2E**: stub both backends with `last_import_at = null` (mimics pre-`add-federation-health-exposition` deployments). Assert URL-alphabetical winner, no console errors, no `NaN` in feature properties. This is the contract that lets this change ship before FHE.
- [ ] 2.6 Backward compat: stub one backend without the `last_import_at` field at all (legacy `get_meta` shape). Assert the missing field is treated as `null` (defaulted in `registry.js` 1.5) and dedup still produces a deterministic winner.

## 3. Docs

- [ ] 3.1 In `docs/reference/federation.md`, add a "Cross-backend dedup" subsection: explains overlapping topology is supported, restates the merge rule in plain English, names the URL-alphabetical caveat (case-sensitive, raw string compare — operator naming choices in `registry.json` affect ties), and notes the dependency on `add-federation-health-exposition` for freshness-aware behaviour.
- [ ] 3.2 Cross-link from `docs/ops/federated-deployment.md` "Verification" section to the new dedup subsection so an operator setting up overlap knows what to expect.

## 4. Verification

- [ ] 4.1 Run `make test` — full Playwright suite passes (existing tests + new 2.2–2.6).
- [ ] 4.2 Manual smoke (two-backend dev fixture): `make up` with a registry pointing at both `db` and `db2` backends configured with overlapping bbox; load Hub mode; click on a playground in the overlap region; confirm exactly one popup appears and the source has one feature for that `osm_id`.
- [ ] 4.3 Manual: trigger a `make import` on the backend that should win the merge (fresher `last_import_at`); verify after the next 5-minute registry poll that the winner is now that backend.
- [ ] 4.4 Manual: with both backends sharing `last_import_at` (seed fixtures), verify URL-alphabetical tie-break by swapping the registry-list order and confirming the winner doesn't change (URL string is the load-bearing key).
- [ ] 4.5 Confirm the deep-link path: open a `/#W<osm_id>` link for an overlapping playground; the existing `[deeplink] osm_id X matched 2 backends` log line either disappears (dedup made the match unique) OR still fires once but the selected feature is the merge winner.

## 5. OpenSpec hygiene

- [ ] 5.1 Run `openspec validate add-cross-backend-osm-id-dedup --strict`.
- [ ] 5.2 On merge, archive this change to `openspec/changes/archive/YYYY-MM-DD-add-cross-backend-osm-id-dedup` and apply the spec delta to `openspec/specs/federated-playground-clustering/spec.md`.
- [ ] 5.3 Update issue #202: replace the dead `openspec/changes/add-import-timestamps-and-dedup/` reference with this change's path; close once the implementation PR (#302 or successor) lands.
