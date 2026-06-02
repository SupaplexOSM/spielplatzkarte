import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

test.describe('FilterPanel', () => {
  test.beforeEach(async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('filter button is visible on the map', async ({ page }) => {
    await expect(page.locator('.filter-container button')).toBeVisible();
  });

  test('clicking filter button opens the dropdown', async ({ page }) => {
    await expect(page.locator('.filter-dropdown')).not.toBeVisible();
    await page.locator('.filter-container button').click();
    await expect(page.locator('.filter-dropdown')).toBeVisible();
  });

  test('clicking filter button again closes the dropdown', async ({ page }) => {
    const btn = page.locator('.filter-container button');
    await btn.click();
    await expect(page.locator('.filter-dropdown')).toBeVisible();
    await btn.click();
    await expect(page.locator('.filter-dropdown')).not.toBeVisible();
  });

  test('no badge shown before any filter is active', async ({ page }) => {
    await expect(page.locator('.filter-container .badge')).not.toBeVisible();
  });

  test('toggling a filter shows badge with count 1', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await page.locator('.filter-list .filter-item input[type="checkbox"]').first().click();
    await expect(page.locator('.filter-container .badge')).toBeVisible();
    await expect(page.locator('.filter-container .badge')).toHaveText('1');
  });

  test('toggling two filters shows badge with count 2', async ({ page }) => {
    await page.locator('.filter-container button').click();
    const checkboxes = page.locator('.filter-list .filter-item input[type="checkbox"]');
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await expect(page.locator('.filter-container .badge')).toHaveText('2');
  });

  test('clear-all button appears only when a filter is active', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await expect(page.locator('.clear-btn')).not.toBeVisible();
    await page.locator('.filter-list .filter-item input[type="checkbox"]').first().click();
    await expect(page.locator('.clear-btn')).toBeVisible();
  });

  test('clear-all removes all active filters and hides the badge', async ({ page }) => {
    await page.locator('.filter-container button').click();
    const checkboxes = page.locator('.filter-list .filter-item input[type="checkbox"]');
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await page.locator('.clear-btn').click();
    await expect(page.locator('.filter-container .badge')).not.toBeVisible();
    await expect(page.locator('.clear-btn')).not.toBeVisible();
  });

  test('untoggling a filter decrements the badge count', async ({ page }) => {
    await page.locator('.filter-container button').click();
    const checkboxes = page.locator('.filter-list .filter-item input[type="checkbox"]');
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await expect(page.locator('.filter-container .badge')).toHaveText('2');
    await checkboxes.nth(0).click();
    await expect(page.locator('.filter-container .badge')).toHaveText('1');
  });

  test('clicking outside the dropdown closes it', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await expect(page.locator('.filter-dropdown')).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(page.locator('.filter-dropdown')).not.toBeVisible();
  });

  test('layers section contains the standalone pitches toggle', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await expect(page.locator('.layer-section')).toBeVisible();
    const pitchToggle = page.locator('.layer-section input[type="checkbox"]');
    await expect(pitchToggle).toBeVisible();
    await expect(pitchToggle).not.toBeChecked();
  });

  test('completeness section is visible with three checked toggles', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await expect(page.locator('.completeness-section')).toBeVisible();
    const checkboxes = page.locator('.completeness-section input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }
  });

  test('no badge shown when all completeness states are on (default)', async ({ page }) => {
    await expect(page.locator('.filter-container .badge')).not.toBeVisible();
  });

  test('unchecking a completeness state shows badge and marks row hidden', async ({ page }) => {
    await page.locator('.filter-container button').click();
    const first = page.locator('.completeness-section input[type="checkbox"]').first();
    await first.click();
    await expect(page.locator('.filter-container .badge')).toBeVisible();
    await expect(page.locator('.filter-container .badge')).toHaveText('1');
    await expect(
      page.locator('.completeness-section .filter-item').first()
    ).toHaveClass(/completeness-hidden/);
  });

  test('clear-all restores all completeness states to checked', async ({ page }) => {
    await page.locator('.filter-container button').click();
    await page.locator('.completeness-section input[type="checkbox"]').first().click();
    await page.locator('.clear-btn').click();
    const checkboxes = page.locator('.completeness-section input[type="checkbox"]');
    for (let i = 0; i < 3; i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }
    await expect(page.locator('.filter-container .badge')).not.toBeVisible();
  });
});
