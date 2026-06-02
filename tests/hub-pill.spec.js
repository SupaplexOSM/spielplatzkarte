import { test, expect } from '@playwright/test';
import { injectHubConfig, stubHubRegistry, stubFederationStatus, makePlayground } from './helpers.js';

const instanceA = {
  slug: 'slug-a',
  url: '/api-a',
  name: 'Instanz A',
  playgrounds: {
    type: 'FeatureCollection',
    features: [makePlayground({ osmId: 111, name: 'Playground A', lon: 9.675, lat: 50.551 })],
  },
  meta: { name: 'Region A', version: '0.2.1', bbox: [9.6, 50.5, 9.7, 50.6] },
};

const instanceB = {
  slug: 'slug-b',
  url: '/api-b',
  name: 'Instanz B',
  playgrounds: {
    type: 'FeatureCollection',
    features: [
      makePlayground({ osmId: 222, name: 'Playground B1', lon: 8.680, lat: 50.110 }),
      makePlayground({ osmId: 333, name: 'Playground B2', lon: 8.685, lat: 50.115 }),
    ],
  },
  meta: { name: 'Region B', version: '0.2.1', bbox: [8.6, 50.0, 8.7, 50.2] },
};

test.describe('Hub instance pill + drawer', () => {
  test.beforeEach(async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });
  });

  test('pill shows aggregated region + playground counts after load', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });
    await expect(pill).toContainText(/3\s+(Spielplätze|playgrounds)/);
  });

  test('clicking pill expands drawer with per-backend rows', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();

    const drawer = page.locator('.drawer[role="dialog"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.instance-name')).toHaveCount(2);
    await expect(drawer).toContainText('Instanz A');
    await expect(drawer).toContainText('Instanz B');
  });

  test('ESC collapses drawer', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();
    await expect(page.locator('.drawer[role="dialog"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.drawer[role="dialog"]')).toHaveCount(0);
  });

  test('outside click collapses drawer', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();
    await expect(page.locator('.drawer[role="dialog"]')).toBeVisible();

    // Click on the map canvas, well clear of the pill/drawer.
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await expect(page.locator('.drawer[role="dialog"]')).toHaveCount(0);
  });

  test('drawer shows version badge when meta includes version', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();

    const badges = page.locator('.drawer[role="dialog"] .instance-badge');
    await expect(badges).toHaveCount(2);
    await expect(badges.first()).toContainText('0.2.1');
  });

  test('drawer shows "updating" badge when federation-status marks backend as importing', async ({ page }) => {
    await stubFederationStatus(page, {
      backends: {
        'slug-a': { url: '/api-a', up: true, importing: true },
        'slug-b': { url: '/api-b', up: true, importing: false },
      },
    });

    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();

    const drawer = page.locator('.drawer[role="dialog"]');
    await expect(drawer).toBeVisible();

    // Instanz A is importing — should show the updating badge
    const itemA = drawer.locator('.instance-item').filter({ hasText: 'Instanz A' });
    await expect(itemA.locator('.instance-badge--importing')).toBeVisible();

    // Instanz B is not importing — should show version badge, not updating badge
    const itemB = drawer.locator('.instance-item').filter({ hasText: 'Instanz B' });
    await expect(itemB.locator('.instance-badge--importing')).toHaveCount(0);
    await expect(itemB.locator('.instance-badge')).toContainText('0.2.1');
  });

  test('drawer shows no "updating" badge when importing is false or absent', async ({ page }) => {
    await stubFederationStatus(page, {
      backends: {
        'slug-a': { url: '/api-a', up: true, importing: false },
        'slug-b': { url: '/api-b', up: true },
      },
    });

    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();

    const drawer = page.locator('.drawer[role="dialog"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.instance-badge--importing')).toHaveCount(0);
  });

  test('updating badge clears when next federation-status poll reports importing: false', async ({ page }) => {
    // 1-second poll interval so we don't wait long for the second fetch.
    await injectHubConfig(page, { hubPollInterval: 1 });

    let callCount = 0;
    await page.route('**/federation-status.json', route => {
      callCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generated_at: new Date().toISOString(),
          poll_interval_seconds: 1,
          backends: {
            'slug-a': { url: '/api-a', up: true, importing: callCount === 1 },
            'slug-b': { url: '/api-b', up: true, importing: false },
          },
        }),
      });
    });

    await page.goto('/');
    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();
    const drawer = page.locator('.drawer[role="dialog"]');
    await expect(drawer).toBeVisible();

    const itemA = drawer.locator('.instance-item').filter({ hasText: 'Instanz A' });
    // First poll: importing=true → badge visible
    await expect(itemA.locator('.instance-badge--importing')).toBeVisible();
    // Second poll (≤ 1 s): importing=false → badge gone
    await expect(itemA.locator('.instance-badge--importing')).toHaveCount(0, { timeout: 5000 });
  });
});

test.describe('Hub bbox overlap warning', () => {
  // instanceA has a large polygon; instanceB's polygon is fully contained within it.
  // booleanContains(outer, inner) → true → warning must appear for both.
  const outerPoly = { type: 'Polygon', coordinates: [[[9.0,50.0],[10.0,50.0],[10.0,51.0],[9.0,51.0],[9.0,50.0]]] };
  const innerPoly = { type: 'Polygon', coordinates: [[[9.2,50.2],[9.8,50.2],[9.8,50.8],[9.2,50.8],[9.2,50.2]]] };
  const outer = {
    slug: 'slug-outer', url: '/api-outer', name: 'Outer Region',
    playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 10, name: 'P outer', lon: 9.5, lat: 50.5 })] },
    meta: { name: 'Outer Region', bbox: [9.0, 50.0, 10.0, 51.0], playground_count: 1, complete: 1, partial: 0, missing: 0, region_geom: outerPoly },
  };
  const inner = {
    slug: 'slug-inner', url: '/api-inner', name: 'Inner Region',
    playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 20, name: 'P inner', lon: 9.5, lat: 50.5 })] },
    meta: { name: 'Inner Region', bbox: [9.2, 50.2, 9.8, 50.8], playground_count: 1, complete: 0, partial: 1, missing: 0, region_geom: innerPoly },
  };

  test('overlap warning shown in drawer when one backend polygon contains the other', async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA: outer, instanceB: inner });
    await page.goto('/');

    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();
    const drawer = page.locator('.drawer[role="dialog"]');
    await expect(drawer).toBeVisible();

    // Inner polygon is fully contained within outer → each must carry a warning row.
    await expect(drawer.locator('.instance-overlap')).toHaveCount(2);
    // The outer backend's warning names the inner backend, and vice-versa.
    // Use .instance-name to avoid matching the other backend's warning text.
    const outerItem = drawer.locator('.instance-item').filter({
      has: page.locator('.instance-name', { hasText: 'Outer Region' }),
    });
    await expect(outerItem.locator('.instance-overlap')).toContainText('Inner Region');
    const innerItem = drawer.locator('.instance-item').filter({
      has: page.locator('.instance-name', { hasText: 'Inner Region' }),
    });
    await expect(innerItem.locator('.instance-overlap')).toContainText('Outer Region');
  });

  test('no overlap warning when backend bboxes are non-overlapping', async ({ page }) => {
    const west = {
      slug: 'slug-west', url: '/api-west', name: 'West Region',
      playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 30, name: 'P west', lon: 8.5, lat: 50.5 })] },
      meta: { name: 'West Region', bbox: [8.0, 50.0, 9.0, 51.0], playground_count: 1, complete: 1, partial: 0, missing: 0 },
    };
    const east = {
      slug: 'slug-east', url: '/api-east', name: 'East Region',
      playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 40, name: 'P east', lon: 10.5, lat: 50.5 })] },
      meta: { name: 'East Region', bbox: [10.0, 50.0, 11.0, 51.0], playground_count: 1, complete: 0, partial: 1, missing: 0 },
    };

    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA: west, instanceB: east });
    await page.goto('/');

    const pill = page.locator('.instance-slot .pill');
    await expect(pill).toContainText(/2\s+(Regionen|regions)/, { timeout: 8000 });

    await pill.click();
    await expect(page.locator('.drawer[role="dialog"]')).toBeVisible();
    await expect(page.locator('.instance-overlap')).toHaveCount(0);
  });
});
