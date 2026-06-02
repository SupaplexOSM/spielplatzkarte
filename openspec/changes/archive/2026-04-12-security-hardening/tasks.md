## 1. XSS Prevention — escapeHtml helper

- [ ] 1.1 Add `escapeHtml(str)` utility function to `js/selectPlayground.js` that escapes `&`, `<`, `>`, `"`, `'` to HTML entities; return empty string for null/undefined input

## 2. XSS Prevention — escape OSM values in detail panel

- [ ] 2.1 Escape `location_str` (built from `addr:street`, `addr:suburb`, etc.) before `info-location` innerHTML assignment
- [ ] 2.2 Escape `description`, `description_de`, `note`, `fixme` values before building `playgroundDescription`
- [ ] 2.3 Escape `surfaceLabel` fallback (raw `surface` tag value) before `info-surface` innerHTML assignment
- [ ] 2.4 Escape `operator` value before `info-operator` innerHTML assignments (both the linked and unlinked variants)
- [ ] 2.5 Escape `ageStr` (built from `min_age`/`max_age` tags) before `info-age` innerHTML assignment
- [ ] 2.6 Escape equipment device names (`name_de`, raw key fallback) and attribute values in `device_string` / `fallback_string` before `info-device-list` / `info-equipment` innerHTML assignments

## 3. XSS Prevention — validate phone and email hrefs

- [ ] 3.1 Validate `phone` value: only render as `href="tel:..."` if it starts with `+` or a digit; otherwise display as escaped plain text
- [ ] 3.2 Validate `email` value: only render as `href="mailto:..."` if it contains `@`; otherwise display as escaped plain text

## 4. XSS Prevention — postMessage origin

- [ ] 4.1 Add `parentOrigin` key to `public/config.js` (default empty string) and to `docker-entrypoint.sh` (env var `PARENT_ORIGIN`, default empty)
- [ ] 4.2 Export `parentOrigin` from `js/config.js`
- [ ] 4.3 Update `js/main.js` to use `parentOrigin || '*'` as the `targetOrigin` in `window.parent.postMessage`

## 5. HTTP Security Headers — nginx

- [ ] 5.1 Add `X-Content-Type-Options: nosniff` to `nginx.conf` as a global response header
- [ ] 5.2 Add `Referrer-Policy: strict-origin-when-cross-origin` to `nginx.conf`
- [ ] 5.3 Add `Permissions-Policy: geolocation=(self)` to `nginx.conf`
- [ ] 5.4 Add `Content-Security-Policy` header to `nginx.conf` with directives: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: https:`, `frame-src https://panoramax.xyz`, `connect-src 'self' https:`, `font-src 'self'`, `frame-ancestors 'self'`

## 6. Verification

- [ ] 6.1 Run `make docker-build` and open the app — verify the detail panel still renders correctly for a real playground (name, operator, surface, contact, equipment)
- [ ] 6.2 Check response headers with `curl -I http://localhost:8080` — confirm all five security headers are present
