## Context

Publicly accessible web services operated by entities in Germany are legally required to carry an Impressum (TMG §5) and a Datenschutzerklärung (DSGVO Art. 13). spieli currently has neither. spieli's install base covers three container modes: `standalone` (web UI + PostgREST + DB), `data-node-ui` (same, but configured as a federation member), and `data-node` (no web UI — PostgREST + DB only; hub renders the UI). All three modes must be covered.

`get_meta()` is the federation discovery function read by the hub every 60 s via `poll-federation.sh`. It already returns instance metadata. The hub draws per-backend cards in `InstancePanelDrawer.svelte`.

## Goals / Non-Goals

**Goals:**
- Every install type can expose an Impressum and Datenschutzerklärung.
- Operators who already host legal pages can link out; others get working defaults generated from env vars.
- Hub mode surfaces per-backend legal attribution in the UI.
- No breaking changes to existing `get_meta()` callers.

**Non-Goals:**
- i18n of legal page content (tracked in #157; everything is German-only to match current UI).
- Installer wizard prompts for legal vars (follow-up).
- Rendering the operator's hosting-provider log policy (outside spieli's knowledge).

## Decisions

### D1 — Two-layer delivery: URL override ↔ generated default

If `IMPRESSUM_URL` / `PRIVACY_URL` is set the entrypoint writes those directly into `config.js` (standalone/data-node-ui) or the DB row (data-node). If unset it generates HTML from the structured `IMPRESSUM_*` vars.

**Why:** Operators who already host legal pages at a fixed URL should not be forced to re-enter address details. Those who don't need a working default without extra hosting. One env var controls which path is taken; no runtime toggle needed.

**Alternative considered:** Always generate, provide a redirect fallback if `IMPRESSUM_URL` is set. Rejected — generating content the operator has chosen to host elsewhere adds maintenance overhead.

### D2 — Content generation in docker-entrypoint.sh, not a separate script

`docker-entrypoint.sh` already sanitizes and writes `config.js` at container startup. HTML generation for Impressum + Datenschutz fits the same lifecycle: run once at startup, requires no runtime daemon.

The Datenschutz template is a static file baked into the image (e.g. `oci/app/datenschutz.template.html`) with `sed` substitution for the contact block. The Impressum is generated inline in the entrypoint (name, address, email, phone — a handful of lines).

**Why template file for Datenschutz:** The text is ~800 words covering spieli's actual data processing. Inline heredoc in shell is unmaintainable at that length. A checked-in `.template.html` is reviewable and auditable.

### D3 — Serve at /impressum and /datenschutz via nginx alias, not hash routes

nginx serves the generated files from the webroot at `/impressum` and `/datenschutz` (no `.html` extension). The SPA's hash-based routing is unchanged.

**Why nginx alias over hash route:** Legal page URLs should be stable, bookmarkable, and indexable. Serving them as separate nginx routes avoids loading the full SPA JS bundle for a static HTML page. The entrypoint already writes into the nginx webroot.

### D4 — Extend get_meta() with impressum_url / privacy_url; add get_legal() for data-node

For `standalone` and `data-node-ui`: `get_meta()` returns `impressum_url` / `privacy_url` as absolute URLs (built from `SITE_URL` + `/impressum` | `/datenschutz`). When the override env var is set, the override URL is used directly.

For `data-node` (no web UI): `docker-entrypoint.sh` writes generated content into a `legal_content` table in the `api` schema. A new PostgREST function `get_legal(type text)` returns the stored HTML. `get_meta()` returns `null` for both URL fields when no URL override is set, signalling the hub to fall back to `get_legal()`.

**Why a DB table for data-node content:** The data-node has no nginx serving static files. The only outbound interface is PostgREST. Writing into the DB at startup lets the hub fetch on demand without a separate file server.

**Why `get_legal()` returns JSON `{ "content": "..." }` rather than bare `text/html`:** PostgREST's default content-type is `application/json`. Returning JSON avoids a custom `Accept` header requirement on the hub's fetch, keeping the hub's fetch path uniform with other RPC calls.

### D5 — XSS boundary: hub renders foreign HTML in a sandboxed iframe srcdoc

When the hub fetches `get_legal()` content from a backend and displays it in a modal, it renders via `<iframe srcdoc="...">` with a restrictive `sandbox` attribute (`sandbox="allow-same-origin"` only — no scripts, no forms, no popups). No DOMPurify dependency is introduced.

**Why iframe over DOMPurify:** Content comes from operator-controlled PostgREST instances (within the trusted registry). The boundary is about defense-in-depth, not adversarial sanitization. `iframe srcdoc` achieves full script isolation without a JS dependency and keeps the approach consistent whether `content` is hand-written by an operator or generated by our template.

**DOMPurify alternative:** Would allow rendering in-DOM (better theming integration) but adds a dependency. Defer to a follow-up if operators request it.

### D6 — ⓘ info button: shared component, renders in both standalone and hub

A new `LegalModal.svelte` component renders Impressum and Datenschutz links (or embeds content). Used in both `StandaloneApp.svelte` (over the map) and the hub's own ⓘ info flow.

In standalone mode it links to `/impressum` / `/datenschutz` (or the override URLs from `config.js`).
In hub mode, the hub's own legal pages follow the same two-layer rule; the component receives resolved URLs or content as props.

**Why one component:** The visual appearance is identical in both modes. A single component avoids drift between the two.

### D7 — § / 🔒 icons per backend row, hidden when not configured

`InstancePanelDrawer` shows small inline icons next to each backend name when `impressum_url` / `privacy_url` is non-null in `get_meta()`. Clicking opens either the external URL (new tab) or fetches `get_legal()` and shows the content in the sandboxed modal. Icons are absent when both values are null — graceful degradation, no broken-link UX.

### D8 — SITE_URL env var for absolute URL construction

`docker-entrypoint.sh` uses `SITE_URL` (e.g. `https://spieli.fulda.de`) to build the absolute URLs written into `get_meta()`. If unset, `get_meta()` returns relative paths (`/impressum`, `/datenschutz`). Hub callers must resolve relative URLs against the backend's base URL — this is the existing pattern for `get_meta()`'s `bbox` field.

**Why not derive from request headers:** PostgREST functions run in the DB with no HTTP context. An explicit env var is simpler and more predictable.

## Risks / Trade-offs

- **content table written once at startup**: If the operator changes `IMPRESSUM_NAME` and restarts, the table is overwritten on next start. Only one set of content can be active. No versioning is provided — this is acceptable for a legal page that rarely changes.
- **iframe srcdoc theming**: Content rendered in an iframe won't inherit the app's CSS. The generated template must be self-contained (inline styles or a minimal embedded stylesheet). Acceptable for legal content; a follow-up can add a shared CSS link if operators request it.
- **Old backends without impressum_url / privacy_url in get_meta()**: Hub must treat absent fields as null. This is the existing pattern for fields added to `get_meta()` (e.g. `importing`).
- **SITE_URL unset on data-node-ui**: If the operator omits `SITE_URL`, `get_meta()` returns relative paths. The hub must resolve against the backend's registered base URL. Document in ops/configuration.md.
