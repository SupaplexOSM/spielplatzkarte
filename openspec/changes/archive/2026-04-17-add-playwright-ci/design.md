## Context

The project currently has a single CI workflow (`build.yml`) that verifies the Vite build succeeds and publishes Docker images on merge. There are no automated browser tests. The frontend is a plain JS ES Modules app (no framework) that loads playground data from either PostgREST or Overpass. When `apiBaseUrl` is empty the app uses Overpass directly — this "local dev mode" means the full UI can be exercised in CI without a running database.

## Goals / Non-Goals

**Goals:**
- Run Playwright tests against the production Vite build on every PR and push to main
- Cover the critical user paths: map load, playground selection, info panel rendering, ESC / URL hash behaviour
- Upload a Playwright HTML report as a CI artefact on test failure for easy debugging
- Keep CI fast: single browser (Chromium), parallel test workers, cached browser binaries

**Non-Goals:**
- Cross-browser coverage (Firefox / WebKit) — can be added incrementally
- Testing the PostgREST / Docker stack — Overpass fallback is sufficient for frontend correctness
- Visual regression / screenshot diffing
- 100% coverage — a focused smoke suite is the goal

## Decisions

### Run against `vite preview` (production build), not `vite dev`

**Why**: `vite preview` serves the actual production bundle, matching what users see. `vite dev` uses HMR transforms that don't exist in production; catching production-only issues (e.g. broken imports after tree-shaking) is valuable.

**Alternative considered**: `vite dev` — faster startup, but tests against a different artefact.

### Use Playwright's built-in `webServer` config

**Why**: Playwright starts and stops the preview server automatically, handles port conflicts, and retries the health check before running tests. No manual process management in the workflow.

**Alternative considered**: `&` backgrounding in shell + `sleep` — fragile, harder to debug.

### Cache Playwright browsers by `@playwright/test` version

**Why**: Browser binaries are ~100–300 MB each. Caching by the package version means re-download only on version bumps, keeping CI fast.

**Cache key**: `playwright-${{ hashFiles('package-lock.json') }}` — regenerates when any dep changes (safe over-invalidation, simpler than hashing only `@playwright/test`).

### Chromium only for the initial suite

**Why**: Single browser keeps the suite fast and the initial signal clear. The security-critical paths (XSS escaping, href validation) are browser-agnostic at the JS level — Chromium is sufficient to validate them.

### Separate workflow file (`playwright.yml`), not merged into `build.yml`

**Why**: Playwright tests need a built app (`needs: build` or its own build step). Keeping them separate makes it easy to re-run tests independently, add manual triggers, or adjust concurrency without touching the Docker-publishing workflow.

## Risks / Trade-offs

- **Overpass API reliability in CI**: tests that load live playground data from Overpass can flake if Overpass is slow or rate-limits CI runners. Mitigation: use `page.route()` to intercept Overpass requests and return a small fixture for data-dependent tests; leave smoke tests (map renders, URL hash) against the live API.
- **`vite preview` port conflicts**: If another job on the same runner holds port 4173, tests fail. Mitigation: Playwright `webServer.port` config will pick a free port; set `reuseExistingServer: false` in CI.
- **Test flakiness from map tile loading**: OpenLayers tile requests are async. Mitigation: wait for `networkidle` or assert on DOM state (panel visibility) rather than tile rendering.

## Open Questions

- Should the workflow post a comment to the PR with a link to the test report? (Nice-to-have, not in scope for initial cut.)
