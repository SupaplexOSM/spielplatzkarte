## Why

The app renders OpenStreetMap tag values (description, note, operator, phone, email, surface, etc.) directly into `innerHTML` without escaping. A malicious OSM contributor can inject arbitrary HTML/JavaScript that executes in every visitor's browser. The nginx server also sends no HTTP security headers, leaving the app without a last line of defence.

## What Changes

- Add an `escapeHtml()` helper and apply it to all OSM-sourced string values before they are interpolated into `innerHTML`
- Validate `tel:` and `mailto:` href values to prevent protocol injection (e.g. `javascript:` URLs from bad OSM data)
- Add HTTP security headers to nginx: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- Replace the `postMessage` wildcard target origin (`'*'`) with a configurable trusted origin

## Capabilities

### New Capabilities
- `xss-prevention`: Escape all OSM-sourced values before innerHTML insertion and sanitize link hrefs
- `http-security-headers`: Add defensive HTTP headers to the nginx config

### Modified Capabilities
<!-- None — no existing spec-level behavior changes -->

## Impact

- `js/selectPlayground.js` — all `innerHTML` assignments that include OSM tag values; href construction for phone/email/wikidata links
- `js/main.js` — `postMessage` call; modal HTML built from i18n strings (already trusted, but reviewed for completeness)
- `js/map.js` — `innerHTML` assignment for toast messages
- `nginx.conf` — new response headers block
- No API, database, or dependency changes required
