## ADDED Requirements

### Requirement: OSM tag values escaped before innerHTML insertion
All string values originating from OSM tags (fetched from PostgREST or equipment API) SHALL be HTML-escaped before being interpolated into any `innerHTML` assignment. The characters `&`, `<`, `>`, `"`, and `'` MUST be converted to their HTML entity equivalents.

#### Scenario: Description with HTML characters renders safely
- **WHEN** a playground's `description` tag contains `<script>alert(1)</script>`
- **THEN** the detail panel displays the literal text `<script>alert(1)</script>` as visible characters, and no script executes

#### Scenario: Operator name with ampersand renders correctly
- **WHEN** a playground's `operator` tag is `Spielplatz & Freizeit GmbH`
- **THEN** the operator field displays `Spielplatz & Freizeit GmbH` (rendered entity, not broken HTML)

#### Scenario: Unknown surface value is escaped
- **WHEN** a playground's `surface` tag is not in the known lookup and contains `<b>gravel</b>`
- **THEN** the surface field shows the literal string `<b>gravel</b>` as text, no bold rendered

#### Scenario: Note and fixme fields escaped
- **WHEN** a playground's `note` or `fixme` tag contains `<img src=x onerror=alert(1)>`
- **THEN** no image element is injected; the tag value appears as plain escaped text

### Requirement: Link hrefs validated before use
The `phone` and `email` OSM tag values SHALL be validated before constructing `href` attributes. A phone value MUST start with `+` or a digit (after optional whitespace). An email value MUST contain `@`. Values failing validation SHALL be displayed as plain text without a hyperlink. Neither field SHALL allow a `javascript:` scheme under any circumstances.

#### Scenario: Valid phone number renders as tel: link
- **WHEN** the `phone` tag is `+49 661 12345`
- **THEN** a `href="tel:+49 661 12345"` link is rendered

#### Scenario: Invalid phone value renders as text only
- **WHEN** the `phone` tag is `javascript:alert(1)` or `call us!`
- **THEN** the value is displayed as plain escaped text with no anchor element

#### Scenario: Valid email renders as mailto: link
- **WHEN** the `email` tag is `info@spielplatz.de`
- **THEN** a `href="mailto:info@spielplatz.de"` link is rendered

#### Scenario: Invalid email value renders as text only
- **WHEN** the `email` tag contains no `@` character
- **THEN** the value is displayed as plain escaped text with no anchor element

### Requirement: postMessage uses scoped target origin
The `window.parent.postMessage()` call for the ESC key event SHALL use a configurable target origin from `window.APP_CONFIG.parentOrigin`. When `parentOrigin` is empty or absent, it SHALL default to `'*'` to preserve backward compatibility for standalone deployments.

#### Scenario: Hub origin configured
- **WHEN** `APP_CONFIG.parentOrigin` is set to `https://hub.example.com`
- **THEN** `postMessage` is sent with `targetOrigin` = `https://hub.example.com`

#### Scenario: No origin configured
- **WHEN** `APP_CONFIG.parentOrigin` is absent or empty
- **THEN** `postMessage` is sent with `targetOrigin` = `'*'`
