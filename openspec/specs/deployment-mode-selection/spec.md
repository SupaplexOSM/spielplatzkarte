# deployment-mode-selection Specification

## Purpose
TBD - created by archiving change install-deployment-mode-selection. Update Purpose after archive.
## Requirements
### Requirement: Mode selection prompt
The installer SHALL present a numbered menu asking the operator to choose a deployment mode before any other configuration questions. Valid choices are `data-node`, `ui`, and `data-node-ui`.

#### Scenario: Operator selects data-node
- **WHEN** operator enters `1` (data-node) at the mode prompt
- **THEN** `DEPLOY_MODE=data-node` is set and only region, PBF, importer-threads questions are asked

#### Scenario: Operator selects ui
- **WHEN** operator enters `2` (ui) at the mode prompt
- **THEN** `DEPLOY_MODE=ui` is set and only remote API URL, UI links, map display, and app-port questions are asked

#### Scenario: Operator selects data-node-ui
- **WHEN** operator enters `3` (data-node-ui) at the mode prompt
- **THEN** `DEPLOY_MODE=data-node-ui` is set and all existing questions are asked (current behaviour preserved)

#### Scenario: Operator enters invalid choice
- **WHEN** operator enters a value other than 1, 2, or 3
- **THEN** the installer prints an error and re-displays the menu until a valid choice is made

### Requirement: Remote API URL for UI mode
When mode is `ui`, the installer SHALL ask for the base URL of the remote PostgREST API endpoint and write it as `API_BASE_URL` in `.env`.

#### Scenario: UI mode API URL collected
- **WHEN** `DEPLOY_MODE=ui` and operator enters a URL (e.g. `https://data.example.com/api`)
- **THEN** `.env` contains `API_BASE_URL=https://data.example.com/api`

#### Scenario: UI mode API URL has no default
- **WHEN** `DEPLOY_MODE=ui` and operator leaves API URL blank
- **THEN** installer treats it as a required field and asks again

### Requirement: DEPLOY_MODE written to .env
The installer SHALL write `DEPLOY_MODE=<value>` to `.env` so that operators can re-run `docker compose` with the correct profile without remembering their original choice.

#### Scenario: .env contains DEPLOY_MODE after install
- **WHEN** installer completes successfully for any mode
- **THEN** `.env` contains `DEPLOY_MODE=<chosen-mode>`

### Requirement: Docker Compose profile passed to all commands
Every `docker compose` call in the installer (pull, up, run importer) SHALL include `--profile $DEPLOY_MODE` so only the services for the selected mode are started.

#### Scenario: data-node mode starts only data services
- **WHEN** `DEPLOY_MODE=data-node` and operator confirms start
- **THEN** `docker compose --profile data-node up -d` is executed (db, postgrest started; app not started)

#### Scenario: ui mode starts only app service
- **WHEN** `DEPLOY_MODE=ui` and operator confirms start
- **THEN** `docker compose --profile ui up -d` is executed (app started; db, postgrest not started)

#### Scenario: data-node-ui mode starts all services
- **WHEN** `DEPLOY_MODE=data-node-ui` and operator confirms start
- **THEN** `docker compose --profile data-node-ui up -d` is executed (all services started)

### Requirement: compose.prod.yml profiles for all services
Every service in `compose.prod.yml` SHALL declare the `profiles` list matching the modes in which it participates.

#### Scenario: db and postgrest carry data-node and data-node-ui profiles
- **WHEN** compose file is parsed
- **THEN** `db` and `postgrest` services list profiles `[data-node, data-node-ui]`

#### Scenario: importer carries data-node and data-node-ui profiles
- **WHEN** compose file is parsed
- **THEN** `importer` service lists profiles `[data-node, data-node-ui]`

#### Scenario: app carries ui and data-node-ui profiles
- **WHEN** compose file is parsed
- **THEN** `app` service lists profiles `[ui, data-node-ui]`

### Requirement: Importer step skipped for UI mode
The installer SHALL skip the OSM import prompt when `DEPLOY_MODE=ui` because there is no local database.

#### Scenario: No import prompt in UI mode
- **WHEN** `DEPLOY_MODE=ui`
- **THEN** the "Run OSM import now?" confirmation is not shown

### Requirement: Done message shows relevant URLs
The final summary SHALL show only the services relevant to the selected mode.

#### Scenario: data-node done message
- **WHEN** `DEPLOY_MODE=data-node`
- **THEN** done message shows no app URL (app is not running)

#### Scenario: ui done message
- **WHEN** `DEPLOY_MODE=ui`
- **THEN** done message shows the app URL and omits database/importer hints

