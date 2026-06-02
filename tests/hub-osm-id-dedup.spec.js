// Cross-backend osm_id deduplication — Playwright tests for #202.
//
// Closes the test-coverage gaps from the bmad-code-review of PR #302:
//   - the original "winner by timestamp" test used a slug-scoped deeplink
//     that bypassed `applyDedup` entirely; this file uses
//     `window.__spieli.polygonSource` (exposed by `HubApp.svelte`) to
//     assert the post-merge source contents directly.
//   - the original smoke test attached `page.on('pageerror')` AFTER
//     `page.goto` — those handlers are now attached BEFORE navigation.
//   - the original degraded-mode test verified "no crash" only; this
//     file asserts the URL-alphabetical winner.
//   - new: refresh-stability and refresh-flip tests cover the spec
//     scenarios the original suite did not.

import { test, expect } from '@playwright/test';
import {
  injectHubConfig,
  stubHubRegistry,
  makePlayground,
} from './helpers.js';

const SHARED_OSM_ID = 5000;

// Helper: count features in `polygonSource` matching an osm_id, plus the
// winning `_backendUrl` (or null if absent). Reads the test hook attached
// in HubApp.svelte (`window.__spieli.polygonSource`).
async function readPolygonSourceFor(page, osmId) {
  return page.evaluate((id) => {
    const src = window.__spieli?.polygonSource;
    if (!src) return { available: false };
    const all = src.getFeatures().filter(f => String(f.get('osm_id')) === String(id));
    return {
      available: true,
      count: all.length,
      backendUrls: all.map(f => f.get('_backendUrl') ?? null),
      lastImportAts: all.map(f => f.get('_lastImportAt') ?? null),
    };
  }, osmId);
}

// `clusterMaxZoom: 0` + `macroMaxZoom: -1` makes the polygon tier active
// at every zoom — the orchestrator's `tierForZoom` checks macro first
// (`zoom <= macroMaxZoom`) then cluster (`zoom <= clusterMaxZoom`); a
// negative macro threshold guarantees neither branch ever matches.
function polygonOnlyOverrides() {
  return { clusterMaxZoom: 0, macroMaxZoom: -1 };
}

function makeFixtures({ lastImportAtA = null, lastImportAtB = null, urlA = '/api-a', urlB = '/api-b' } = {}) {
  const sharedPg = makePlayground({ osmId: SHARED_OSM_ID, name: 'Border Park', lon: 9.675, lat: 50.551 });
  const instanceA = {
    slug: 'slug-a',
    url: urlA,
    name: 'Backend A',
    playgrounds: { type: 'FeatureCollection', features: [sharedPg] },
    meta: {
      name: 'Region A',
      bbox: [9.6, 50.5, 9.7, 50.6],
      playground_count: 1, complete: 0, partial: 1, missing: 0,
      last_import_at: lastImportAtA,
    },
  };
  const instanceB = {
    slug: 'slug-b',
    url: urlB,
    name: 'Backend B',
    playgrounds: { type: 'FeatureCollection', features: [sharedPg] },
    meta: {
      name: 'Region B',
      bbox: [9.6, 50.5, 9.7, 50.6],
      playground_count: 1, complete: 0, partial: 1, missing: 0,
      last_import_at: lastImportAtB,
    },
  };
  return { instanceA, instanceB };
}

// Wait until the polygon source has settled with at least `expectedCount`
// features for the shared osm_id. Avoids flake-prone fixed sleeps.
async function waitForPolygonCount(page, osmId, expectedCount, timeout = 8000) {
  await expect.poll(
    async () => (await readPolygonSourceFor(page, osmId)).count,
    { timeout, message: `expected ${expectedCount} features for osm_id=${osmId}` }
  ).toBe(expectedCount);
}

test.describe('Hub polygon dedup — cross-backend osm_id', () => {
  test('smoke: polygon tier loads without page errors when both backends share an osm_id', async ({ page }) => {
    // Attach the error listener BEFORE navigation so bootstrap-time errors
    // (parsePolygonFeatures, applyDedup, OL plumbing) are captured.
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const { instanceA, instanceB } = makeFixtures();
    await injectHubConfig(page, polygonOnlyOverrides());
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    await expect(page.locator('.instance-slot .pill'))
      .toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });
    await waitForPolygonCount(page, SHARED_OSM_ID, 1);
    expect(errors, `unexpected page errors: ${errors.join(', ')}`).toEqual([]);
  });

  test('fan-out: get_playgrounds_bbox is issued to both backends despite shared osm_id', async ({ page }) => {
    const { instanceA, instanceB } = makeFixtures();
    const polygonCalls = { a: 0, b: 0 };
    page.on('request', req => {
      const u = req.url();
      if (!u.includes('/rpc/get_playgrounds_bbox')) return;
      if (u.includes('/api-a/')) polygonCalls.a += 1;
      if (u.includes('/api-b/')) polygonCalls.b += 1;
    });

    await injectHubConfig(page, polygonOnlyOverrides());
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    await expect(page.locator('.instance-slot .pill'))
      .toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });
    await expect.poll(() => polygonCalls.a, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => polygonCalls.b, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  });

  test('winner by timestamp: polygon source contains exactly one feature, owned by the fresher backend', async ({ page }) => {
    const { instanceA, instanceB } = makeFixtures({
      lastImportAtA: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      lastImportAtB: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),      // 1 hour ago
    });

    await injectHubConfig(page, polygonOnlyOverrides());
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    await expect(page.locator('.instance-slot .pill'))
      .toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });
    await waitForPolygonCount(page, SHARED_OSM_ID, 1);

    const state = await readPolygonSourceFor(page, SHARED_OSM_ID);
    expect(state.available).toBe(true);
    expect(state.count).toBe(1);
    // B is fresher (1 hour vs 2 days) → B wins.
    expect(state.backendUrls).toEqual(['/api-b']);
    expect(state.lastImportAts[0]).toBe(instanceB.meta.last_import_at);
  });

  test('winner by URL alphabetical when timestamps are identical', async ({ page }) => {
    // Both backends report the same instant in different TZ formats — the
    // spec scenario "Same instant in different ISO TZ formats counts as a
    // tie" requires URL-alphabetical to break the tie. /api-a < /api-b.
    const { instanceA, instanceB } = makeFixtures({
      lastImportAtA: '2026-04-25T12:00:00Z',
      lastImportAtB: '2026-04-25T14:00:00+02:00', // same instant
    });

    await injectHubConfig(page, polygonOnlyOverrides());
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    await waitForPolygonCount(page, SHARED_OSM_ID, 1);
    const state = await readPolygonSourceFor(page, SHARED_OSM_ID);
    expect(state.backendUrls).toEqual(['/api-a']);
  });

  test('degraded mode: both null last_import_at → URL-alphabetical winner (/api-a)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const { instanceA, instanceB } = makeFixtures({ lastImportAtA: null, lastImportAtB: null });
    await injectHubConfig(page, polygonOnlyOverrides());
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    await waitForPolygonCount(page, SHARED_OSM_ID, 1);
    const state = await readPolygonSourceFor(page, SHARED_OSM_ID);
    expect(state.backendUrls).toEqual(['/api-a']); // /api-a < /api-b
    expect(state.lastImportAts).toEqual([null]);   // no inferred NaN sentinel
    expect(errors).toEqual([]);                    // no console errors during degraded path
  });

  test('legacy backend (no last_import_at field at all) defaults to null and falls back to URL-alpha', async ({ page }) => {
    // Backend A's get_meta omits the field entirely (pre-FHE shape).
    // Backend B is also legacy. Should still produce one feature with
    // /api-a (lower URL) winning.
    const { instanceA, instanceB } = makeFixtures();
    delete instanceA.meta.last_import_at;
    delete instanceB.meta.last_import_at;

    await injectHubConfig(page, polygonOnlyOverrides());
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    await waitForPolygonCount(page, SHARED_OSM_ID, 1);
    const state = await readPolygonSourceFor(page, SHARED_OSM_ID);
    expect(state.backendUrls).toEqual(['/api-a']);
  });

  test('refresh stability: re-poll with unchanged inputs keeps the same winner', async ({ page }) => {
    const { instanceA, instanceB } = makeFixtures({
      lastImportAtA: '2026-04-25T03:00:00Z',
      lastImportAtB: '2026-04-26T03:00:00Z', // B is fresher
    });
    await injectHubConfig(page, { ...polygonOnlyOverrides(), hubPollInterval: 1 });
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    await waitForPolygonCount(page, SHARED_OSM_ID, 1);
    const before = await readPolygonSourceFor(page, SHARED_OSM_ID);
    expect(before.backendUrls).toEqual(['/api-b']);

    // Wait long enough for the 1-s registry poll cadence to fire at least
    // twice (the orchestrator re-orchestrates on backends-store updates).
    await page.waitForTimeout(2500);

    const after = await readPolygonSourceFor(page, SHARED_OSM_ID);
    expect(after.count).toBe(1);
    expect(after.backendUrls).toEqual(['/api-b']); // B still wins on stable inputs
  });

  test('refresh transition: bumping a backend\'s last_import_at flips the winner', async ({ page }) => {
    // Initial state: A is fresher.
    const { instanceA, instanceB } = makeFixtures({
      lastImportAtA: '2026-04-26T03:00:00Z',
      lastImportAtB: '2026-04-25T03:00:00Z',
    });
    await injectHubConfig(page, { ...polygonOnlyOverrides(), hubPollInterval: 1 });
    await stubHubRegistry(page, { instanceA, instanceB });
    await page.goto('/');

    await waitForPolygonCount(page, SHARED_OSM_ID, 1);
    const before = await readPolygonSourceFor(page, SHARED_OSM_ID);
    expect(before.backendUrls).toEqual(['/api-a']);

    // Re-stub B's get_meta so B is now fresher than A. Existing routes
    // from stubHubRegistry are still active; page.route's most-recently-
    // registered handler wins, so this override takes precedence.
    await page.route('**/api-b/rpc/get_meta**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...instanceB.meta,
        last_import_at: '2026-04-27T03:00:00Z',
      }),
    }));

    await expect.poll(
      async () => (await readPolygonSourceFor(page, SHARED_OSM_ID)).backendUrls?.[0],
      { timeout: 10000, message: 'expected winner to flip to /api-b after B\'s last_import_at advances' }
    ).toBe('/api-b');
  });
});
