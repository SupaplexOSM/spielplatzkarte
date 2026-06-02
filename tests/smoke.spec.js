import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

test.describe('Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
  });

  test('map canvas is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('page title contains spieli', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/spieli/);
  });
});
