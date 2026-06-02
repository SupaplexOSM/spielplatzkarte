import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

const OSM_ID = fixture.features[0].properties.osm_id;

test.describe('URL hash restore', () => {
  test('loading with a hash opens the info panel for that playground', async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await page.goto(`/#W${OSM_ID}`);
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
  });
});
