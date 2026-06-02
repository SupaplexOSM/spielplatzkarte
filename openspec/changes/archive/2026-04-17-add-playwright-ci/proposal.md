## Why

The project has no automated browser tests — correctness is verified manually, which means regressions in the playground detail panel, map interactions, and security fixes (XSS escaping, contact links) can silently ship. Adding Playwright in CI provides a fast safety net that runs on every pull request.

## What Changes

- Add Playwright as a dev dependency with a base configuration
- Add a GitHub Actions workflow that installs dependencies, builds the app, starts a preview server, and runs Playwright tests against it
- Add an initial test suite covering the critical user paths: map loads, playground selection, info panel rendering, ESC key / URL hash behaviour
- Add `make test` target wiring into the existing Makefile

## Capabilities

### New Capabilities

- `playwright-ci`: GitHub Actions workflow that runs Playwright browser tests on every PR and push to main; reports results as a workflow summary and uploads HTML report as an artefact on failure

### Modified Capabilities

<!-- none — no existing spec-level behaviour changes -->

## Impact

- **New files**: `.github/workflows/playwright.yml`, `playwright.config.js`, `tests/` directory
- **Modified files**: `package.json` (dev dependency + test script), `Makefile` (`make test` target)
- **Dependencies**: `@playwright/test` added as a dev dependency; Playwright browsers downloaded in CI via cache
- **No runtime impact**: all changes are dev/CI only, no production code modified
