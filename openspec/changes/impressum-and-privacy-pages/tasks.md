## 1. Database schema

- [ ] 1.1 Add `legal_content` table to `importer/api.sql` (`type TEXT PRIMARY KEY CHECK (type IN ('impressum', 'datenschutz'))`, `content TEXT NOT NULL`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`); use `CREATE TABLE IF NOT EXISTS`
- [ ] 1.2 Add `api.get_legal(type text)` function returning `json` (`{ "content": "..." }`); return `null` when no row found for requested type; GRANT EXECUTE to `web_anon`
- [ ] 1.3 Extend `api.get_meta()` `json_build_object` with `'impressum_url', ..., 'privacy_url', ...` — read from `IMPRESSUM_URL` / `PRIVACY_URL` env var substituted into the SQL template, or construct from `SITE_URL`; fall back to `null` when neither is available
- [ ] 1.4 Run `make db-apply` and verify `curl .../rpc/get_meta | jq '{impressum_url, privacy_url}'` returns expected values for both set and unset scenarios

## 2. Docker entrypoint — content generation

- [ ] 2.1 Add `oci/app/datenschutz.template.html` — pre-written Datenschutz template covering: no tracking/analytics/user accounts, OSM data + attribution, Nominatim, Panoramax, browser geolocation opt-in, operator hosting-log note; includes `{{IMPRESSUM_NAME}}`, `{{IMPRESSUM_EMAIL}}` placeholders
- [ ] 2.2 In `oci/app/docker-entrypoint.sh`, add generation block after config.js write: if `IMPRESSUM_URL` is unset, generate `impressum.html` from env vars (`IMPRESSUM_NAME`, `IMPRESSUM_ORG`, `IMPRESSUM_ADDRESS`, `IMPRESSUM_EMAIL`, `IMPRESSUM_PHONE`) and write to nginx webroot
- [ ] 2.3 Substitute `datenschutz.template.html` placeholders via `sed` and write `datenschutz.html` to nginx webroot when `PRIVACY_URL` is unset
- [ ] 2.4 When `IMPRESSUM_URL` / `PRIVACY_URL` is set, write the override URL into `config.js` (new `impressumUrl` / `privacyUrl` fields) and skip generating the corresponding HTML file
- [ ] 2.5 For `data-node` mode (no web UI): write generated HTML into `legal_content` table via `psql` instead of nginx webroot; run after PostgREST is confirmed ready (retry loop pattern from import.sh)
- [ ] 2.6 Sanitize `IMPRESSUM_*` env vars using `printf '%s' | sed 's/[<>&"]//'` or equivalent before interpolation into HTML
- [ ] 2.7 Verify generated files are readable and well-formed HTML after `make docker-build`

## 3. nginx config

- [ ] 3.1 Add nginx `location = /impressum` and `location = /datenschutz` blocks in `oci/app/nginx.conf` to serve the generated files from webroot (no `.html` suffix)
- [ ] 3.2 Verify 200 response with `Content-Type: text/html` at both paths after `make docker-build`
- [ ] 3.3 Verify that the SPA's catch-all location rule does NOT intercept `/impressum` or `/datenschutz` requests

## 4. Frontend — config passthrough

- [ ] 4.1 In `app/src/lib/config.js`, export `impressumUrl` and `privacyUrl` read from `window.APP_CONFIG` (default `null`)

## 5. Frontend — LegalModal component

- [ ] 5.1 Create `app/src/components/LegalModal.svelte` — accepts props `impressumUrl`, `privacyUrl`; renders links that open in new tab when URLs are non-null; hides respective link when null
- [ ] 5.2 Create `app/src/components/LegalButton.svelte` — small ⓘ button that opens `LegalModal`; hidden when both `impressumUrl` and `privacyUrl` are null
- [ ] 5.3 Mount `LegalButton` in `StandaloneApp.svelte` (bottom-right corner of map, above zoom controls); pass `impressumUrl` / `privacyUrl` from config
- [ ] 5.4 Verify button is absent when both config values are null; appears and opens modal when at least one is set

## 6. Hub — InstancePanelDrawer legal icons

- [ ] 6.1 In `InstancePanelDrawer.svelte`, read `impressum_url` / `privacy_url` from each backend's `get_meta()` data (already fetched via poll pipeline)
- [ ] 6.2 Render § icon (Impressum) and 🔒 icon (Datenschutz) inline after the backend name; hide each icon when the corresponding value is null
- [ ] 6.3 On § / 🔒 click: if URL is non-null, open in new tab; if null, call `GET /rpc/get_legal?type=impressum` (or `datenschutz`) on the backend's API, then open the content modal
- [ ] 6.4 Create `app/src/components/LegalContentModal.svelte` — renders fetched HTML in `<iframe srcdoc="..." sandbox="allow-same-origin" style="width:100%;border:0;min-height:60vh">` inside a dialog/overlay
- [ ] 6.5 Handle fetch errors (non-2xx, network failure) with a user-facing error message inside the modal
- [ ] 6.6 Mount `LegalButton` in hub's own ⓘ info flow with hub's own `impressum_url` / `privacy_url` (from hub config or registry metadata)

## 7. poll-federation.sh

- [ ] 7.1 Extract `impressum_url` and `privacy_url` from `get_meta()` response and include in `/federation-status.json` per-backend entry (default `null` if field absent via `jq`'s `// null`)

## 8. .env.example and install.sh

- [ ] 8.1 Add `IMPRESSUM_NAME`, `IMPRESSUM_ORG`, `IMPRESSUM_ADDRESS`, `IMPRESSUM_EMAIL`, `IMPRESSUM_PHONE`, `IMPRESSUM_URL`, `PRIVACY_URL`, `SITE_URL` to `.env.example` with comments; mark `IMPRESSUM_URL` / `PRIVACY_URL` as optional overrides
- [ ] 8.2 Add legal vars section to `install.sh` data-node/data-node-ui flow (prompt for at minimum `IMPRESSUM_NAME`, `IMPRESSUM_ADDRESS`, `IMPRESSUM_EMAIL`; offer `IMPRESSUM_URL` / `PRIVACY_URL` override options)

## 9. Tests

- [ ] 9.1 Add Playwright test asserting `LegalButton` appears in standalone mode when `impressumUrl` is set in `config.js`; verify clicking opens a modal with the correct link
- [ ] 9.2 Add Playwright test asserting `LegalButton` is absent when both URLs are null
- [ ] 9.3 Add hub Playwright test: stub `get_meta()` for a backend with `impressum_url` set; assert § icon appears in the drawer; click → new tab opens (or assert `window.open` call)
- [ ] 9.4 Add hub Playwright test: stub `get_meta()` with both URL fields null and `get_legal()` returning content; click § → modal renders content in iframe

## 10. Documentation

- [ ] 10.1 Update `docs/reference/api.md` — add `impressum_url` / `privacy_url` to `get_meta()` response table; document new `get_legal(type)` function
- [ ] 10.2 Update `docs/ops/configuration.md` — document all `IMPRESSUM_*` vars, `SITE_URL`, `IMPRESSUM_URL`, `PRIVACY_URL`; explain two-layer delivery
- [ ] 10.3 Update `docs/ops/troubleshooting.md` — note that regenerating legal content requires container restart; explain manual `psql` update path for data-node
- [ ] 10.4 Run `make docs-build` and fix any broken links before PR
