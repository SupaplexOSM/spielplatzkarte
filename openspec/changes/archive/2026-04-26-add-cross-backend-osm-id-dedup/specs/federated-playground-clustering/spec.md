## ADDED Requirements

### Requirement: Hub deduplicates overlapping playgrounds by `osm_id` in the polygon tier

In hub mode, when two or more registered backends serve the same playground (overlapping coverage — e.g. a city backend inside a state backend, both shipping that city's playgrounds), the hub SHALL render exactly one feature per `osm_id` in the shared polygon `VectorSource`. The merge runs in `app/src/hub/hubOrchestrator.js` per-`orchestrate()` call, against a `Map<osm_id, Feature>` populated as backend arrivals progress through the polygon-tier `onResult` handler. The merge rule is deterministic: prefer the feature whose backend reports the freshest `last_import_at`, with `null` and unparseable timestamps always losing, and ties broken by raw-string URL alphabetical for absolute determinism across registry edits and arrival orderings.

#### Scenario: Two backends share an `osm_id`, fresher `last_import_at` wins

- **WHEN** backend A and backend B both return a feature with `osm_id = 12345` in the polygon tier, A's `get_meta` reported `last_import_at = "2026-04-25T03:00:00Z"` and B's reported `"2026-04-26T03:00:00Z"`
- **THEN** the polygon `VectorSource` contains exactly one feature with `osm_id = 12345` after both arrivals settle
- **AND** that feature's `_backendUrl` property equals B's URL (B is fresher)
- **AND** that feature's `_lastImportAt` property equals `"2026-04-26T03:00:00Z"` (frozen at parse time, read from the feature in subsequent cycles — never from the live `backends` store)

#### Scenario: Null or unparseable `last_import_at` always loses

- **WHEN** backend A reports `last_import_at = null` (or `undefined`, or any string for which `Date.parse(value)` returns `NaN`) and backend B reports any value where `Date.parse(value)` is finite
- **THEN** the kept feature comes from backend B
- **AND** the rule applies symmetrically — non-null/parseable beats null/unparseable in either arrival order

#### Scenario: Equal or both-missing timestamps tie-break by URL alphabetical

- **WHEN** backends A and B both report identical numeric `Date.parse(last_import_at)`, OR both report values that are absent / null / unparseable
- **THEN** the kept feature comes from whichever backend's `_backendUrl` string sorts first under JavaScript's raw `<` operator — code-unit-wise, no case-folding, no scheme/trailing-slash normalisation
- **AND** swapping the order of entries in `registry.json` does NOT change the winner — the URL string itself is the load-bearing key, not registry position

#### Scenario: Same instant emitted in different ISO TZ formats counts as a tie

- **WHEN** two backends return `last_import_at = "2026-04-25T12:00:00Z"` and `"2026-04-25T14:00:00+02:00"` respectively (the same instant, different TZ format)
- **THEN** `Date.parse(a) === Date.parse(b)` evaluates true, the timestamps are treated as equal, and the rule falls through to URL alphabetical
- **AND** the comparison MUST NOT use lexicographic string compare on the raw values — that would flip the winner non-deterministically based on the chosen TZ format, which is the bug PR #295 was rejected for

#### Scenario: Refresh cycle does not flip the winner on stable inputs

- **WHEN** the registry-poll refresh fires and re-fetches `get_meta` and the polygon-tier features from both backends, with neither backend's `last_import_at` having changed
- **THEN** the same backend remains the winner for every shared `osm_id`
- **AND** the rendered polygon source's content does not change (the orchestrator may issue intermediate `removeFeature`/`addFeatures` calls per backend arrival as a consequence of the per-`orchestrate()` map being rebuilt — the contract is on *winner identity*, not on event-count silence)

#### Scenario: Refresh cycle flips the winner when one backend imports newer data

- **WHEN** the previously-losing backend's `last_import_at` advances past the previously-winning backend's `last_import_at` between two registry-poll cycles
- **THEN** at the next refresh, the winner flips to the now-fresher backend for every shared `osm_id`
- **AND** the previously-winning feature is removed from the source via `removeFeature(s)` before the new feature is added via `addFeatures`

#### Scenario: Existing-feature timestamp is read from the feature, not the live `backends` store

- **WHEN** the dedup loop runs and an existing feature owned by backend B is in the source from a previous `orchestrate()` call (or a previous arrival in the same call), and the incoming feature is from backend A or B
- **THEN** the existing feature's `_lastImportAt` is read via `existing.get('_lastImportAt')` — a value that was frozen at the feature's parse time
- **AND** the comparison value is independent of any subsequent mutation of `backends.find(b => b.url === existingBackendUrl).lastImportAt`
- **AND** this contract holds even if a future refactor reintroduces in-place mutation of the `backends` store

#### Scenario: Single backend per `osm_id` is a no-op

- **WHEN** backend A returns a feature with `osm_id = 12345` and no other backend covers that playground in the same `orchestrate()` call
- **THEN** the feature is added to the source as-is
- **AND** no compare or remove is performed
- **AND** the feature carries `_backendUrl = A.url` and `_lastImportAt = A.lastImportAt ?? null`

#### Scenario: `_lastImportAt` storage and read symmetry

- **WHEN** a feature is parsed by `parsePolygonFeatures` from a backend whose `lastImportAt` is null or missing
- **THEN** the feature's `_lastImportAt` is set to JSON `null` (not omitted)
- **AND** readers of `existing.get('_lastImportAt')` MUST treat the returned `null`, `undefined` (legacy features without the property), and any string value where `Date.parse(value)` returns `NaN` identically — all three fall into the "no parseable timestamp" branch of the merge rule

#### Scenario: Source mutations are batched per arrival

- **WHEN** a polygon-tier arrival from backend X yields N losers (existing features evicted by the merge) and M winners (incoming features added)
- **THEN** the orchestrator calls `polygonSource.removeFeatures(toRemove)` once with all N losers, then `polygonSource.addFeatures(toAdd)` once with all M winners
- **AND** per-feature `removeFeature`/`addFeature` calls inside the loop are forbidden — they each fire a synchronous `change` event that triggers a renderer repaint

#### Scenario: Cluster tier is not affected by this change

- **WHEN** the active tier is the cluster tier (`zoom <= clusterMaxZoom`)
- **THEN** the dedup behaviour above does not run — the cluster tier merges by spatial proximity via Supercluster's existing kd-tree pipeline (a separate mechanism that does not surface `osm_id`)
- **AND** the polygon-tier dedup module does not touch `clusterSource` or `macroSource`
