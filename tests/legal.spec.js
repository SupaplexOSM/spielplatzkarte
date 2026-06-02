import { test, expect } from '@playwright/test';
import {
  injectApiConfig,
  injectHubConfig,
  stubApiRoutes,
  stubHubRegistry,
  stubFederationStatus,
  makePlayground,
} from './helpers.js';

// ── Standalone mode ───────────────────────────────────────────────────────────

test.describe('Standalone — legal links in About modal', () => {
  test('About button always present', async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
    await page.goto('/');
    await expect(page.locator('button[aria-label="About"]')).toBeVisible({ timeout: 5000 });
  });

  test('imprint link shown in About modal when impressumUrl is set', async ({ page }) => {
    await injectApiConfig(page, { impressumUrl: 'https://example.com/impressum', privacyUrl: null });
    await stubApiRoutes(page);
    await page.goto('/');

    await page.locator('button[aria-label="About"]').click();

    const modal = page.locator('[role="dialog"]').filter({ hasText: 'About' });
    await expect(modal).toBeVisible();
    await expect(modal.locator('a', { hasText: 'Imprint' })).toBeVisible();
    // privacyUrl is null → Privacy policy link must not appear
    await expect(modal.locator('a', { hasText: 'Privacy policy' })).toHaveCount(0);
  });

  test('privacy link shown in About modal when privacyUrl is set', async ({ page }) => {
    await injectApiConfig(page, { impressumUrl: null, privacyUrl: 'https://example.com/datenschutz' });
    await stubApiRoutes(page);
    await page.goto('/');

    await page.locator('button[aria-label="About"]').click();

    const modal = page.locator('[role="dialog"]').filter({ hasText: 'About' });
    await expect(modal).toBeVisible();
    await expect(modal.locator('a', { hasText: 'Privacy policy' })).toBeVisible();
    await expect(modal.locator('a', { hasText: 'Imprint' })).toHaveCount(0);
  });

  test('both links visible when both URLs set', async ({ page }) => {
    await injectApiConfig(page, {
      impressumUrl: 'https://example.com/impressum',
      privacyUrl:   'https://example.com/datenschutz',
    });
    await stubApiRoutes(page);
    await page.goto('/');

    await page.locator('button[aria-label="About"]').click();
    const modal = page.locator('[role="dialog"]').filter({ hasText: 'About' });
    await expect(modal.locator('a', { hasText: 'Imprint' })).toHaveCount(1);
    await expect(modal.locator('a', { hasText: 'Privacy policy' })).toHaveCount(1);
  });

  test('Impressum link has correct href and target=_blank', async ({ page }) => {
    await injectApiConfig(page, { impressumUrl: 'https://example.com/impressum' });
    await stubApiRoutes(page);
    await page.goto('/');

    await page.locator('button[aria-label="About"]').click();
    const link = page.locator('[role="dialog"] a', { hasText: 'Imprint' });
    await expect(link).toHaveAttribute('href', 'https://example.com/impressum');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('modal closes on Escape', async ({ page }) => {
    await injectApiConfig(page, { impressumUrl: 'https://example.com/impressum' });
    await stubApiRoutes(page);
    await page.goto('/');

    await page.locator('button[aria-label="About"]').click();
    await expect(page.locator('[role="dialog"]').filter({ hasText: 'About' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]').filter({ hasText: 'About' })).toHaveCount(0);
  });
});

// ── Hub mode — drawer legal icons ─────────────────────────────────────────────

const instanceA = {
  slug: 'slug-a',
  url: '/api-a',
  name: 'Instanz A',
  playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 1, lon: 9.675, lat: 50.551 })] },
  meta: { name: 'Region A', version: '0.4.0', bbox: [9.6, 50.5, 9.7, 50.6] },
};

const instanceB = {
  slug: 'slug-b',
  url: '/api-b',
  name: 'Instanz B',
  playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 2, lon: 8.680, lat: 50.110 })] },
  meta: { name: 'Region B', version: '0.4.0', bbox: [8.6, 50.0, 8.7, 50.2] },
};

async function openDrawer(page) {
  const pill = page.locator('.instance-slot .pill');
  await expect(pill).toContainText(/\d+/, { timeout: 8000 });
  await pill.click();
  const drawer = page.locator('.drawer[role="dialog"]');
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe('Hub — drawer legal icons', () => {
  test('§ icon always present; click shows "keine Angaben" when impressum_url null', async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });
    await stubFederationStatus(page, {
      backends: {
        'slug-a': { url: '/api-a', up: true, impressum_url: null, privacy_url: null },
      },
    });
    await page.goto('/');
    const drawer = await openDrawer(page);
    const btn = drawer.locator('button[title="Imprint"]').first();
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator('[role="dialog"]').filter({ hasText: 'No legal information available' })).toBeVisible({ timeout: 3000 });
  });

  test('§ icon visible when impressum_url set; click opens new tab', async ({ page, context }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });
    await stubFederationStatus(page, {
      backends: {
        'slug-a': {
          url: '/api-a',
          up: true,
          impressum_url: 'https://example.com/impressum',
          privacy_url: null,
          last_success: new Date().toISOString(),
        },
      },
    });
    await page.goto('/');
    const drawer = await openDrawer(page);

    const impressumBtn = drawer.locator('button[title="Imprint"]').first();
    await expect(impressumBtn).toBeVisible();

    // Clicking should open a new tab (window.open)
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      impressumBtn.click(),
    ]);
    expect(newPage.url()).toBe('https://example.com/impressum');
    await newPage.close();
  });

  test('🔒 icon visible when privacy_url set', async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });
    await stubFederationStatus(page, {
      backends: {
        'slug-a': {
          url: '/api-a',
          up: true,
          impressum_url: null,
          privacy_url: 'https://example.com/datenschutz',
          last_success: new Date().toISOString(),
        },
      },
    });
    await page.goto('/');
    const drawer = await openDrawer(page);
    await expect(drawer.locator('button[title="Privacy policy"]').first()).toBeVisible();
    await expect(drawer.locator('button[title="Imprint"]').first()).toBeVisible();
  });

  test('icons always present; click shows "keine Angaben" when both URLs null and has_legal false', async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });
    await stubFederationStatus(page, {
      backends: {
        'slug-a': {
          url: '/api-a',
          up: true,
          impressum_url: null,
          privacy_url: null,
          has_legal: false,
          last_success: new Date().toISOString(),
        },
      },
    });
    await page.goto('/');
    const drawer = await openDrawer(page);
    await expect(drawer.locator('button[title="Imprint"]').first()).toBeVisible();
    await expect(drawer.locator('button[title="Privacy policy"]').first()).toBeVisible();
    await drawer.locator('button[title="Imprint"]').first().click();
    await expect(page.locator('[role="dialog"]').filter({ hasText: 'No legal information available' })).toBeVisible({ timeout: 3000 });
  });

  test('§ and 🔒 icons visible when has_legal true with null URLs (data-node)', async ({ page }) => {
    await injectHubConfig(page);
    await stubHubRegistry(page, { instanceA, instanceB });
    await stubFederationStatus(page, {
      backends: {
        'slug-a': {
          url: '/api-a',
          up: true,
          impressum_url: null,
          privacy_url: null,
          has_legal: true,
          last_success: new Date().toISOString(),
        },
      },
    });

    await page.route('**/api-a/rpc/get_legal**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: '<html><body><h1>Impressum Test</h1></body></html>' }),
      })
    );

    await page.goto('/');
    const drawer = await openDrawer(page);

    // Both icons must appear even though URLs are null (content lives in get_legal RPC)
    await expect(drawer.locator('button[title="Imprint"]').first()).toBeVisible();
    await expect(drawer.locator('button[title="Privacy policy"]').first()).toBeVisible();

    // Click § → openLegal() fetches get_legal → LegalContentModal opens
    await drawer.locator('button[title="Imprint"]').first().click();
    await expect(page.locator('iframe')).toBeVisible({ timeout: 5000 });
  });
});
