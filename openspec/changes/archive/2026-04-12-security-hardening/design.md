## Context

The app fetches playground data from PostgREST (which reads PostgreSQL/PostGIS) and renders OSM tag values into the detail panel using `innerHTML`. OSM is a crowd-sourced dataset — any registered user can set a tag value to `<script>alert(1)</script>`. Currently those values are interpolated directly into HTML strings, creating stored XSS. The nginx server returns no security headers.

The frontend is a Vite-built ES module bundle served by nginx. There is no server-side rendering. All OSM data arrives as JSON from the `/api/` PostgREST proxy.

## Goals / Non-Goals

**Goals:**
- Eliminate stored XSS from OSM tag values in innerHTML
- Prevent protocol injection in `tel:` / `mailto:` link hrefs
- Add standard HTTP security headers to nginx
- Scope `postMessage` to a configurable trusted origin

**Non-Goals:**
- DOM-library adoption (DOMPurify or similar) — overkill for this use case; a small `escapeHtml()` helper is sufficient
- Authentication or authorisation changes
- PostgREST / SQL-layer hardening (PostgREST uses parameterised queries; no injection risk there)

## Decisions

### 1. Escape with a local helper, not a library

**Decision:** Add a single `escapeHtml(str)` utility in `selectPlayground.js` (or a shared `utils.js`) that converts `&`, `<`, `>`, `"`, `'` to their HTML entities.

**Rationale:** The app only needs to make text safe for innerHTML insertion. DOMPurify is designed for rich HTML (user-authored markup). Here, all OSM values are plain text — no formatting is intentionally preserved. A 5-line helper is simpler, has zero dependency surface, and is easy to audit.

**Alternative considered:** Switch all assignments from `innerHTML` to `textContent`. Not universally applicable — many assignments mix escaped OSM values with trusted static HTML tags (`<span class="info-label">`, `<i>`, `<br>`), so plain `textContent` would destroy the layout.

### 2. Allowlist-validate link protocols

**Decision:** Before constructing `href="tel:${phone}"` or `href="mailto:${email}"`, check that the value starts with the expected protocol. If it does not match, omit the link rather than render a potentially dangerous href.

**Rationale:** A `javascript:` URI in a `tel:` href is clickable on most browsers. OSM data is crowd-sourced and unvalidated at ingestion. Simple prefix checks cost nothing and eliminate the entire class.

### 3. HTTP security headers in nginx

**Decision:** Add a `Content-Security-Policy` that allows:
- `default-src 'self'`
- `script-src 'self'` (Vite bundles all JS into the same origin)
- `style-src 'self' 'unsafe-inline'` (Bootstrap uses inline styles)
- `img-src 'self' data: https:` (Wikimedia Commons, OpenStreetMap tile servers)
- `frame-src https://panoramax.xyz` (Panoramax iframe)
- `connect-src 'self' https:` (PostgREST proxy + external APIs)

Also add `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (the app is embedded in Hub via iframe — use `ALLOW-FROM` is deprecated; Hub handles this via CSP on its end), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self)`.

**Alternative considered:** Setting headers in the Vite dev server — not persistent in production. nginx is the right place.

**Note on X-Frame-Options:** The app is intentionally embeddable in the spieli Hub iframe. `X-Frame-Options: SAMEORIGIN` would block this. Use `ALLOW-FROM` is deprecated. The correct solution is to omit `X-Frame-Options` and rely on CSP `frame-ancestors` instead, which supports multiple trusted origins.

### 4. postMessage target origin

**Decision:** Read a `PARENT_ORIGIN` value from `window.APP_CONFIG` (set by `docker-entrypoint.sh` from an env var, defaulting to `'*'` to preserve backward compatibility). Use this as the `targetOrigin` in `postMessage`.

**Rationale:** Sending `postMessage` to `'*'` means any page that has embedded this app as an iframe can receive the escape event. Scoping to the Hub origin prevents information leakage to unknown embedders. The default of `'*'` ensures standalone deployments that haven't configured a Hub origin are unaffected.

## Risks / Trade-offs

- **Breaking legitimate HTML in OSM fields:** Some OSM contributors add basic markup in `description` fields. After escaping, this will render as literal characters (e.g. `&lt;b&gt;`). This is the correct behaviour — we do not render contributor-supplied HTML.
- **CSP `unsafe-inline` for styles:** Bootstrap 5 relies on inline styles. Removing this would require significant refactoring. Accepted trade-off for now.
- **CSP in nginx blocks dev server:** The Vite dev server runs on a different port. During `make dev`, headers come from Vite's dev middleware, not nginx. CSP only applies to the Docker stack. This is acceptable.

## Migration Plan

1. Add `escapeHtml()` utility to `js/selectPlayground.js`
2. Apply it to all OSM tag value interpolations in that file
3. Apply it to the toast message in `js/map.js`
4. Validate phone/email protocol before href construction
5. Add security headers to `nginx.conf`
6. Add `PARENT_ORIGIN` to `public/config.js` and `docker-entrypoint.sh`; update `js/config.js` and `js/main.js`
7. Rebuild and smoke-test the detail panel against a real playground
