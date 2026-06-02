## Why

Hub mode today renders a stripped-down UI: only the map, the playground detail panel, and an InstancePanel listing backends. Every other user-facing feature that ships in standalone mode is missing — search, filters (chips + panel), locate button, zoom controls, hover preview, nearby-playground suggestions, data-contribution modal, mobile bottom-sheet, responsive layout, initial region-fit, and URL-hash deep linking.

Operators running a federated deployment therefore get a visibly degraded experience compared to a single regional instance, and in practice often have to deploy a separate standalone instance alongside the hub to offer the full feature set. That defeats the point of the Hub as a first-class aggregation UI.

The gap is structural: `HubApp.svelte` and `StandaloneApp.svelte` are independent components with no shared shell, so every widget added to standalone has to be re-implemented (or skipped) in hub. This change fixes that by extracting a shared `AppShell`, leaving standalone's behaviour unchanged while giving hub every feature automatically.

## What Changes

- **Extract a shared `AppShell` component** from `StandaloneApp.svelte` containing the map, all widgets, responsive logic, and URL-hash plumbing. Data-dependent concerns are injected as props (playground source, search extent, nearest-fetcher, data-contribution links).
- **Refactor `StandaloneApp`** into a thin wrapper that composes `AppShell` with its single-backend providers. No user-visible behaviour change.
- **Refactor `HubApp`** to compose the same `AppShell` with registry-driven providers — union-bbox extent, multi-backend nearest fetcher, generic OSM-wiki contribution link, shared playground source.
- **Redesign `InstancePanel`** as a bottom-left pill showing `<N> Regionen · <M> Spielplätze`. Clicking the pill expands a drawer listing each backend's details. The scale-line shifts below the pill so the two don't overlap.
- **Extend URL-hash scheme** to `#<slug>/W<osm_id>`. The `slug` comes from `registry.json` (new optional field). Standalone ignores the slug; hub uses it to scope selection to a specific backend. Legacy `#W<osm_id>` still works — standalone behaves as today, hub broadcasts across backends.
- **Extend `registry.js`** with two new stores: an aggregated-bbox store (union of backends' `get_meta.bbox`) and a `fetchNearestAcrossBackends(lat, lon)` helper that queries each backend in parallel with a per-backend timeout and merges results.
- **Add `docs/reference/registry-json.md`** — documenting the registry schema including the new `slug` field.

Out of scope:

- Any server-side (DB, SQL, PostgREST, importer) changes.
- Per-backend filter configuration (filters are client-side and already apply uniformly to all features).
- Per-backend data-contribution links in hub mode.
- Nested hubs (hub-of-hubs).
- Theming or visual redesign of existing widgets beyond InstancePanel.

## Capabilities

### New Capabilities

- `hub-ui-parity`: Hub-mode deployments present the same user-facing feature set as standalone deployments (map, search, filters, locate, zoom, hover, nearby, contribution modal, responsive layout), with additional UI for backend aggregation (instance pill + drawer, backend-slug deep links, multi-backend nearest search, union-bbox extent).

### Modified Capabilities

- (none — no existing capability's contract changes)

## Impact

- `app/src/components/AppShell.svelte` — **new**, extracted from `StandaloneApp`, owns layout + widgets + responsive logic.
- `app/src/standalone/StandaloneApp.svelte` — becomes a thin wrapper around `AppShell`.
- `app/src/hub/HubApp.svelte` — composes `AppShell` with registry-driven providers.
- `app/src/hub/InstancePanel.svelte` — redesigned as a pill; new `InstancePanelDrawer.svelte` for the expanded state.
- `app/src/hub/registry.js` — adds aggregated-bbox store and `fetchNearestAcrossBackends`; exposes `slug` on backend records.
- `app/src/components/Map.svelte` — URL-hash parsing moves to a shared helper.
- `app/src/lib/deeplink.js` — **new**, shared hash parser/writer supporting both `#W<osm_id>` and `#<slug>/W<osm_id>`.
- `app/src/lib/api.js` — no change (the multi-backend wrapper lives in `registry.js`).
- `public/registry.json` (example, if present) — sample entry gains a `slug` field.
- `docs/reference/registry-json.md` — **new**, schema reference for the registry file.
- `docs/reference/federation.md` — updated to mention the new hub UI and deep-link scheme.

No changes to `compose.yml`, `.env.example`, any SQL, or any CI config.
