## Why

Hub mode supports overlapping backend coverage as a deliberate topology — a Fulda city backend can run alongside a Hessen state backend, and both contain the Fulda playgrounds. After fan-out, the OL `VectorSource` ends up with multiple polygon features carrying the same `osm_id`. Today's behaviour is undefined: the OL click handler picks "the first match", deep-link restore logs `[deeplink] osm_id X matched 2 backends` and proceeds non-deterministically, and which backend's polygon "wins" depends on response-arrival ordering across moveends.

Issue #202 named this and pointed at an `openspec/changes/add-import-timestamps-and-dedup/` directory that was never drafted. PR #295 attempted an implementation and was rejected for (a) coordinating with the wrong names against `add-federation-health-exposition` and (b) shipping multiple correctness bugs in the dedup loop itself (lexicographic ISO compare, O(N²) lookup, stale-removal-then-compare race, missing branches). This change sets the contract that any clean re-implementation must satisfy — independent of where the implementation lands.

## What Changes

- **Frontend (`app/src/hub/hubOrchestrator.js`)** — the polygon-tier fan-out is the load-bearing edit point. `registry.js` does **not** own the polygon `VectorSource` on current `main` (the federation-clustering refactor moved all source mutation into the orchestrator); polygon-tier merge therefore lives next to `parsePolygonFeatures` + the polygon-tier `onResult` handler, not in `registry.js`.
    - `parsePolygonFeatures(geojson, backendUrl, backend)` stamps every emitted feature with `_lastImportAt = backend.lastImportAt`. The value is **frozen at parse time**: subsequent dedup cycles read this from the *feature*, never from the live `backends` store entry.
    - Polygon-tier `onResult` maintains a per-`orchestrate()`-call `Map<osm_id, Feature>` (`polyByOsmId`). For each incoming feature, look up by `osm_id`:
        - If absent → add the incoming feature to the source and to the map.
        - If present → compare via the merge rule below. Incoming wins → `polygonSource.removeFeature(existing)` then add incoming and update the map. Existing wins → drop incoming.
    - The map is per-`orchestrate()` (not session-wide) — every new moveend / fan-out starts a fresh map. Progressive rendering is preserved; in the common case (no overlap) every arrival adds with zero removals.
- **Frontend (`app/src/hub/registry.js`)** — the only edit is to consume the new `last_import_at` field from `get_meta`:
    - Add `lastImportAt: null` to the initial backend shape.
    - In `loadBackend()`, write `patch.lastImportAt = meta.last_import_at ?? null` next to the existing completeness extraction. No source mutation, no orchestrator coupling.
- **Merge rule** (applied in `pickWinner(existing, incoming)`):
    1. Both have a parseable `last_import_at` → newer wins (`Date.parse(a) - Date.parse(b)`, numeric).
    2. Exactly one has a parseable value → the non-null/non-NaN wins.
    3. Both null OR both `NaN` OR both equal → URL alphabetical, raw JavaScript `<` compare on the unmodified `_backendUrl` string (no case-folding, no scheme/trailing-slash normalisation — registry URLs are byte-stable across the session).
- **Feature property contract**: every polygon feature in the shared source carries:
    - `_backendUrl` (already set today by `parsePolygonFeatures`) — which backend the feature came from.
    - `_lastImportAt` (new) — frozen value of that backend's `last_import_at` at parse time. ISO-8601 string per `add-federation-health-exposition`, or `null` on pre-FHE backends. Readers MUST treat `undefined` (never set) and `null` (set to null) and any value where `Date.parse(v)` returns `NaN` identically as "no timestamp".
- **Tests**: Playwright fixtures exercising (a) two backends with overlapping `osm_id` + deterministic newer-import winner, (b) degraded mode (both backends report `null` `last_import_at`) → URL-alphabetical winner, (c) refresh stability (winner unchanged on stable inputs), (d) refresh transition (winner flips when one backend's `last_import_at` advances).
- **Docs**: `docs/reference/federation.md` gains a "Cross-backend dedup" subsection naming the contract, including the URL-canonicalisation note.

Out of scope (explicit non-goals):

- Server-side aggregation or de-duplication. Backends still ship their full feature sets; the merge is purely client-side.
- Region-of-truth assignment (e.g. "Fulda always wins for Fulda playgrounds"). That requires per-osm_id metadata that doesn't exist today; track separately if a use case appears.
- Cluster-tier dedup. The cluster tier already merges via Supercluster's kd-tree on `[lon, lat]` (see archived `add-federated-playground-clustering`). The cluster pipeline does not surface `osm_id`, so an "osm_id dedup" question doesn't apply at that tier — overlap manifests as cluster-count inflation when two backends report cluster buckets at different `[lon, lat]`. Out of scope here.
- **Issue #202's `osm_data_age` (PBF replication timestamp)** as the merge key. #202's original acceptance named `osm_data_age` (the PBF's `osmosis_replication_timestamp`) as the authoritative dedup signal alongside `imported_at`. This change uses only `last_import_at` (the import-run timestamp). Rationale: `add-federation-health-exposition` ships `last_import_at` and `data_age_seconds` but not the PBF replication timestamp. Adopting the dual-timestamp model would require extending FHE; punted to a follow-up if operators report the divergence (importer ran against an old PBF) is observable.
- Per-backend "last reachable" / "import age" rendering in `InstancePanelDrawer`. That belongs in `add-federation-health-exposition`'s `hub-ui-parity` delta, not here.
- Selection-store reconciliation when a winner flip evicts a currently-selected feature. Documented as a Risk in `design.md`; see Open Questions for follow-up.
- `_relationId` feature tagging. Originally proposed as speculative state for a future cross-backend disambiguation; dropped because (a) `relation_id` is already shipped by `get_meta` today (not new from FHE), and (b) no consumer in this change reads it.
- The implementation in PR #295. That PR is rejected in code review; re-author against the contract here.

## Capabilities

### Modified Capabilities

- `federated-playground-clustering`: gains a new Requirement "Hub deduplicates overlapping playgrounds by `osm_id` at VectorSource insertion".

## Impact

- `app/src/hub/hubOrchestrator.js` — `parsePolygonFeatures` stamps `_lastImportAt`; polygon-tier `onResult` gains the `Map<osm_id, Feature>` index-and-compare. (PR #302 already implements this shape using a separate `app/src/hub/osmIdDedup.js` module — that's a clean factoring; the contract here doesn't mandate the helper module's existence, just the behaviour.)
- `app/src/hub/registry.js` — initial backend shape gains `lastImportAt: null`; `loadBackend()` adds one line to write `patch.lastImportAt = meta.last_import_at ?? null`. No source mutation.
- Each polygon feature gains the `_lastImportAt` property at parse time.
- `tests/hub-osm-id-dedup.spec.js` (new) or extension of `tests/hub-multi-backend.spec.js` — Playwright coverage for overlap + degraded-mode + refresh-flip.
- `docs/reference/federation.md` — new "Cross-backend dedup" subsection.
- No changes to: `importer/api.sql`, `importer/import.sh`, `oci/app/`, `compose.yml`, the OL `VectorSource` subclass, the cluster tier, the polygon-tier RPC contract, or any non-hub frontend code.

## Dependencies

- **`add-federation-health-exposition`** (in flight, issue #194; implementation in PR #301) provides the `last_import_at` field on `get_meta` that this change's merge rule consumes. **Soft dependency**: if the federation-health change is delayed, this change runs in degraded mode (URL-alphabetical only — deterministic but not freshness-aware) so the dedup contract still holds; the freshness-tiebreak activates as soon as the upstream lands. Either order is acceptable; if FHE ships second, the only conflict is in `registry.js` (both PRs add fields to the initial backend shape — keep both, they don't overlap on field names).
- **`add-federated-playground-clustering`** (archived 2026-04-26) provides the per-feature `_backendUrl` tagging at `hubOrchestrator.js` `parsePolygonFeatures` that the merge rule reads. The archived proposal stated polygons from different backends "never overlap geographically (relations are disjoint)" — this change explicitly **supersedes** that disjoint-relations assumption: overlap is now a supported topology and the merge rule is what handles it.
