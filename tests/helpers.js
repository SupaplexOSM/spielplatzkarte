// Shared test utilities for the spieli Svelte app.

import fixture from './fixtures/playground.json' assert { type: 'json' };

/**
 * Intercept the runtime config.js so the app uses PostgREST mode (non-empty
 * apiBaseUrl) instead of the Overpass fallback. Call before page.goto().
 *
 * Defaults to `clusterMaxZoom: 0` so the polygon tier is active at every
 * test zoom — this isolates legacy-path tests from the cluster orchestrator.
 * Pass `{ clusterMaxZoom: 13 }` (or any other override) when a test needs
 * the cluster tier behaviour.
 */
export async function injectApiConfig(page, overrides = {}) {
  await page.route('**/config.js', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.APP_CONFIG = ${JSON.stringify({
        appMode: 'standalone',
        osmRelationId: 62700,
        mapZoom: 12,
        mapMinZoom: 10,
        poiRadiusM: 5000,
        apiBaseUrl: '/api',
        parentOrigin: '',
        registryUrl: './registry.json',
        hubPollInterval: 300,
        clusterMaxZoom: 0,
        ...overrides,
      })};`,
    })
  );
}

/**
 * Stub the PostgREST endpoints used by the standalone app. Both the legacy
 * `get_playgrounds` and the new tiered RPCs are stubbed so tests run
 * cleanly regardless of which tier the orchestrator activates.
 *
 * `clusters` defaults to one bucket covering every fixture playground; tests
 * exercising cluster-tier rendering can pass their own array.
 *
 * Call before page.goto().
 */
export async function stubApiRoutes(page, playgrounds = fixture, clusters = null) {
  const fc = playgrounds.features ?? [];
  const totalCount = fc.length;
  const defaultClusters = clusters ?? (totalCount === 0
    ? []
    : [{
        lon: fc[0].geometry.coordinates[0][0][0],
        lat: fc[0].geometry.coordinates[0][0][1],
        count: totalCount,
        complete: 0,
        partial: 0,
        missing: totalCount,
        restricted: 0,
      }]);

  await page.route('**/rpc/get_playgrounds**', route => {
    // Both legacy `get_playgrounds(relation_id)` and bbox-scoped
    // `get_playgrounds_bbox(...)` return the same FeatureCollection shape;
    // the same fixture works for both — Playwright's URL glob matches both.
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playgrounds) });
  });
  await page.route('**/rpc/get_playground_clusters**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(defaultClusters) })
  );
  await page.route('**/rpc/get_playground_centroids**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/rpc/get_playground?**', route => {
    // Single-playground hydration. URL has `?osm_id=<id>`. Match the
    // requested id against the fixture; fall back to the first feature.
    const url = new URL(route.request().url());
    const wantedId = Number(url.searchParams.get('osm_id'));
    const match = fc.find(f => f.properties?.osm_id === wantedId) ?? fc[0] ?? null;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(match) });
  });
  await page.route('**/rpc/get_equipment**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) })
  );
  await page.route('**/rpc/get_trees**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) })
  );
  await page.route('**/rpc/get_pois**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
}

/**
 * Inject a runtime config in hub mode. Uses relative backend URLs so tests
 * can dispatch requests by path prefix.
 */
export async function injectHubConfig(page, overrides = {}) {
  await page.route('**/config.js', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.APP_CONFIG = ${JSON.stringify({
        appMode: 'hub',
        osmRelationId: 0,
        mapZoom: 8,
        mapMinZoom: 6,
        poiRadiusM: 5000,
        apiBaseUrl: '',
        parentOrigin: '',
        registryUrl: '/registry.json',
        hubPollInterval: 300,
        ...overrides,
      })};`,
    })
  );
}

/**
 * Stub a two-backend hub registry. Each backend carries its own playgrounds
 * fixture and metadata so tests can assert slug-scoped selection.
 *
 * `instanceA.url` / `instanceB.url` must be distinct path prefixes used by the
 * app to fetch each backend's RPCs (e.g. `/api-a`, `/api-b`).
 */
export async function stubHubRegistry(page, { instanceA, instanceB }) {
  await page.route('**/registry.json', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        instances: [
          { slug: instanceA.slug, url: instanceA.url, name: instanceA.name },
          { slug: instanceB.slug, url: instanceB.url, name: instanceB.name },
        ],
      }),
    })
  );

  function dispatch(route, perBackend) {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith(instanceA.url)) return route.fulfill(perBackend(instanceA));
    if (path.startsWith(instanceB.url)) return route.fulfill(perBackend(instanceB));
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  }

  await page.route('**/rpc/get_playgrounds**', route =>
    dispatch(route, (b) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(b.playgrounds),
    }))
  );
  // Hub orchestrator (P2 §3) calls bbox-scoped + cluster RPCs per backend
  // on every moveend. Stub them with the same per-backend playgrounds
  // fixture so existing hub tests don't time out on unstubbed routes.
  await page.route('**/rpc/get_playgrounds_bbox**', route =>
    dispatch(route, (b) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(b.playgrounds),
    }))
  );
  await page.route('**/rpc/get_playground_clusters**', route =>
    dispatch(route, (_b) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]), // no cluster buckets — keeps cluster tier rendering empty for hub tests that exercise polygon tier
    }))
  );
  await page.route('**/rpc/get_playground?**', route => {
    // Single-playground hydration: match the requested osm_id against the
    // backend's fixture. Returns `null` on no match — production behaviour;
    // a `features[0]` fallback would mask broadcast deeplink correctness
    // (the slug-less broadcast counts each backend's response as a
    // potential match).
    const url = new URL(route.request().url());
    const wantedId = Number(url.searchParams.get('osm_id'));
    return dispatch(route, (b) => {
      const features = b.playgrounds?.features ?? [];
      const match = features.find(f => f.properties?.osm_id === wantedId) ?? null;
      return {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(match),
      };
    });
  });
  await page.route('**/rpc/get_meta**', route =>
    dispatch(route, (b) => {
      // Merge defaults under the supplied meta so existing tests that pass
      // a partial meta (just `name`/`version`/`bbox`) still render the P1
      // completeness fields + playground_count the InstancePanel pill and
      // macro view need. Without this merge, hub-pill / hub-smoke /
      // hub-deeplink would all see playground_count=0 and the pill
      // would render "0 Spielplätze" instead of the asserted total.
      const features = b.playgrounds?.features ?? [];
      const defaults = {
        name: b.name ?? b.slug,
        bbox: [13.4, 52.5, 13.5, 52.6],
        playground_count: features.length,
        complete: 0,
        partial: 0,
        missing: features.length,
      };
      const meta = { ...defaults, ...(b.meta ?? {}) };
      return {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(meta),
      };
    })
  );
  await page.route('**/rpc/get_equipment**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) })
  );
  await page.route('**/rpc/get_trees**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) })
  );
  await page.route('**/rpc/get_pois**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/rpc/get_nearest_playgrounds**', route =>
    dispatch(route, (b) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(b.nearest ?? []),
    }))
  );

  // Default stub for the hub's federation-status.json poll. Without this
  // the browser fires a real network request that 404s in the test runner.
  // Fail-open: empty backends → all backends stay healthUp=null → treated as
  // healthy. Tests that need specific health data should call
  // stubFederationStatus() after stubHubRegistry() to override this.
  await stubFederationStatus(page);
}

/**
 * Stub /federation-status.json with the given payload. If `backends` is
 * omitted the stub returns an empty-backends response so existing tests that
 * don't care about health still get a 200 (fail-open: all backends treated
 * as healthy). Pass a full payload to test drawer freshness / stale banner /
 * filterHealthy behaviour.
 *
 * `generatedAt` defaults to "just now"; pass a past ISO string to trigger the
 * stale-observation banner (> 2 × poll_interval_seconds = 120 s old).
 *
 * Call before page.goto().
 */
export async function stubFederationStatus(page, { backends = {}, generatedAt = null, pollIntervalSeconds = 60 } = {}) {
  const ts = generatedAt ?? new Date().toISOString();
  await page.route('**/federation-status.json', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generated_at: ts,
        poll_interval_seconds: pollIntervalSeconds,
        backends,
      }),
    })
  );
}

/** Builds a minimal valid playground GeoJSON fixture. */
export function makePlayground({ osmId, name, lon = 13.404, lat = 52.520 }) {
  const d = 0.001;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [lon, lat],
        [lon + d, lat],
        [lon + d, lat + d],
        [lon, lat + d],
        [lon, lat],
      ]],
    },
    properties: {
      osm_id: osmId,
      osm_type: 'W',
      name,
      surface: 'sand',
      access: 'yes',
      area: 450,
    },
  };
}
