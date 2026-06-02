## Context

Federation hub mode (`add-federated-playground-clustering`, archived 2026-04-26) fans out per-backend playground RPCs in parallel and renders results into a shared OL `VectorSource`. The cluster tier collapses cross-backend overlap via Supercluster's kd-tree merge on `[lon, lat]`. The polygon tier has no such merge — each backend's `get_playgrounds_bbox` response is appended to the source as-is.

In a non-overlapping topology this is harmless: each `osm_id` exists at exactly one backend. In an overlapping topology — which is a deliberate, supported configuration (issue #251 tracks the InstancePanel UI for it) — the same playground is served by ≥ 2 backends. Today the source ends up with N copies of that feature; OL's hit-detection picks one in arrival order; deep-link restore logs `[deeplink] osm_id X matched 2 backends` and proceeds non-deterministically.

Issue #202 named the problem and proposed dedup. The openspec change directory was never created. PR #295 attempted an implementation directly. Code review rejected it for (a) using table/field names that conflict with the in-flight `add-federation-health-exposition`, (b) string-comparing ISO timestamps lexicographically (TZ-format-sensitive), (c) reading `osmDataAge` from a live backends-store entry that gets mutated mid-cycle (silent drops on the fresher backend's own refresh), (d) O(N²) per-feature lookup, and (e) missing branches for the four corner cases in `(existingAge ± null) × (incomingAge ± null)`. This proposal sets the contract that a clean re-implementation must satisfy.

## Goals / Non-Goals

**Goals:**

- Deterministic which-feature-wins rule for any `osm_id` present at ≥ 2 backends.
- O(N + M) per backend join, not O(N × M).
- Stable across refresh cycles — a backend's refresh-poll must not transiently swap winners.
- Compatible with the existing federation surface — no new RPC fields beyond what `add-federation-health-exposition` already adds.
- Behaviour observable in the existing `[deeplink]` logging path so a future regression surfaces as a logged inconsistency rather than silent click misrouting.

**Non-Goals:**

- Server-side filtering. Backends keep shipping their full bbox-scoped feature sets; the merge is purely client-side.
- Region-of-truth assignment. "Fulda's polygons always win for Fulda playgrounds" needs per-osm_id metadata that doesn't exist; if it becomes a hard requirement, ship as a separate proposal that adds an `authoritative_region` field somewhere.
- Cluster tier. Already covered by Supercluster (different mechanism, different merge key).
- Cross-source merging across the polygon and cluster tiers. They render in disjoint zoom ranges and are independent VectorSources.
- Selection-store changes. The selection store already keys on `(osm_id, backendUrl)`; dedup happens at insertion time, before selection is involved.

## Decisions

### D1 — Dedup at the polygon-tier `onResult` in `hubOrchestrator.js`, not in `registry.js`

The merge runs in `app/src/hub/hubOrchestrator.js` — specifically inside the polygon-tier `onResult` callback, immediately before `polygonSource.addFeatures(features)` — using a per-`orchestrate()`-call `Map<osm_id, Feature>` to look up an existing feature by `osm_id` and apply the merge rule (D2).

Earlier drafts of this proposal (and the rejected PR #295) anchored the dedup in `app/src/hub/registry.js` `loadBackend()`, with a phrase like "after the existing `vectorSource.removeFeatures(stale)` line". On current `main` that line **does not exist**: `registry.js` does not import any `VectorSource`, does not accept one, and does not call `removeFeatures` or `addFeatures`. All polygon `VectorSource` ownership lives in `app/src/hub/HubApp.svelte` and the only code that mutates it is `hubOrchestrator.js` (`polygonSource.clear()`, `polygonSource.addFeatures()`, `polygonSource.removeFeature()`). The `removeFeatures(stale)` line was removed wholesale when `add-federated-playground-clustering` archived (the orchestrator now handles all source mutation; `registry.js` was demoted to "registry discovery + metadata + nearest" per its own header comment). PR #295 reintroduced the line in its own diff, which is one of the architectural reasons it was rejected.

The orchestrator anchor has three concrete benefits:

- `parsePolygonFeatures` is the only place per-feature properties (`_backendUrl`, soon `_lastImportAt`) get stamped — keeping the dedup loop next to it avoids splitting feature-state initialisation across two modules.
- The polygon-tier `onResult` is already the per-arrival callback in the fan-out — the natural granularity for dedup.
- A per-`orchestrate()` map is naturally scoped: every new moveend / fan-out re-creates `polygonSource` cleared and the map fresh. No session-wide cache to invalidate.

Alternative locations considered and rejected:

- **An OL `VectorSource` subclass** (`addFeature` override): the cleanest separation, but introduces a new module and ties dedup to the source rather than to the federation flow. Reserve for a future refactor if dedup logic grows beyond `osm_id`.
- **At fetch time, before any source mutation**: would require buffering N backends' results before the first paint and breaks the existing progressive-render contract from `add-federated-playground-clustering` §3.2.
- **At selection time**: too late — the source still holds duplicates, OL's spatial index still sees N features per spot, hover preview still picks arbitrarily.

### D2 — Compare by `last_import_at` (numeric), tie-break by URL alphabetical

The merge rule for two features sharing an `osm_id`. Define `parseable(v)` ≡ `v != null && Number.isFinite(Date.parse(v))`:

1. `parseable(a) && parseable(b)` → newer wins (`Date.parse(a) - Date.parse(b)`, numeric).
2. `parseable(a)` XOR `parseable(b)` → the parseable one wins.
3. `!parseable(a) && !parseable(b)` OR `Date.parse(a) === Date.parse(b)` → URL alphabetical: raw JavaScript `<` compare on the unmodified `_backendUrl` string.

The numeric compare via `Date.parse` is mandatory — the rejected PR #295's lexicographic string compare flips winners non-deterministically when two backends emit the same instant in different ISO TZ formats (`2026-04-25T12:00:00Z` vs `2026-04-25T14:00:00+02:00`).

`parseable` collapses three "no-timestamp" inputs into one bucket: JSON `null`, JS `undefined` (property never set), and any string `Date.parse` returns `NaN` for (e.g. truncated ISO without seconds on Safari, garbage data, empty string). All three behave identically under D5 → fall through to URL alphabetical at step 3. This avoids `NaN`-arithmetic falling silently through the step-1 numeric compare (`NaN - NaN === NaN`, neither `> 0` nor `< 0`) — which would otherwise produce a non-deterministic outcome.

URL-alphabetical tie-break is chosen over "first arrival" because:

- Arrival order is non-deterministic across moveends (parallel fan-out).
- URL is stable across the session (registry is loaded once at boot; subsequent registry-polls re-fetch `get_meta` per backend but do not re-rank or re-rewrite the URL strings).
- Easy to reason about in test expectations.

The `<` compare is **raw string, code-unit-wise**, against `_backendUrl` as it arrived from the registry. No case-folding, no scheme/trailing-slash normalisation. Operators who want a particular tie-break order should rename the URLs in `registry.json` accordingly. Documenting this explicitly avoids two valid implementations (`a < b` vs `a.localeCompare(b)` vs `a.toLowerCase() < b.toLowerCase()`) silently disagreeing.

### D3 — Stamp `_lastImportAt` on each feature at parse time, frozen

Each feature emitted by `parsePolygonFeatures` carries:

- `_backendUrl` (already set today — `f.set('_backendUrl', backendUrl)` in `parsePolygonFeatures`).
- `_lastImportAt` (new) — the value of `backend.lastImportAt` at the moment `parsePolygonFeatures` runs. Subsequent dedup cycles read from the feature (`existing.get('_lastImportAt')`), never from the live `backends` store.

Why frozen-at-parse-time, not live-read: the rejected PR #295 read the existing feature's age via `backends.find(b => b.url === existing.get('_backendUrl'))?.osmDataAge`. On `main` today, the `backends` store uses immutable patches (`backends[idx] = { ...backends[idx], ...patch }`), so a live read happens to be safe today. But there is no architectural guarantee against a future refactor reintroducing in-place mutation — and PR #295's own diff *did* reintroduce in-place mutation, exposing the race. Frozen-at-parse-time is the defensive contract: feature lifecycle and store lifecycle are decoupled, so no future store-mutation refactor can produce a silent-drop regression.

`_lastImportAt` is stored as a string (ISO-8601) or `null` — never `undefined`. Readers MUST treat `feature.get('_lastImportAt') === undefined` (property never set on a pre-this-change feature in a half-rolled-out frontend) and `=== null` identically. The `parseable()` predicate in D2 already collapses both with `NaN`-Date.parse cases, so this is automatic for the merge rule but worth naming so test fixtures don't depend on a particular sentinel.

### D4 — Pre-index existing features as `Map<osm_id, feature>` once per backend join

For an N-feature backend joining a source already holding M features, the cost should be O(N + M):

- Build the `Map<osm_id, feature>` over M existing features once, before the per-incoming loop.
- Per-incoming look-up is O(1).

PR #295's `vectorSource.getFeatures().find(f => f.get('osm_id') === osmId)` was O(N × M) — at federation scale (5 backends × 1k features) it ran 5M scans per refresh and blocked the main thread. Reject any future implementation that doesn't pre-index.

### D5 — Null `last_import_at` always loses

A backend that hasn't reported `last_import_at` (either because `add-federation-health-exposition` hasn't merged yet, or because that backend hasn't completed its first import) is never preferred over one that has. This is a deliberate bias toward fresh information when partial information exists.

If both have null, fall through to URL alphabetical (D2 step 3). The rule is total: every `(existing, incoming)` pair has a deterministic winner.

### D6 — Degraded-mode fallback if `add-federation-health-exposition` is delayed

If this change ships before `add-federation-health-exposition`, every backend's `last_import_at` is null. D5 means every comparison falls through to URL-alphabetical. The dedup contract still holds — the source has exactly one feature per `osm_id` and the choice is deterministic — but it's not freshness-aware. Once the upstream change lands, the freshness-tiebreak activates without any code change in this module.

This is intentional: it lets the dedup work ship independently if the federation-health work hits a delay.

### D7 — Batch source mutations: `removeFeatures(toRemove)` + `addFeatures(toAdd)`, not per-feature

OL's `VectorSource.addFeature` and `removeFeature` each fire a synchronous `change` event per call (verified — `ol/source/Vector.js`). The polygon-tier renderer reacts to `change` to repaint. Per-feature mutations therefore produce N repaints per backend arrival.

The reference implementation should:

1. Walk the incoming features once, populating `toAdd` and `toRemove` arrays via the merge rule (D2).
2. Call `polygonSource.removeFeatures(toRemove)` once — fires one `change` event regardless of array length.
3. Call `polygonSource.addFeatures(toAdd)` once — fires one `change` event regardless of array length.

Total: two repaints per arrival (or one, if `toRemove` is empty — the common no-overlap case where dedup is a pass-through). PR #302's reference implementation calls `removeFeature` per-loser inside the loop, which works correctly but produces (losers + 1) repaints; the contract above is tighter and cheaper. Either pattern satisfies the spec scenarios — repaint count isn't testable from Playwright without performance instrumentation — but the batched form is the prescribed shape.

Note: there is **no** "OL existing event coalescing" — earlier drafts of this proposal claimed there was. There isn't. Each `removeFeature`/`addFeature` call fires its own event synchronously. The batched form above is the only way to limit repaint count.

## Risks / Trade-offs

- **Pan flicker on `last_import_at` change.** If a backend's refresh-poll arrives with a slightly different `last_import_at` than the previous cycle (importer ran between polls), a feature that was the winner might transiently swap to the other backend before the next refresh re-stabilises. In practice import cadence is on the order of hours-to-days, registry polls are every 5 minutes, and observed flicker should be effectively never. The spec's "Refresh stability" scenario asserts no winner *change* on stable inputs — not "no observable removeFeature/addFeature event", which would be unimplementable given the per-arrival fan-out architecture.
- **URL-alphabetical bias.** When tie-breaking on equal/null/NaN ages, URL ordering is not policy — it's coincidental. If a deployment names backends `https://a-fulda.example/api` and `https://z-hessen.example/api`, the city backend wins ties; rename to `https://z-fulda.example/api` and the state backend wins. Document in `docs/reference/federation.md` so operators understand. Case sensitivity matters: `https://A.example/api` < `https://a.example/api` (uppercase ASCII has lower code points than lowercase).
- **OL `Map` snapshot vs duplicate within one backend response.** The per-`orchestrate()` `Map<osm_id, Feature>` is updated by every winning incoming. If the incoming backend somehow has duplicate features for the same `osm_id` within its own single response (multipolygon-tagged-as-leisure-playground relations exploded by osm2pgsql — see issue #299), the second-seen wins (Map gets overwritten). Mitigation: track this as a server-side concern in #299; it is not a property the dedup loop can detect from a single backend's payload.
- **Selection-store invalidation.** If the user has selected feature `osm_id=X` from backend A, and backend B's later arrival in the same `orchestrate()` call wins, A's feature is removed before the new winner is added — the selection store still holds a reference to the now-removed feature. The selection store keys on `(osm_id, backendUrl)`, so the user's selection no longer matches anything on the map. Mitigation: out of scope for this change — reconciling the selection on winner flip is its own UX concern. Documented as an Open Question.

## Migration Plan

None. This is a frontend-only behaviour change that activates as soon as the new code ships. Existing deployments see one feature per `osm_id` from the next moveend onward; no schema migration, no data backfill, no operator action.

## Open Questions / Follow-ups

- **Region-of-truth field on `get_meta`?** A future proposal could add `authoritative_relation_ids: [62700, ...]` so a state-level backend can declare "I'm authoritative for these relation IDs" and the dedup rule could prefer it over a city backend whose relation_id is contained. Out of scope here; track if operators ask.
- **Source-subclass refactor?** If dedup logic grows (e.g. cluster-tier dedup, or a federation-wide selection store), a `DedupingVectorSource extends VectorSource` is the cleaner home. Defer until there are ≥ 2 use cases.
- **Selection-store reconciliation when winner changes** — flagged in Risks. Track if observed.
