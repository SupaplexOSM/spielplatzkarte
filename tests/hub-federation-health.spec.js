// Federation health exposition tests — #194
//
// Covers the three observable UI paths introduced by the real
// federationHealth.js implementation:
//
//   1. Drawer shows data-age label when federation-status.json carries
//      a healthy backend with data_age_seconds.
//   2. Drawer shows "last reachable" info when a backend is down but has
//      a previous last_success timestamp.
//   3. Stale-observation banner appears when generated_at is older than
//      2 × poll_interval_seconds.
//
// The fourth scenario — filterHealthy() skipping a down backend — is a
// network-level assertion: when federation-status.json marks a backend as
// up:false, the hub orchestrator must issue zero per-tier RPC calls to it.
// That test is left as a TODO (see note at the bottom of this file).

import { test, expect } from '@playwright/test';
import {
  injectHubConfig,
  stubHubRegistry,
  stubFederationStatus,
  makePlayground,
} from './helpers.js';

const instanceA = {
  slug: 'slug-a',
  url: '/api-a',
  name: 'Instanz A',
  playgrounds: {
    type: 'FeatureCollection',
    features: [makePlayground({ osmId: 111, name: 'Playground A', lon: 9.675, lat: 50.551 })],
  },
  meta: {
    name: 'Region A',
    bbox: [9.6, 50.5, 9.7, 50.6],
    playground_count: 1,
    complete: 1, partial: 0, missing: 0,
  },
};

const instanceB = {
  slug: 'slug-b',
  url: '/api-b',
  name: 'Instanz B',
  playgrounds: {
    type: 'FeatureCollection',
    features: [makePlayground({ osmId: 222, name: 'Playground B', lon: 8.680, lat: 50.110 })],
  },
  meta: {
    name: 'Region B',
    bbox: [8.6, 50.0, 8.7, 50.2],
    playground_count: 1,
    complete: 0, partial: 1, missing: 0,
  },
};

/** Open the instance drawer by clicking the pill. Waits for the pill to appear first. */
async function openDrawer(page) {
  const pill = page.locator('.instance-slot .pill');
  await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });
  await pill.click();
  const drawer = page.locator('.drawer[role="dialog"]');
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe('Hub federation health drawer', () => {
  test('shows data-age label for a healthy backend with known import age', async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });

    // 2 days old in seconds
    const dataAgeSec = 2 * 24 * 60 * 60;
    await stubFederationStatus(page, {
      backends: {
        'slug-a': {
          url: '/api-a',
          up: true,
          latency_seconds: 0.04,
          last_success: new Date().toISOString(),
          last_import_at: new Date(Date.now() - dataAgeSec * 1000).toISOString(),
          data_age_seconds: dataAgeSec,
        },
      },
    });

    await page.goto('/');
    const drawer = await openDrawer(page);

    // The freshness line should mention "2 Tage" / "2 days" (German or English locale)
    await expect(drawer).toContainText(/2\s*(Tage|days)/, { timeout: 5000 });
  });

  test('shows last-reachable info for a backend marked as down', async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });

    // 5 minutes ago
    const lastSuccess = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await stubFederationStatus(page, {
      backends: {
        'slug-b': {
          url: '/api-b',
          up: false,
          latency_seconds: 0,
          last_success: lastSuccess,
          last_import_at: null,
          data_age_seconds: null,
        },
      },
    });

    // Abort the get_meta network call for B — fetchMeta only enters the error
    // path when fetch() itself throws (network failure), not on HTTP error codes.
    await page.route('**/api-b/rpc/get_meta**', route => route.abort('failed'));

    await page.goto('/');
    const drawer = await openDrawer(page);

    // The "last reachable N min ago" text should appear for the down backend
    await expect(drawer).toContainText(/5\s*min/, { timeout: 5000 });
  });

  test('shows stale-observation banner when generated_at is old', async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });

    // 10 minutes old — well beyond 2 × 60 s threshold
    const staleTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await stubFederationStatus(page, {
      generatedAt: staleTs,
      backends: {
        'slug-a': { url: '/api-a', up: true, latency_seconds: 0.02,
          last_success: staleTs, last_import_at: null, data_age_seconds: null },
      },
    });

    await page.goto('/');
    const drawer = await openDrawer(page);

    // Banner text matches the i18n key hub.observationStale
    await expect(drawer.locator('.drawer__stale-banner')).toBeVisible({ timeout: 5000 });
  });

  // Regression for #323: when registry.json omits `slug`, poll-federation.sh
  // falls back to a URL-sanitized key so the federation-status keys differ
  // from any client-side slug. The patch loop must match by `entry.url`,
  // not by the registry slug, otherwise the drawer never receives the
  // freshness fields and silently shows only the playground count.
  test('matches federation-status entries by url even when keys differ from registry slugs', async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });

    const dataAgeSec = 2 * 24 * 60 * 60;
    await stubFederationStatus(page, {
      backends: {
        // Server's URL-sanitized fallback key, intentionally different from
        // `instanceA.slug`. Client must look up by `entry.url`.
        'https___api_a_url_sanitized': {
          url: instanceA.url,
          up: true,
          latency_seconds: 0.04,
          last_success: new Date().toISOString(),
          last_import_at: new Date(Date.now() - dataAgeSec * 1000).toISOString(),
          data_age_seconds: dataAgeSec,
        },
      },
    });

    await page.goto('/');
    const drawer = await openDrawer(page);

    await expect(drawer).toContainText(/2\s*(Tage|days)/, { timeout: 5000 });
  });

  // #544: completeness breakdown (colored dots + progress bar) should appear
  // in the drawer for backends whose get_meta carries complete/partial/missing.
  test('shows completeness breakdown for a backend with completeness data', async ({ page }) => {
    const instanceWithCompleteness = {
      ...instanceA,
      meta: {
        ...instanceA.meta,
        playground_count: 6,
        complete: 4,
        partial: 1,
        missing: 1,
      },
    };

    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA: instanceWithCompleteness, instanceB });
    await stubFederationStatus(page);

    await page.goto('/');
    const drawer = await openDrawer(page);

    // Wait for the drawer to receive completeness data from the get_meta stub
    await expect(drawer.locator('.instance-completeness').first()).toBeVisible({ timeout: 5000 });
    await expect(drawer.locator('.completeness-bar').first()).toBeVisible({ timeout: 5000 });

    // Verify each count is rendered (instanceWithCompleteness has 4/1/1)
    const completeness = drawer.locator('.instance-completeness').first();
    await expect(completeness).toContainText('4');
    await expect(completeness).toContainText('1');
  });

  // #545: completeness fields arriving via federation-status.json should also
  // patch the backend and render in the drawer.
  test('shows completeness breakdown sourced from federation-status.json', async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });

    await stubFederationStatus(page, {
      backends: {
        'slug-a': {
          url: instanceA.url,
          up: true,
          latency_seconds: 0.02,
          last_success: new Date().toISOString(),
          last_import_at: null,
          data_age_seconds: null,
          playground_count: 3,
          complete: 2,
          partial: 1,
          missing: 0,
        },
      },
    });

    await page.goto('/');
    const drawer = await openDrawer(page);

    await expect(drawer.locator('.instance-completeness').first()).toBeVisible({ timeout: 5000 });
    await expect(drawer.locator('.completeness-bar').first()).toBeVisible({ timeout: 5000 });
  });
});

// TODO: filterHealthy skip-down-backend test
//
// Scenario: federation-status.json marks slug-b as `up: false`. The hub
// orchestrator's filterHealthy() call should skip slug-b entirely on
// cluster/polygon tier fan-out — meaning zero /api-b/rpc/get_playground_*
// requests are issued after the health poll resolves.
//
// Why this is not yet implemented here:
//   The current federationHealth.js poll fires asynchronously after page
//   load. In tests there is no synchronisation point between "health poll
//   resolved" and "next orchestrator moveend". A reliable test needs either:
//   (a) a way to signal from federationHealth.js that the first poll is done
//       (e.g. a store or a DOM marker), or
//   (b) the test to trigger a second moveend after the poll settles and then
//       assert no new /api-b requests were issued.
//
//   Once that synchronisation mechanism exists, the test body would look like:
//
//   const bCalls = [];
//   page.on('request', req => { if (req.url().includes('/api-b/rpc/get_playground')) bCalls.push(req.url()); });
//   await injectHubConfig(page, { mapZoom: 10 });
//   await stubHubRegistry(page, adjacent);
//   await stubFederationStatus(page, { backends: { 'slug-b': { up: false, ... } } });
//   await page.goto('/');
//   // ... wait for health poll to apply ...
//   // pan map to trigger moveend ...
//   await expect.poll(() => bCalls).toEqual([]);
