# Testing Guide

spieli has two test layers: unit tests in the frontend and Playwright end-to-end (E2E) tests for the full app.

## Running tests

```bash
make test          # unit tests + Playwright E2E
make test-unit     # unit tests only (fast, no browser)
```

E2E tests run against `http://localhost:8080` (the Docker stack). The stack must be running (`make up`) and have data loaded (`make seed-load`) before running E2E tests locally.

CI runs both layers automatically on every pull request (`e2e.yml` + the `build-app` gate in `build.yml`).

---

## Unit tests

Unit tests live alongside the source file they test, suffixed `.test.js`:

```
app/src/lib/equipmentGrouping.test.js
```

Run them with:

```bash
make test-unit
# equivalent: node app/src/lib/equipmentGrouping.test.js
```

These tests are pure Node.js (no bundler, no browser) and run in a few milliseconds. They test the `groupEquipment()` function, which groups devices inside `playground=structure` polygons using ray-casting geometry.

### Writing a new unit test

Add a `*.test.js` file next to the module under test. Use `assert` from the Node.js standard library:

```js
import assert from 'assert';
import { groupEquipment } from './equipmentGrouping.js';

const features = [ /* GeoJSON features */ ];
const { groups, standalone } = groupEquipment(features);
assert.strictEqual(groups.length, 1, 'one group expected');
```

Then add a script entry to `app/package.json`:

```json
"test:mymodule": "node src/lib/mymodule.test.js"
```

And include it in the `make test-unit` target in `Makefile`.

---

## Playwright E2E tests

Tests live in `tests/`. Each file covers one area of the app:

| File | What it tests |
|---|---|
| `smoke.spec.js` | Page load, canvas visible, title |
| `tiered.spec.js` | Cluster/polygon tier RPC selection by zoom |
| `selection.spec.js` | Playground click → panel open, hash written |
| `hash-restore.spec.js` | Deep link restore on page load (`#W<osm_id>`) |
| `hub-smoke.spec.js` | Hub mode basic page load |
| `hub-multi-backend.spec.js` | Hub fan-out to multiple backends, Supercluster merge |
| `hub-deeplink.spec.js` | Hub deep link with backend slug (`#<slug>/W<osm_id>`) |
| `hub-pill.spec.js` | Instance pill count display |
| `hub-federation-health.spec.js` | federation-status.json polling and stale banner |
| `hub-osm-id-dedup.spec.js` | Cross-backend duplicate osm_id deduplication |
| `cluster-position.spec.js` | Cluster bucket positions reflect member centroids |
| `osmIdDedup.spec.js` | `osmIdDedup` logic (unit-style via page evaluate) |
| `xss.spec.js` | Injection safety: OSM tag values rendered as text, not HTML |

### Key test helpers (`tests/helpers.js`)

All test files import two shared helpers:

**`injectApiConfig(page, overrides?)`**

Intercepts the `config.js` request and injects a stub `window.APP_CONFIG`. Default values: `apiBaseUrl: '/api'`, `clusterMaxZoom: 0` (polygon-only to keep other suites isolated from the cluster path). Pass overrides to test specific config scenarios:

```js
await injectApiConfig(page, { clusterMaxZoom: 13, mapZoom: 12 });
```

**`stubApiRoutes(page)`**

Intercepts all `/api/rpc/*` requests and returns fixture JSON from `tests/fixtures/`. This means tests run without a live database — the Docker stack provides nginx + static assets only (or can be mocked entirely). Fixtures are minimal valid responses that satisfy the app's data contracts.

### Running a single test file

```bash
npx playwright test tests/smoke.spec.js
```

### Running with a UI (headed mode)

```bash
npx playwright test --ui
```

### Updating fixtures

Fixtures in `tests/fixtures/` are static JSON files matching the shapes documented in [API reference](../reference/api.md). Update them when the API response schema changes:

```
tests/fixtures/
├── get_playground_clusters.json   # array of { lon, lat, count, complete, partial, missing, restricted }
├── get_playgrounds_bbox.json      # GeoJSON FeatureCollection
├── get_playground.json            # single GeoJSON Feature
├── get_equipment.json             # array of GeoJSON features
├── get_meta.json                  # { relation_id, name, playground_count, bbox, … }
└── …
```

### Writing a new E2E test

1. Create `tests/mynewfeature.spec.js`.
2. Use `injectApiConfig` and `stubApiRoutes` in `beforeEach` to isolate from network + config.
3. Override specific routes as needed:

```js
import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

test.describe('My feature', () => {
  test.beforeEach(async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
  });

  test('does the thing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.my-element')).toBeVisible();
  });
});
```

4. To test a 404 fallback, override the stubbed route after `stubApiRoutes`:

```js
await stubApiRoutes(page);
await page.route('**/rpc/get_playground_clusters**', route =>
  route.fulfill({ status: 404, body: '{}' })
);
```

Playwright processes the most-recently-registered handler first, so the override takes precedence.

---

## CI behaviour

| Trigger | Tests run |
|---|---|
| Pull request against `main` | Build gate + Playwright E2E |
| Push to `main` | Build gate + Playwright E2E |
| Push of `v*` tag | Build gate only (no E2E) — the commit was already tested when it landed on `main` |

Failed E2E runs upload a Playwright HTML report as a CI artefact (30-day retention).
