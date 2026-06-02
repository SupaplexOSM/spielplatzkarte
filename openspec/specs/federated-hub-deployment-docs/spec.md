# federated-hub-deployment-docs Specification

## Purpose
TBD - created by archiving change document-federated-hub-deployment. Update Purpose after archive.
## Requirements

### Requirement: Federated deployment walkthrough exists
The documentation SHALL contain an end-to-end walkthrough page for standing up a federated deployment consisting of one Hub UI (`DEPLOY_MODE=ui`, `APP_MODE=hub`) plus one or more data-nodes (`DEPLOY_MODE=data-node`) without any UI of their own.

#### Scenario: Walkthrough page is reachable from the MkDocs site
- **WHEN** the MkDocs site is built
- **THEN** a page titled "Federated deployment" (or equivalent) is present under the Ops section of the navigation and is built without warnings in `--strict` mode

#### Scenario: Walkthrough describes every node's `.env`
- **WHEN** a reader follows the walkthrough
- **THEN** the `.env` content for each data-node and for the Hub UI is shown explicitly, with mode-specific variables called out (e.g. `APP_MODE=hub` and `REGISTRY_URL` on the Hub; `OSM_RELATION_ID`, `PBF_URL` on each data-node)

#### Scenario: Walkthrough provides a copy-pasteable registry example
- **WHEN** a reader reaches the Hub configuration step
- **THEN** a complete `registry.json` example with at least two backend entries is shown inline, ready to copy

#### Scenario: Walkthrough shows the docker compose invocations
- **WHEN** a reader reaches the "start the stack" step for each node
- **THEN** the exact `docker compose --profile <mode> up -d` command (and for data-nodes, the importer invocation) is shown

### Requirement: registry.json schema is documented
The documentation SHALL contain a reference page describing the accepted `registry.json` shapes and per-entry fields, with the page linked from the federation reference page.

#### Scenario: Both accepted top-level shapes are documented
- **WHEN** a reader consults the registry-json reference page
- **THEN** both `{instances: [...]}` and bare-array shapes are documented as valid, matching the behaviour in `app/src/hub/registry.js`

#### Scenario: Per-entry fields match implementation
- **WHEN** a reader consults the registry-json reference page
- **THEN** the required (`url`) and optional (`name`) fields are listed, and fields that are populated at runtime from `/api/rpc/get_meta` (`version`, `region`) are clearly marked as *not* user-settable in the file

### Requirement: REGISTRY_URL listed in the configuration reference
The configuration-variables table in `docs/ops/configuration.md` SHALL include a row for `REGISTRY_URL`, consistent with its use by `oci/app/docker-entrypoint.sh` and `app/src/lib/config.js`.

#### Scenario: Variable is listed with mode scope
- **WHEN** a reader consults the configuration variables table
- **THEN** `REGISTRY_URL` appears with its mode scope (`ui` when `APP_MODE=hub`) and a one-line description linking to the walkthrough or registry-json reference

### Requirement: Hub block exists in `.env.example`
The `.env.example` file SHALL contain a commented-out Hub section showing `APP_MODE=hub` and `REGISTRY_URL`, with a comment pointing operators to the walkthrough.

#### Scenario: Hub block is present and commented
- **WHEN** `.env.example` is inspected
- **THEN** a section starting with a Hub heading contains at minimum `# APP_MODE=hub` and `# REGISTRY_URL=…`, both commented, plus a one-line pointer to the walkthrough page

### Requirement: Deploy-mode × app-mode matrix in architecture doc
The architecture reference SHALL include a matrix showing legal combinations of `DEPLOY_MODE` (`data-node`, `ui`, `data-node-ui`) and `APP_MODE` (`standalone`, `hub`), so readers understand the two axes are orthogonal.

#### Scenario: Matrix marks the Hub-UI cell
- **WHEN** a reader consults the architecture reference
- **THEN** the matrix clearly identifies the `ui + hub` cell as the federated Hub topology and points to the walkthrough

#### Scenario: Matrix marks the impossible cell
- **WHEN** a reader consults the matrix
- **THEN** the `data-node + hub` cell is marked N/A (no UI to run in hub mode), so the combination is not attempted
