## 1. Playwright Setup

- [x] 1.1 Install `@playwright/test` as a dev dependency (`npm install --save-dev @playwright/test`)
- [x] 1.2 Add `"test": "playwright test"` script to `package.json`
- [x] 1.3 Create `playwright.config.js` with `webServer` pointing at `vite preview`, Chromium only, `reuseExistingServer: !process.env.CI`
- [x] 1.4 Add `test-results/` and `playwright-report/` to `.gitignore`
- [x] 1.5 Add `make test` target to `Makefile` that runs `npm test`

## 2. Test Fixtures

- [x] 2.1 Create `tests/fixtures/playground.json` — minimal Overpass API response containing one playground feature with a name containing `<script>` and HTML special characters, to be used as a route mock in XSS tests

## 3. Test Suite

- [x] 3.1 Create `tests/smoke.spec.js` — map canvas visible, page title contains "spieli"
- [x] 3.2 Create `tests/selection.spec.js` — click playground → panel visible, URL hash set; ESC → panel hidden, hash cleared
- [x] 3.3 Create `tests/hash-restore.spec.js` — load page with hash → panel opens for that playground (uses route mock to control data)
- [x] 3.4 Create `tests/xss.spec.js` — intercept Overpass/PostgREST response with crafted field values, assert characters rendered as text not HTML

## 4. GitHub Actions Workflow

- [x] 4.1 Create `.github/workflows/e2e.yml` — triggers on push to `main` and PRs to `main`, `needs: build` job from `build.yml` is NOT reused (standalone build step for independence)
- [x] 4.2 Pin all action SHAs and include version comments (`# vX.Y`)
- [x] 4.3 Add `actions/cache` step for Playwright browsers keyed on `playwright-${{ hashFiles('package-lock.json') }}`
- [x] 4.4 Add `Upload Playwright report` step using `actions/upload-artifact` that runs `if: failure()` and retains the report for 30 days
- [x] 4.5 Sync `package-lock.json` after installing the new dev dependency

## 5. Verification

- [x] 5.1 Run `make test` locally and confirm all tests pass against `vite preview`
- [x] 5.2 Confirm `playwright-report/` is not tracked by git

### Review Findings

- [x] [Review][Patch] XSS probe `exposeFunction` registered after navigation — probe can never fire [tests/xss.spec.js]
- [x] [Review][Patch] Fixture name field lacks `<script>` tag — spec 2.1 requires "name containing `<script>` and HTML special characters" [tests/fixtures/playground.json]
- [x] [Review][Defer] `hash-restore.spec.js` first test duplicates `selection.spec.js` first test — deferred, pre-existing test organisation choice
- [x] [Review][Defer] `restoreFromHash` silently hangs if fixture returns empty FeatureCollection — deferred, pre-existing production code behaviour
- [x] [Review][Defer] `webServer.timeout: 120_000` may be insufficient on cold CI runner with no build cache — deferred, speculative
