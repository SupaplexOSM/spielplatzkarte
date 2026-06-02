## Context

spieli ships a single Svelte app that renders one of two entry points based on `APP_MODE`:

- `APP_MODE=standalone` → `StandaloneApp.svelte` — full UI for a single regional backend.
- `APP_MODE=hub` → `HubApp.svelte` — a thin wrapper that mounts the map, the playground detail panel, and an `InstancePanel` listing registered backends.

`HubApp` and `StandaloneApp` share `components/Map.svelte` but otherwise duplicate nothing — `HubApp` was designed as an aggregation-only view, assuming users wanting the full feature set would use a standalone instance.

That assumption no longer holds: operators deploying federated topologies want the hub to be the primary UI, not a secondary overview. The spieli.eu deployment makes this concrete — the hub is the landing page, and the lack of search / filters / locate / deep-link puts the hub at a feature deficit relative to its data-nodes.

## Goals / Non-Goals

**Goals**

- Every user-facing feature in standalone mode is available in hub mode.
- Standalone mode behaviour is byte-equivalent to today after the refactor.
- Hub behaviour is **data-driven** — no hardcoded geography, no assumption that the hub spans Germany or any other specific region.
- Layout cost of the backend-list UI stays small: collapsed pill by default, only expands on user action.
- The refactor is testable via the existing Playwright setup; no new test framework.

**Non-Goals**

- Server-side changes (DB, SQL, PostgREST, importer).
- Per-backend filter configuration or per-backend contribution flows.
- Nested federation (hubs that aggregate other hubs).
- Any visual redesign of widgets that already exist in standalone.
- Support for deep-link schemes other than the URL hash (query params, path segments).

## Decisions

### D1 — Extract a shared `AppShell` component

`AppShell.svelte` owns: layout, responsive breakpoints, all widgets that are mode-independent, keyboard shortcuts, and the map mounting. Data-dependent concerns are injected as props. Both mode-specific apps compose `AppShell`.

Alternatives considered:

- *HubApp wraps StandaloneApp* — rejected: `StandaloneApp` would need so many injected props (playground source, data loader, extent source, nearest fetcher, contribution links, topleft slot) that it becomes the shell in all but name, with a misleading file location.
- *Single `App.svelte` with `{#if appMode === 'hub'}` branches* — rejected: hub-only imports (registry, instance panel) leak into the standalone bundle; conditional branches sprinkle through layout code and make either mode harder to reason about in isolation.

### D2 — Data providers injected via props

`AppShell` exposes:

| Prop | Type | Purpose |
|---|---|---|
| `playgroundSource` | `VectorSource` | The OL source to render. Hub shares one across backends; standalone owns its own. |
| `searchExtent` | `Readable<[minLon, minLat, maxLon, maxLat]>` | Reactive bounds store for Nominatim. |
| `nearestFetcher` | `(lat, lon) => Promise<Feature[]>` | Returns distance-sorted nearest playgrounds. |
| `dataContribLinks` | `{ wikiUrl: string, chatUrl: string \| null }` | Content for the contribution modal. |
| `defaultBackendUrl` | `string` | Fallback backend URL when a feature has no `_backendUrl`. |
| `instancePanel` | Svelte snippet (optional) | Rendered bottom-left above the scale line. |

This keeps `AppShell` agnostic about how data is produced.

### D3 — InstancePanel as pill + drawer, bottom-left

Pill content: globe icon, `<N> Regionen · <M> Spielplätze`, where N is the registered backend count and M is the sum of `featureCount` across backends.

Position: bottom-left. The scale-line is positioned **below** the pill (both today the scale-line and the new pill want the same anchor; pill wins, scale-line adjusts downward).

Interaction:

- Click pill → drawer slides up, contains the existing per-backend detail list (name, version, status, count).
- ESC, outside click, or second pill tap → drawer collapses.
- `aria-expanded` on pill, focus trap while drawer is open.

Loading and error states are reflected in the pill itself:

- Registry still loading → pill shows a small spinner and "Lade Instanzen …".
- Registry fetch failed → pill shows a warning icon and "Registry nicht erreichbar".
- Zero backends reachable → pill shows "0 Regionen" (drawer lists each with its error).

Alternatives considered:

- *Top-right stacked panel* — rejected: collides with Filter + Edit controls; vertical real-estate cost is too high.
- *Top-right pill with drawer* — rejected: still crowds top-right; bottom-left is underused.

### D4 — URL hash scheme: `#<slug>/W<osm_id>`

Parsed shapes:

```
#W<osm_id>             — legacy; standalone behaves as today, hub broadcasts
#<slug>/W<osm_id>      — new; <slug> identifies a backend in registry.json
```

Hub behaviour:

- With slug → resolve slug to a backend via the registry, wait for that backend's features to load, select the matching osm_id.
- Without slug → search all loaded backends' features; pick the first match. Log a console warning if more than one backend has the same osm_id (rare, but possible across overlapping regions).

Standalone behaviour:

- With or without slug → select by osm_id from the single configured backend. Slug is accepted but ignored (so shared links paste cleanly into either mode).

Writing: when a playground is selected in hub, write `#<slug>/W<osm_id>` to `location.hash` using the feature's `_backendUrl` resolved back to a slug via the registry. If the backend has no slug, write the legacy form.

Alternatives considered:

- *Query parameter `?backend=<slug>&osm=<id>`* — rejected: would require history API use; hash is already the idiom in this app.
- *Encoding the URL of the backend directly into the hash* — rejected: long, leaks infra details, breaks if a backend moves.

### D5 — Aggregated search extent and initial map fit

The registry already calls `get_meta` per backend, which returns a `bbox`. The registry exposes an aggregated-bbox store that emits the union of all individual bboxes (recomputed when any backend's meta arrives).

`AppShell` consumes this store for two purposes:

1. Initial `view.fit(aggregatedBbox, { padding })` — hub-mode only.
2. `searchExtent` prop passed to `SearchBar` for Nominatim bounds.

Rationale: one data source, two consumers, same data. Keeps hub behaviour correct for arbitrary backend sets (Swiss cantons, a single city, global federation).

### D6 — Multi-backend nearest fetcher

`registry.js` exports `fetchNearestAcrossBackends(lat, lon)`:

1. For each reachable backend, fire `get_nearest_playgrounds?lat=&lon=` in parallel.
2. Apply a per-backend timeout (e.g. 3 s) via `AbortController`.
3. Merge results; re-sort by `distance_m` ascending; dedupe by `osm_id` keeping the nearest match.
4. Return up to a configurable limit (default: 10, same as standalone).

A failing or timed-out backend contributes zero results but does not block the user interaction — consistent with existing behaviour when `apiBaseUrl` is unset in standalone.

### D7 — DataContribution links in hub mode

Hub passes:

```js
{
  wikiUrl: 'https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground',
  chatUrl: null,
}
```

`DataContributionModal` hides the chat-link section when `chatUrl` is null. Standalone continues to pass per-region values from its `regionPlaygroundWikiUrl` / `regionChatUrl` config. No new config knobs for hub.

### D8 — `slug` field in `registry.json` (optional)

Registry entry (full form):

```json
{
  "slug":    "bw",
  "name":    "Baden-Württemberg",
  "url":     "https://bw.example.org/api"
}
```

Slug is **optional**. When absent:

- Deep-links to a specific backend via slug aren't possible for this entry, but everything else works (broadcast-search, aggregation, etc.).
- `InstancePanelDrawer` still renders the entry by `name`.

Backwards compatibility: existing registry files with just `{name, url}` entries continue to work. Both top-level shapes (`{instances: [...]}` and bare array) remain supported.

Slug format: lowercase ASCII, digits, hyphens — validated at load time; invalid slugs logged and treated as missing.

## Risks

- **AppShell extraction touches the bulk of the frontend.** Regression risk is low (it's a move, not a rewrite) but needs end-to-end smoke coverage. Mitigation: run the existing Playwright suite against both modes after each task.
- **Multi-backend nearest can be slow.** If several backends are unhealthy, the user waits for timeouts. Mitigation: per-backend timeout + parallel fetches, render partial results as they arrive (stretch).
- **Pill + mobile bottom-sheet may fight for z-index.** Bottom-left on mobile is near the bottom-sheet drag handle. Mitigation: on mobile, collapse the drawer when the bottom-sheet is expanded; keep the pill visible but small.
- **Coordination with `document-federated-hub-deployment`.** That in-flight change also plans `docs/reference/registry-json.md`. This change creates it first; the other change's tasks that reference it should be updated to cross-link rather than create.
- **Slug collisions between registries.** Two hubs could both use `slug: "bw"` for different backends. Acceptable — slugs are scoped per registry, deep-links are per-deployment.
