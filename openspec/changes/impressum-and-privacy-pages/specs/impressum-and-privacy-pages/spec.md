## ADDED Requirements

### Requirement: docker-entrypoint generates Impressum and Datenschutz HTML from env vars

`docker-entrypoint.sh` SHALL generate `impressum.html` and `datenschutz.html` in the nginx webroot at container startup when the corresponding override URL env vars are not set, so operators without an existing legal page have a working default.

#### Scenario: Impressum file generated when IMPRESSUM_URL unset

- **GIVEN** `IMPRESSUM_URL` is not set in the container environment
- **AND** `IMPRESSUM_NAME`, `IMPRESSUM_ADDRESS`, `IMPRESSUM_EMAIL` are set
- **WHEN** the container starts
- **THEN** `/usr/share/nginx/html/impressum.html` exists and contains the values of `IMPRESSUM_NAME`, `IMPRESSUM_ADDRESS`, and `IMPRESSUM_EMAIL`
- **AND** the file is valid HTML

#### Scenario: Impressum file not generated when IMPRESSUM_URL is set

- **GIVEN** `IMPRESSUM_URL` is set to an external URL
- **WHEN** the container starts
- **THEN** no `impressum.html` is written to the webroot
- **AND** `config.js` contains `impressumUrl: '<value of IMPRESSUM_URL>'`

#### Scenario: Optional fields absent from generated Impressum

- **GIVEN** `IMPRESSUM_ORG` and `IMPRESSUM_PHONE` are not set
- **WHEN** `impressum.html` is generated
- **THEN** no empty placeholder rows or labels appear for those fields

#### Scenario: Datenschutz template placeholders substituted

- **GIVEN** `IMPRESSUM_NAME` and `IMPRESSUM_EMAIL` are set
- **AND** `PRIVACY_URL` is not set
- **WHEN** `datenschutz.html` is generated from the template
- **THEN** all `{{IMPRESSUM_NAME}}` and `{{IMPRESSUM_EMAIL}}` placeholders are replaced with the env var values
- **AND** no unresolved `{{...}}` placeholders remain in the file

#### Scenario: HTML injection prevented in env var values

- **GIVEN** `IMPRESSUM_NAME` contains `<script>alert(1)</script>`
- **WHEN** `impressum.html` is generated
- **THEN** the output contains the escaped form (`&lt;script&gt;...`) and no `<script>` tag executes

### Requirement: nginx serves /impressum and /datenschutz

nginx SHALL serve the generated legal pages at `/impressum` and `/datenschutz` as `text/html`, so the URLs are stable and do not require the SPA to load.

#### Scenario: GET /impressum returns 200 text/html

- **WHEN** a client sends `GET /impressum` to a running standalone or data-node-ui container with generated content
- **THEN** the response is HTTP 200 with `Content-Type: text/html`
- **AND** the body contains the generated Impressum content

#### Scenario: GET /datenschutz returns 200 text/html

- **WHEN** a client sends `GET /datenschutz`
- **THEN** the response is HTTP 200 with `Content-Type: text/html`
- **AND** the body contains the generated Datenschutz content

#### Scenario: SPA routing not triggered for legal paths

- **WHEN** a client fetches `/impressum` or `/datenschutz`
- **THEN** the response is the static HTML file, not the SPA index.html

### Requirement: get_meta exposes impressum_url and privacy_url

`api.get_meta()` SHALL return `impressum_url` and `privacy_url` fields so the hub can discover per-backend legal attribution without a separate request.

#### Scenario: get_meta returns absolute URLs when SITE_URL is set

- **GIVEN** `SITE_URL=https://spieli.example.com` is set and no override URL is configured
- **WHEN** a client calls `api.get_meta()`
- **THEN** the response contains `"impressum_url": "https://spieli.example.com/impressum"` and `"privacy_url": "https://spieli.example.com/datenschutz"`

#### Scenario: get_meta returns override URL when IMPRESSUM_URL is set

- **GIVEN** `IMPRESSUM_URL=https://example.com/rechtliches` is set
- **WHEN** a client calls `api.get_meta()`
- **THEN** the response contains `"impressum_url": "https://example.com/rechtliches"`

#### Scenario: get_meta returns null when no URL is available

- **GIVEN** `SITE_URL`, `IMPRESSUM_URL`, and `PRIVACY_URL` are all unset
- **WHEN** a client calls `api.get_meta()`
- **THEN** the response contains `"impressum_url": null` and `"privacy_url": null`

#### Scenario: Old clients unaffected

- **WHEN** a client that does not read `impressum_url` / `privacy_url` calls `api.get_meta()`
- **THEN** all pre-existing fields are unchanged and the client operates normally

### Requirement: get_legal exposes generated HTML for data-node backends

`api.get_legal(type text)` SHALL return the stored legal HTML for `data-node` backends that have no nginx serving static files, so the hub can fetch and display legal content on demand.

#### Scenario: get_legal returns impressum content

- **GIVEN** a data-node container has started with `IMPRESSUM_NAME` etc. set and no `IMPRESSUM_URL`
- **WHEN** the hub calls `GET /rpc/get_legal?type=impressum`
- **THEN** the response is HTTP 200 with JSON `{ "content": "<html>..." }` where content contains the generated Impressum HTML

#### Scenario: get_legal returns null on miss

- **WHEN** a client calls `get_legal` with `type = 'impressum'` on a backend that has not stored any legal content
- **THEN** the response is HTTP 200 with JSON `null`
- **AND** no 404 or 500 is returned

#### Scenario: get_legal rejects unknown type

- **WHEN** a client calls `get_legal` with an unknown type value
- **THEN** the DB CHECK constraint prevents storage of that type
- **AND** no content is returned

### Requirement: Standalone app always exposes LegalButton

The standalone frontend SHALL always render a legal attribution button that opens an Impressum / Datenschutz modal, so users can always reach legal pages. The entrypoint always provides at least relative `/impressum` and `/datenschutz` URLs, so the button is always present in production.

#### Scenario: LegalButton always visible

- **GIVEN** the standalone app loads
- **THEN** the LegalButton (Scale icon) is always visible on the map, regardless of URL config

#### Scenario: LegalButton opens modal with configured links

- **GIVEN** `impressumUrl` is non-null in `window.APP_CONFIG`
- **WHEN** the LegalButton is clicked
- **THEN** a modal appears containing a link to `impressumUrl` opening in a new tab

#### Scenario: Modal shows neutral message when both URLs null

- **GIVEN** both `impressumUrl` and `privacyUrl` are null in `window.APP_CONFIG`
- **WHEN** the LegalModal opens
- **THEN** a neutral "Keine rechtlichen Angaben verfügbar" message is shown

#### Scenario: Modal shows only configured links

- **GIVEN** `impressumUrl` is set and `privacyUrl` is null
- **WHEN** the LegalModal opens
- **THEN** the Impressum link is visible
- **AND** no Datenschutz link is rendered

### Requirement: Hub exposes per-backend legal icons in InstancePanelDrawer

The hub SHALL render legal attribution icons next to each backend in the instances drawer, so federation users can identify the legal entity responsible for each data source.

#### Scenario: § icon appears when impressum_url is non-null

- **GIVEN** a backend's `get_meta()` returns `"impressum_url": "https://example.com/impressum"`
- **WHEN** the hub drawer renders the backend row
- **THEN** a § icon is visible next to the backend name
- **AND** clicking it opens the URL in a new browser tab

#### Scenario: § and 🔒 icons always visible per backend

- **GIVEN** any backend in the hub drawer
- **THEN** both § and 🔒 icons are always rendered next to the backend name

#### Scenario: § icon click shows neutral message when no legal data available

- **GIVEN** `"impressum_url": null` and `"has_legal": false` for a backend
- **WHEN** the user clicks the § icon
- **THEN** a modal appears with a neutral "Keine rechtlichen Angaben für <name> verfügbar" message

#### Scenario: Clicking § on data-node fetches and renders get_legal content

- **GIVEN** `"impressum_url": null` in `get_meta()` (data-node, no web UI)
- **AND** `"has_legal": true` (backend has `legal_content` table populated)
- **AND** `get_legal?type=impressum` returns `{ "content": "<html>..." }`
- **WHEN** the user clicks the § icon
- **THEN** the hub fetches `get_legal?type=impressum` from the backend
- **AND** the content is rendered in a sandboxed `<iframe srcdoc>` modal

#### Scenario: Fetched HTML is rendered in a sandboxed iframe

- **WHEN** the hub renders content fetched via `get_legal()`
- **THEN** the iframe has `sandbox="allow-same-origin"` (no `allow-scripts`, no `allow-forms`)
- **AND** any script tags present in the content are inert

#### Scenario: Legal modal shows error on fetch failure

- **WHEN** the `get_legal()` fetch fails with a network error or non-2xx response
- **THEN** the modal displays a user-facing error message
- **AND** no partial HTML is rendered

### Requirement: Hub poll pipeline carries impressum_url and privacy_url in federation-status.json

`poll-federation.sh` SHALL include `impressum_url` and `privacy_url` from each backend's `get_meta()` in `/federation-status.json`, so the hub UI can read them from the poll cache without additional API calls per backend.

#### Scenario: Status JSON includes legal URL fields

- **WHEN** `poll-federation.sh` runs against a backend whose `get_meta()` returns non-null `impressum_url`
- **THEN** `/federation-status.json` contains `"impressum_url": "..."` for that backend

#### Scenario: Status JSON defaults to null for absent fields

- **WHEN** a backend's `get_meta()` does not include `impressum_url` (older backend)
- **THEN** `/federation-status.json` contains `"impressum_url": null` for that backend (via `jq`'s `// null`)
