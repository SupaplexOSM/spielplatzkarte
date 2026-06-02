// Unit tests for `app/src/hub/osmIdDedup.js` — closes Task 2.1 of the
// `add-cross-backend-osm-id-dedup` spec.
//
// The module is pure (no DOM, no OL imports beyond the typed `set/get`
// interface), but the project's test runner is Playwright against the
// production build. Rather than introduce a separate Node unit harness,
// we boot the hub frontend (HubApp.svelte exposes `window.__spieli.osmIdDedup`)
// and exercise the module via `page.evaluate`. Mock features are plain
// objects with a matching `.get(key)` shape — `dedupWinner` and `applyDedup`
// only depend on that interface.
//
// The cases below match the spec's enumerated rows in Task 2.1.

import { test, expect } from '@playwright/test';
import { injectHubConfig, stubHubRegistry, makePlayground } from './helpers.js';

// Boot the hub once per test — page.evaluate calls in each test reach into
// the same `window.__spieli.osmIdDedup` namespace.
async function bootHub({ page }) {
  await injectHubConfig(page, { clusterMaxZoom: 0, macroMaxZoom: -1 });
  await stubHubRegistry(page, {
    instanceA: {
      slug: 'slug-a', url: '/api-a', name: 'A',
      playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 1, name: 'A' })] },
      meta: { name: 'A', bbox: [9.6, 50.5, 9.7, 50.6], playground_count: 1, complete: 0, partial: 1, missing: 0, last_import_at: null },
    },
    instanceB: {
      slug: 'slug-b', url: '/api-b', name: 'B',
      playgrounds: { type: 'FeatureCollection', features: [makePlayground({ osmId: 2, name: 'B' })] },
      meta: { name: 'B', bbox: [9.6, 50.5, 9.7, 50.6], playground_count: 1, complete: 0, partial: 1, missing: 0, last_import_at: null },
    },
  });
  await page.goto('/');
  // Wait until HubApp's onMount runs and the hooks are attached.
  await page.waitForFunction(() => window.__spieli?.osmIdDedup != null, { timeout: 8000 });
}

// Build a mock feature with a fixed property bag — matches OL Feature's
// `set/get` interface for the keys this module reads.
const MOCK_FEATURE = `(props) => ({ get: (k) => props[k], __mock: true })`;

test.describe('osmIdDedup unit — dedupWinner', () => {
  test.beforeEach(bootHub);

  test('both parseable, incoming newer → incoming', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const a = f({ _lastImportAt: '2026-04-25T03:00:00Z', _backendUrl: '/api-a' });
      const b = f({ _lastImportAt: '2026-04-26T03:00:00Z', _backendUrl: '/api-b' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === b ? 'b' : 'a';
    }, MOCK_FEATURE);
    expect(result).toBe('b');
  });

  test('both parseable, existing newer → existing', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const a = f({ _lastImportAt: '2026-04-26T03:00:00Z', _backendUrl: '/api-a' });
      const b = f({ _lastImportAt: '2026-04-25T03:00:00Z', _backendUrl: '/api-b' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === a ? 'a' : 'b';
    }, MOCK_FEATURE);
    expect(result).toBe('a');
  });

  test('same instant in different TZ formats → tie → URL alphabetical', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      // Same instant: 2026-04-25T12:00:00Z === 2026-04-25T14:00:00+02:00.
      const a = f({ _lastImportAt: '2026-04-25T12:00:00Z',     _backendUrl: '/api-a' });
      const b = f({ _lastImportAt: '2026-04-25T14:00:00+02:00', _backendUrl: '/api-b' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === a ? 'a' : 'b';
    }, MOCK_FEATURE);
    expect(result).toBe('a'); // /api-a < /api-b alphabetically
  });

  test('existing parseable + incoming null → existing', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const a = f({ _lastImportAt: '2026-04-25T03:00:00Z', _backendUrl: '/api-a' });
      const b = f({ _lastImportAt: null,                   _backendUrl: '/api-b' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === a ? 'a' : 'b';
    }, MOCK_FEATURE);
    expect(result).toBe('a');
  });

  test('existing parseable + incoming undefined → existing', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const a = f({ _lastImportAt: '2026-04-25T03:00:00Z', _backendUrl: '/api-a' });
      const b = f({ /* _lastImportAt absent */              _backendUrl: '/api-b' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === a ? 'a' : 'b';
    }, MOCK_FEATURE);
    expect(result).toBe('a');
  });

  test('existing parseable + incoming malformed (NaN-Date.parse) → existing', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const a = f({ _lastImportAt: '2026-04-25T03:00:00Z', _backendUrl: '/api-a' });
      const b = f({ _lastImportAt: 'banana',                _backendUrl: '/api-b' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === a ? 'a' : 'b';
    }, MOCK_FEATURE);
    expect(result).toBe('a');
  });

  // Note: per spec D2, `parseable(v) ≡ v != null && Number.isFinite(Date.parse(v))`.
  // V8's `Date.parse('2026')` returns a finite number (Jan 1 2026 UTC) so a
  // year-only string IS parseable per spec — not a reject case. Kept as a
  // comment so future readers don't accidentally re-add a regex shape gate.

  test('existing null + incoming parseable → incoming', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const a = f({ _lastImportAt: null,                   _backendUrl: '/api-a' });
      const b = f({ _lastImportAt: '2026-04-25T03:00:00Z', _backendUrl: '/api-b' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === a ? 'a' : 'b';
    }, MOCK_FEATURE);
    expect(result).toBe('b');
  });

  test('both null + lower-URL existing → existing', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const a = f({ _lastImportAt: null, _backendUrl: '/api-a' });
      const b = f({ _lastImportAt: null, _backendUrl: '/api-b' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === a ? 'a' : 'b';
    }, MOCK_FEATURE);
    expect(result).toBe('a');
  });

  test('both null + lower-URL incoming → incoming', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const a = f({ _lastImportAt: null, _backendUrl: '/api-z' });
      const b = f({ _lastImportAt: null, _backendUrl: '/api-a' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === a ? 'a' : 'b';
    }, MOCK_FEATURE);
    expect(result).toBe('b');
  });

  test('both null + identical _backendUrl → existing (first-write-wins on identity collision)', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const a = f({ _lastImportAt: null, _backendUrl: '/api-a' });
      const b = f({ _lastImportAt: null, _backendUrl: '/api-a' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === a ? 'a' : 'b';
    }, MOCK_FEATURE);
    expect(result).toBe('a');
  });

  test('one side missing _backendUrl → side with URL wins', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      // Both unparseable → falls into URL-alpha path. Spec: prefer the side
      // with a real URL over an unstamped feature.
      const a = f({ _lastImportAt: null /* _backendUrl absent */ });
      const b = f({ _lastImportAt: null, _backendUrl: '/api-b' });
      return window.__spieli.osmIdDedup.dedupWinner(a, b) === a ? 'a' : 'b';
    }, MOCK_FEATURE);
    expect(result).toBe('b');
  });

  test('symmetric: dedupWinner(a, b) and dedupWinner(b, a) both pick the same backend (not the same arg)', async ({ page }) => {
    // Tie case where existing-vs-incoming ordering shouldn't flip the outcome.
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const fA = () => f({ _lastImportAt: null, _backendUrl: '/api-a' });
      const fB = () => f({ _lastImportAt: null, _backendUrl: '/api-b' });
      const w1 = window.__spieli.osmIdDedup.dedupWinner(fA(), fB());
      const w2 = window.__spieli.osmIdDedup.dedupWinner(fB(), fA());
      // Both calls should pick the feature with /api-a (lower URL wins regardless of order).
      return [w1.get('_backendUrl'), w2.get('_backendUrl')];
    }, MOCK_FEATURE);
    expect(result).toEqual(['/api-a', '/api-a']);
  });
});

test.describe('osmIdDedup unit — applyDedup', () => {
  test.beforeEach(bootHub);

  test('absent osm_id passes through (not deduplicated)', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const map = new Map();
      const features = [
        f({ /* osm_id absent */ _backendUrl: '/api-a' }),
        f({ /* osm_id absent */ _backendUrl: '/api-b' }),
      ];
      const { toAdd, toRemove } = window.__spieli.osmIdDedup.applyDedup(features, map);
      return { toAdd: toAdd.length, toRemove: toRemove.length, mapSize: map.size };
    }, MOCK_FEATURE);
    // Both added (no osm_id → no dedup). Map untouched.
    expect(result).toEqual({ toAdd: 2, toRemove: 0, mapSize: 0 });
  });

  test('first arrival of a unique osm_id → toAdd populated, toRemove empty, map updated', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const map = new Map();
      const features = [f({ osm_id: 42, _backendUrl: '/api-a', _lastImportAt: null })];
      const { toAdd, toRemove } = window.__spieli.osmIdDedup.applyDedup(features, map);
      return {
        toAdd: toAdd.length,
        toRemove: toRemove.length,
        mapHas42: map.has('42'),
      };
    }, MOCK_FEATURE);
    expect(result).toEqual({ toAdd: 1, toRemove: 0, mapHas42: true });
  });

  test('second arrival with newer timestamp evicts the existing winner', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const map = new Map();
      const older = f({ osm_id: 42, _backendUrl: '/api-a', _lastImportAt: '2026-04-25T03:00:00Z' });
      const newer = f({ osm_id: 42, _backendUrl: '/api-b', _lastImportAt: '2026-04-26T03:00:00Z' });
      // Pretend `older` already won a previous arrival.
      map.set('42', older);
      const { toAdd, toRemove } = window.__spieli.osmIdDedup.applyDedup([newer], map);
      return {
        toAdd: toAdd[0]?.get('_backendUrl'),
        toRemove: toRemove[0]?.get('_backendUrl'),
        winner: map.get('42')?.get('_backendUrl'),
      };
    }, MOCK_FEATURE);
    expect(result).toEqual({ toAdd: '/api-b', toRemove: '/api-a', winner: '/api-b' });
  });

  test('second arrival with older timestamp is silently dropped (existing wins)', async ({ page }) => {
    const result = await page.evaluate((mockSrc) => {
      const f = new Function('return ' + mockSrc)();
      const map = new Map();
      const newer = f({ osm_id: 42, _backendUrl: '/api-a', _lastImportAt: '2026-04-26T03:00:00Z' });
      const older = f({ osm_id: 42, _backendUrl: '/api-b', _lastImportAt: '2026-04-25T03:00:00Z' });
      map.set('42', newer);
      const { toAdd, toRemove } = window.__spieli.osmIdDedup.applyDedup([older], map);
      return {
        toAddLen: toAdd.length,
        toRemoveLen: toRemove.length,
        winner: map.get('42')?.get('_backendUrl'),
      };
    }, MOCK_FEATURE);
    expect(result).toEqual({ toAddLen: 0, toRemoveLen: 0, winner: '/api-a' });
  });
});
