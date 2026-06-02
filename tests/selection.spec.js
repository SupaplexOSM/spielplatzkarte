import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';
import fixture from './fixtures/playground.json' assert { type: 'json' };

const OSM_ID = fixture.features[0].properties.osm_id;

// Navigate with the fixture playground pre-selected via URL hash and wait for
// the panel. Using hash restore avoids the need to click a specific canvas pixel.
async function loadWithSelection(page) {
  await injectApiConfig(page);
  await stubApiRoutes(page);
  await page.goto(`/#W${OSM_ID}`);
  await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
}

const TREE_ROW_FC = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[9.675, 50.551], [9.676, 50.552]] },
    properties: { osm_id: -1, feature_type: 'tree_row', length_m: 42 },
  }],
};

test.describe('Playground selection', () => {
  test('info panel opens when playground is pre-selected via URL hash', async ({ page }) => {
    await loadWithSelection(page);
    await expect(page.locator('aside.info-panel')).toBeVisible();
  });

  test('URL hash is set after selection', async ({ page }) => {
    await loadWithSelection(page);
    await expect(page).toHaveURL(new RegExp(`#W${OSM_ID}`));
  });

  test('ESC key hides the info panel', async ({ page }) => {
    await loadWithSelection(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('aside.info-panel')).toBeHidden();
  });

  test('ESC key clears the URL hash', async ({ page }) => {
    await loadWithSelection(page);
    await page.keyboard.press('Escape');
    const url = new URL(page.url());
    expect(url.hash).toBe('');
  });

  test('slug-prefixed hash still selects in standalone mode', async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await page.goto(`/#irrelevant-slug/W${OSM_ID}`);
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Shade hint (tree_row)', () => {
  test('panel shows row length when get_trees returns a tree_row feature', async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    // Override the default empty get_trees stub (LIFO — this wins).
    await page.route('**/rpc/get_trees**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TREE_ROW_FC) })
    );
    await page.goto(`/#W${OSM_ID}`);
    await expect(page.locator('aside.info-panel')).toBeVisible({ timeout: 8000 });

    // The shade hint row is keyed by the "Reihen"/"rows" label substring.
    const shadeRow = page.locator('.fact-item').filter({
      has: page.locator('.info-label', { hasText: /Reihen|rows/i }),
    });
    await expect(shadeRow).toBeVisible({ timeout: 5000 });
    // Row count in parentheses after label.
    await expect(shadeRow.locator('.info-label')).toContainText('(1)');
    // Length in metres in the value cell.
    await expect(shadeRow.locator('.fact-value')).toContainText('42 m');
  });
});
