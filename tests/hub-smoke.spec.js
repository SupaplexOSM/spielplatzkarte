import { test, expect } from '@playwright/test';
import { injectHubConfig, stubHubRegistry, makePlayground } from './helpers.js';

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
    features: [makePlayground({ osmId: 222, name: 'Playground B', lon: 8.680, lat: 50.110 })],
  },
  meta: { name: 'Region B', version: '0.2.1', bbox: [8.6, 50.0, 8.7, 50.2] },
};

test.describe('Hub smoke', () => {
  test.beforeEach(async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });
  });

  test('map canvas is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('search, filter, locate, zoom and contribution controls are present', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.search-area')).toBeVisible();
    await expect(page.locator('.controls-top-right')).toBeVisible();
    await expect(page.locator('.controls-bottom-right')).toBeVisible();

    // Filter + contribution buttons in the top-right cluster.
    await expect(page.locator('.controls-top-right .control-btn')).toHaveCount(2);

    // Zoom controls.
    await expect(page.locator('.zoom-btn.zoom-in')).toBeVisible();
    await expect(page.locator('.zoom-btn.zoom-out')).toBeVisible();
  });

  test('instance pill renders in the bottom-left slot', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.instance-slot .pill')).toBeVisible({ timeout: 8000 });
  });
});
