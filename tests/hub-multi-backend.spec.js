// P2 §9.1 + §9.3 — multi-backend orchestration tests for the hub mode
// federated playground clustering. Verifies macro-tier behaviour (one ring
// per backend, no per-playground fetches) and cluster-tier fan-out
// behaviour (both backends queried in parallel, results merged).

import { test, expect } from '@playwright/test';
import { injectHubConfig, stubHubRegistry, makePlayground } from './helpers.js';

// Two backend fixture sets:
//   - `continental` — wide bboxes whose union forces HubApp.tryFit to land in
//     the macro tier (zoom ≤ macroMaxZoom). Used by §9.1.
//   - `adjacent` — tight neighbouring bboxes that fit at cluster-tier zoom.
//     Used by §9.3 — both backends must intersect a single viewport so the
//     bbox router selects them in the same fan-out.
const continental = {
  // Wide enough that the bbox-union fits at zoom ≤ 5 (macroMaxZoom). The
  // earlier 40°-wide union landed at zoom ~5.4 — fractional zoom above
  // macroMaxZoom evaluates as cluster tier. Going to ~120° width forces
  // the fit firmly into macro tier.
  instanceA: {
    slug: 'slug-a', url: '/api-a', name: 'Region A',
    playgrounds: { type: 'FeatureCollection',
      features: [makePlayground({ osmId: 111, name: 'A1', lon: -50, lat: 45 })] },
    meta: { name: 'Region A', bbox: [-60, 20, -10, 60],
      playground_count: 100, complete: 30, partial: 50, missing: 20 },
  },
  instanceB: {
    slug: 'slug-b', url: '/api-b', name: 'Region B',
    playgrounds: { type: 'FeatureCollection',
      features: [makePlayground({ osmId: 222, name: 'B1', lon: 50, lat: 45 })] },
    meta: { name: 'Region B', bbox: [10, 20, 60, 60],
      playground_count: 200, complete: 80, partial: 100, missing: 20 },
  },
};

const adjacent = {
  instanceA: {
    slug: 'slug-a', url: '/api-a', name: 'Region A',
    playgrounds: { type: 'FeatureCollection',
      features: [makePlayground({ osmId: 111, name: 'A1', lon: 9.675, lat: 50.551 })] },
    meta: { name: 'Region A', bbox: [9.6, 50.5, 9.7, 50.6],
      playground_count: 100, complete: 30, partial: 50, missing: 20 },
  },
  instanceB: {
    slug: 'slug-b', url: '/api-b', name: 'Region B',
    playgrounds: { type: 'FeatureCollection',
      features: [makePlayground({ osmId: 222, name: 'B1', lon: 9.685, lat: 50.560 })] },
    meta: { name: 'Region B', bbox: [9.65, 50.55, 9.75, 50.65],
      playground_count: 200, complete: 80, partial: 100, missing: 20 },
  },
};

test.describe('Hub multi-backend orchestration (P2 §9)', () => {
  test('§9.1 macro tier issues no per-playground requests; aggregates counts in the pill', async ({ page }) => {
    // Track every RPC the page issues — at macro tier (zoom ≤ macroMaxZoom)
    // the spec requires the hub to render entirely from the cached
    // `get_meta` responses with zero per-playground fetches.
    const rpcCalls = [];
    page.on('request', req => {
      const u = req.url();
      if (u.includes('/rpc/')) rpcCalls.push(u);
    });

    // mapMinZoom: 0 so the view can reach macro tier (default mapMinZoom is 6).
    await injectHubConfig(page, { mapZoom: 4, mapMinZoom: 0 });
    await stubHubRegistry(page, continental);
    await page.goto('/');

    // Pill renders the aggregated counts from get_meta — implicit signal
    // that the macro tier loaded correctly.
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });
    await expect(pill).toContainText(/300\s+(Spielplätze|playgrounds)/); // 100 + 200

    // Give the orchestrator a beat to confirm it really doesn't fan out
    // — even after the pill settles, a delayed cluster/bbox call would
    // be a regression.
    await page.waitForTimeout(500);

    // get_meta fired once per backend (registry discovery).
    const metaCalls = rpcCalls.filter(u => u.includes('/rpc/get_meta'));
    expect(metaCalls).toHaveLength(2);
    expect(metaCalls.some(u => u.includes('/api-a/'))).toBe(true);
    expect(metaCalls.some(u => u.includes('/api-b/'))).toBe(true);

    // Per-playground RPCs (cluster, bbox, region-scoped, single-feature)
    // are forbidden at macro tier per the spec scenario "Macro view
    // renders one ring per backend".
    const perPlaygroundCalls = rpcCalls.filter(u =>
      u.includes('/rpc/get_playground_clusters') ||
      u.includes('/rpc/get_playgrounds_bbox')   ||
      u.includes('/rpc/get_playgrounds?')       ||
      u.includes('/rpc/get_playground?'),
    );
    expect(perPlaygroundCalls).toEqual([]);
  });

  test('§9.3 cluster tier fans out to every intersecting backend in parallel', async ({ page }) => {
    // Per-backend cluster buckets near the shared border of A and B's
    // bboxes. The hub's bbox router should select both backends; the
    // Supercluster reducer then merges them into seam-free rings whose
    // counts sum across A + B.
    const overlapCluster = (extra) => [{
      lon: 9.68,
      lat: 50.555,
      count: 50,
      complete: 20,
      partial: 25,
      missing: 5,
      restricted: 0,
      ...extra,
    }];

    // Track cluster-tier requests per backend so we can assert both
    // backends were called in the same orchestrate() pass.
    const clusterReqsByBackend = { '/api-a': 0, '/api-b': 0 };
    page.on('request', req => {
      const u = req.url();
      if (!u.includes('/rpc/get_playground_clusters')) return;
      if (u.includes('/api-a/')) clusterReqsByBackend['/api-a'] += 1;
      if (u.includes('/api-b/')) clusterReqsByBackend['/api-b'] += 1;
    });

    // Boot at zoom 10 — strictly above macroMaxZoom (5), strictly below
    // clusterMaxZoom (13), so the orchestrator lands in cluster tier.
    await injectHubConfig(page, { mapZoom: 10 });
    await stubHubRegistry(page, adjacent);

    // Override the default empty cluster stub with backend-specific
    // bucket payloads. Route handlers added via `page.route` are LIFO
    // (most-recent wins), so this overrides the empty stub from
    // stubHubRegistry without affecting other RPC routes.
    await page.route('**/rpc/get_playground_clusters**', route => {
      const u = new URL(route.request().url());
      const path = u.pathname;
      const backend = path.startsWith('/api-a') ? 'A'
                    : path.startsWith('/api-b') ? 'B'
                    : null;
      if (!backend) return route.fulfill({ status: 404, body: '[]' });
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overlapCluster({ count: backend === 'A' ? 50 : 30, complete: backend === 'A' ? 20 : 10 })),
      });
    });

    await page.goto('/');

    // Wait for the cluster-tier moveend to settle: the pill becomes the
    // aggregated-count form once every backend's get_meta has resolved,
    // and both backends should be queried for cluster buckets.
    await expect(page.locator('.instance-slot .pill')).toContainText(/300/, { timeout: 8000 });

    // Allow one debounce window (300 ms) + slack for the orchestrator's
    // initial dispatch to issue per-backend cluster fetches.
    await expect.poll(() => clusterReqsByBackend['/api-a'], { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => clusterReqsByBackend['/api-b'], { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  });
});
