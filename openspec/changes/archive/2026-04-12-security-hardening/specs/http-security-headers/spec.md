## ADDED Requirements

### Requirement: nginx sends X-Content-Type-Options header
The nginx server SHALL include `X-Content-Type-Options: nosniff` on all responses, preventing browsers from MIME-sniffing responses away from the declared content type.

#### Scenario: Static asset response includes header
- **WHEN** a browser requests any static file from the nginx server
- **THEN** the response includes `X-Content-Type-Options: nosniff`

### Requirement: nginx sends Referrer-Policy header
The nginx server SHALL include `Referrer-Policy: strict-origin-when-cross-origin` on all responses, limiting the referrer information sent to third-party services.

#### Scenario: Cross-origin request has limited referrer
- **WHEN** a user navigates from the app to an external link
- **THEN** only the origin (not the full URL including hash) is sent as the referrer

### Requirement: nginx sends Permissions-Policy header
The nginx server SHALL include `Permissions-Policy: geolocation=(self)` to restrict geolocation access to the app's own origin only.

#### Scenario: Geolocation policy is declared
- **WHEN** any response is served by nginx
- **THEN** the response includes a `Permissions-Policy` header that permits geolocation only for `self`

### Requirement: nginx sends Content-Security-Policy header
The nginx server SHALL include a `Content-Security-Policy` header on HTML responses that:
- Restricts `default-src` to `'self'`
- Allows `script-src 'self'` only
- Allows `style-src 'self' 'unsafe-inline'` (required for Bootstrap)
- Allows `img-src 'self' data: https:`
- Allows `frame-src https://panoramax.xyz` (for the Panoramax iframe)
- Allows `connect-src 'self' https:` (for PostgREST proxy and external APIs)
- Allows `font-src 'self'` (Bootstrap Icons woff2)

#### Scenario: CSP header present on HTML response
- **WHEN** a browser requests `index.html`
- **THEN** the response includes a `Content-Security-Policy` header with the directives listed above

#### Scenario: Inline script blocked by CSP
- **WHEN** a CSP-compliant browser attempts to execute an injected inline script
- **THEN** the browser blocks execution and logs a CSP violation

### Requirement: nginx allows iframe embedding for Hub
The nginx server SHALL NOT send `X-Frame-Options` as it is superseded by CSP `frame-ancestors`. The `Content-Security-Policy` MUST include `frame-ancestors 'self'` to permit same-origin embedding while being extendable by operators who add a Hub origin.

#### Scenario: App loads in same-origin iframe
- **WHEN** the app is embedded in an iframe on the same origin
- **THEN** the browser permits the embedding (no framing violation)
