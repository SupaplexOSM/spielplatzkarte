# playwright-ci Specification

## Purpose

Provide an automated browser-test safety net so regressions in the playground detail panel, map interactions, and security fixes (XSS escaping, contact links) cannot silently ship. Runs on every pull request and every push to `main`, with an HTML report uploaded on failure.

## Requirements

### Requirement: CI workflow runs Playwright tests on every PR and push to main
The system SHALL provide a GitHub Actions workflow (`playwright.yml`) that builds the app, starts a preview server, and runs the Playwright test suite on every pull request targeting `main` and every push to `main`.

#### Scenario: Workflow triggers on pull request
- **WHEN** a pull request is opened or updated against `main`
- **THEN** the `playwright` workflow runs automatically

#### Scenario: Workflow triggers on push to main
- **WHEN** a commit is pushed to `main`
- **THEN** the `playwright` workflow runs automatically

#### Scenario: Tests pass on a clean build
- **WHEN** the workflow runs and all tests pass
- **THEN** the workflow job completes with a green status

#### Scenario: Test report uploaded on failure
- **WHEN** one or more Playwright tests fail
- **THEN** the workflow uploads the Playwright HTML report as a workflow artefact named `playwright-report`

---

### Requirement: Map loads and renders on startup
The app SHALL load and display a map when the page is opened.

#### Scenario: Map canvas is visible
- **WHEN** the page is loaded
- **THEN** an OpenLayers map canvas element is visible in the viewport

#### Scenario: Page title is set
- **WHEN** the page is loaded
- **THEN** the document title contains "spieli"

---

### Requirement: Playground selection opens info panel
The app SHALL open the info panel when a playground feature is clicked on the map.

#### Scenario: Info panel appears after playground click
- **WHEN** a playground marker is clicked on the map
- **THEN** the info panel becomes visible

#### Scenario: URL hash is set on selection
- **WHEN** a playground marker is clicked on the map
- **THEN** the URL hash is updated to contain the playground's OSM ID

---

### Requirement: ESC key closes the info panel and clears the URL hash
The app SHALL close the info panel and clear the URL hash when the ESC key is pressed while a playground is selected.

#### Scenario: ESC closes panel
- **WHEN** a playground is selected and the ESC key is pressed
- **THEN** the info panel is no longer visible

#### Scenario: ESC clears URL hash
- **WHEN** a playground is selected and the ESC key is pressed
- **THEN** the URL hash is empty

---

### Requirement: URL hash restores playground selection on page load
The app SHALL re-select the playground identified by the URL hash when the page is loaded with a hash present.

#### Scenario: Hash on load opens info panel
- **WHEN** the page is loaded with a URL hash containing a valid playground OSM ID
- **THEN** the info panel becomes visible with data for that playground

---

### Requirement: OSM field values are rendered as plain text, not HTML
The app SHALL escape special HTML characters in OSM tag values so that crafted values cannot inject HTML or execute scripts.

#### Scenario: HTML characters in playground name are escaped
- **WHEN** a playground has a name containing `<`, `>`, or `&` characters
- **THEN** those characters are displayed as visible text in the info panel, not interpreted as HTML

#### Scenario: Script tag in description does not execute
- **WHEN** a playground's description field contains a `<script>` tag value (intercepted via route mock)
- **THEN** no script executes and the literal text is visible in the panel
