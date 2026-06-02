// Tiered playground delivery — orchestrator picks the right RPC per zoom,
// and the legacy fetcher emits a one-time deprecation warning when the
// tier RPC 404s on an older backend.
//
// `injectApiConfig` defaults to `clusterMaxZoom: 0` (polygon-only) so the
// other suites stay isolated from cluster-tier orchestration. These tests
// override that to exercise the cluster path.

import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

test.describe('Tiered delivery', () => {
  test('cluster tier RPC fires when zoom ≤ clusterMaxZoom', async ({ page }) => {
    await injectApiConfig(page, { clusterMaxZoom: 13, mapZoom: 12 });
    await stubApiRoutes(page);

    const clusterReq = page.waitForRequest(/\/rpc\/get_playground_clusters/);
    await page.goto('/');
    const req = await clusterReq;
    const url = new URL(req.url());
    // OL's view.getZoom() can resolve to a fractional value depending on
    // when fit-to-extent has settled; the orchestrator floors it. Just
    // assert that the cluster RPC fires with the bbox + z params, not a
    // specific z value (§4 design tracks the cell-size table separately).
    const z = url.searchParams.get('z');
    expect(z).not.toBeNull();
    expect(Number.isFinite(Number(z))).toBe(true);
    expect(url.searchParams.get('min_lon')).not.toBeNull();
    expect(url.searchParams.get('max_lat')).not.toBeNull();
  });

  test('polygon tier RPC fires when zoom > clusterMaxZoom', async ({ page }) => {
    await injectApiConfig(page, { clusterMaxZoom: 10, mapZoom: 14 });
    await stubApiRoutes(page);

    const bboxReq = page.waitForRequest(/\/rpc\/get_playgrounds_bbox/);
    await page.goto('/');
    await bboxReq;
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('legacy fetchPlaygrounds emits a one-time deprecation warning', async ({ page }) => {
    await injectApiConfig(page, { clusterMaxZoom: 13, mapZoom: 12 });
    // Apply the default 200 stubs first; the cluster-tier 404 override
    // below is registered last so Playwright (which processes the
    // most-recently-registered handler first) routes the cluster URL to
    // the 404 path, forcing the orchestrator into legacy fallback.
    await stubApiRoutes(page);
    await page.route('**/rpc/get_playground_clusters**', route =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );

    const deprecationLogs = [];
    page.on('console', msg => {
      if (msg.type() === 'warning' && msg.text().includes('fetchPlaygrounds is deprecated')) {
        deprecationLogs.push(msg.text());
      }
    });

    await page.goto('/');
    // Wait deterministically for the warning to surface — the orchestrator
    // debounces moveend by 300 ms and the legacy fallback adds one fetch
    // round-trip, but on a slow runner that can drift past a fixed
    // sleep. Polling with a generous deadline avoids the flake.
    await expect.poll(
      () => deprecationLogs.length,
      { timeout: 8000, message: 'expected the deprecation warning to fire after the cluster RPC 404s' },
    ).toBeGreaterThanOrEqual(1);
    expect(deprecationLogs.length).toBe(1);
  });
});
