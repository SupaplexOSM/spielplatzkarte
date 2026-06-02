// Hub-mode tiered orchestrator (P2 §3).
//
// Mirrors the standalone tieredOrchestrator but fans every per-tier fetch
// out across the registry's backends, filtered by viewport (bboxRouter) and
// federation health (federationHealth — currently stubbed).
//
// Three tiers:
//   zoom ≤ macroMaxZoom              → 'macro'   — no fetches; the macro
//                                                  view component renders
//                                                  one ring per backend
//                                                  from the cached
//                                                  backendsStore.
//   macroMaxZoom < zoom ≤ clusterMaxZoom → 'cluster' — fanOut over
//                                                  fetchPlaygroundClusters
//   zoom > clusterMaxZoom            → 'polygon' — fanOut over
//                                                  fetchPlaygroundsBbox
//
// Per-fan-out AbortController is replaced (and the previous one aborted)
// on every moveend, so superseded fan-outs cancel their in-flight per-
// backend requests via the fanOut's plumbing.
//
// Cluster and polygon sources are progressively repainted as each backend
// settles (via fanOut's onResult callback). Cross-backend re-clustering
// (Supercluster) is §4 — for §3 the cluster source just concatenates
// every backend's buckets, which can show visible seams at borders. §4
// fixes that.

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { transform, transformExtent } from 'ol/proj.js';
import Supercluster from 'supercluster';

import {
  fetchPlaygroundClusters,
  fetchPlaygroundsBbox,
  fetchPlaygrounds,
} from '../lib/api.js';
import { clusterMaxZoom, macroMaxZoom } from '../lib/config.js';
import { activeTierStore } from '../stores/tier.js';
import { hubLoadingStore } from '../stores/hubLoading.js';
import { selectBackends } from './bboxRouter.js';
import { filterHealthy } from './federationHealth.js';
import { applyDedup } from './osmIdDedup.js';
import { fanOut } from './fanOut.js';
import { debounce } from '../lib/utils.js';

const geojsonFormat = new GeoJSON();

export function tierForZoom(zoom) {
  if (zoom <= macroMaxZoom)   return 'macro';
  if (zoom <= clusterMaxZoom) return 'cluster';
  return 'polygon';
}

/**
 * Wire the hub orchestrator to a map + the registry's backends store.
 *
 * @param {Object} opts
 * @param {import('ol/Map.js').default} opts.map
 * @param {import('svelte/store').Readable<Array>} opts.backendsStore
 * @param {import('ol/source/Vector.js').default} opts.clusterSource
 * @param {import('ol/source/Vector.js').default} opts.polygonSource
 * @param {() => object|null} [opts.getFilters]  Returns current cluster-relevant filter snapshot.
 * @returns {{ detach: () => void, rerun: () => void }}
 */
export function attachHubOrchestrator({
  map,
  backendsStore,
  clusterSource,
  polygonSource,
  getFilters = () => null,
}) {
  let abort = null;
  let allBackends = [];
  // Sticky per-backend legacy fallback. When a backend's tier RPC 404s once,
  // every subsequent fan-out for that backend uses fetchPlaygrounds (region-
  // scoped, P1 deprecated) instead, with a one-time warning. Keeps the hub
  // serviceable when one peer is on a pre-tier release.
  const backendUseLegacy = new Set();
  const backendLegacyWarned = new Set();
  // Per-backend "malformed cluster bucket" warning de-dup. A backend returning
  // a bucket with non-finite lon/lat would otherwise place a feature at
  // [NaN, NaN] (projects to ~0,0) or trip Supercluster's KDBush; we drop
  // those buckets and warn at most once per backend per session.
  const backendMalformedBucketWarned = new Set();
  // The debounced orchestrator is referenced from the backends-subscribe
  // callback below as well as the moveend handler below. Declare early so
  // both references resolve out of TDZ regardless of how Svelte schedules
  // the synchronous subscribe firings — see the §5 review for the original
  // crash this avoids.
  const debounced = debounce(orchestrate, 300);

  // Skip the very first subscribe-firing — the synchronous initial value is
  // the registry's empty bootstrap, and the first real load triggers the
  // immediate `orchestrate()` call at the bottom of this function. After
  // that, subsequent emissions (5-min poll, bbox refresh, backend
  // add/remove) need to re-render the active tier against the new set.
  let initialBackendsSet = false;
  const detachStore = backendsStore.subscribe(b => {
    allBackends = b;
    if (!initialBackendsSet) {
      initialBackendsSet = true;
      return;
    }
    // Backends changed (registry poll or registry mutation) — re-orchestrate
    // on the same debounce as moveend so a flurry of poll-driven updates
    // collapses to one fan-out.
    debounced();
  });

  function clearSourcesAndProgress() {
    polygonSource.clear();
    clusterSource.clear();
    hubLoadingStore.set({ loaded: 0, total: 0, settling: false });
  }

  async function orchestrate() {
    const view = map.getView();
    const zoom = view.getZoom();
    // OL `getZoom()` returns `undefined` when the view's resolution doesn't
    // map to an integer zoom (boot, mid-animation, fractional resolution).
    // `tierForZoom(undefined)` would fall through every `<=` to `'polygon'`,
    // dispatching a continent-wide bbox fan-out at boot. Skip until the
    // next moveend brings a finite zoom.
    if (!Number.isFinite(zoom)) return;
    const tier = tierForZoom(zoom);
    activeTierStore.set(tier);

    if (abort) abort.abort();
    abort = new AbortController();
    const signal = abort.signal;

    if (tier === 'macro') {
      // The MacroView component (P2 §5) renders directly from
      // backendsStore. Clear feature sources so old cluster / polygon
      // features from a previous higher zoom don't bleed through.
      clearSourcesAndProgress();
      return;
    }

    const extent3857 = view.calculateExtent(map.getSize());
    const viewportBbox = transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
    const filters = getFilters();
    const selected = filterHealthy(selectBackends(viewportBbox, allBackends));

    if (selected.length === 0) {
      clearSourcesAndProgress();
      return;
    }

    hubLoadingStore.set({ loaded: 0, total: selected.length, settling: true });

    // Per-backend lookup map; the polygon onResult needs the backend's slug
    // so it can stamp `_backendSlug` on each feature. O(1) per arrival.
    const backendByUrl = new Map(selected.map(b => [b.url, b]));

    // First-arrival latch per source — clears stale features from the prior
    // tier on the *first* backend's response, then onResult adds features
    // incrementally. Avoids N source.clear()+addFeatures cycles per moveend.
    // Polygon tier still uses a first-arrival latch (it appends rather than
    // re-derives on every arrival). Cluster tier doesn't need one — every
    // arrival re-runs the Supercluster pipeline and clears+adds the full
    // re-rendered set, so a separate latch would be dead.
    let polygonFirstArrival = true;
    // Per-orchestrate-call dedup index: osm_id (string) → winning OL Feature.
    // Created fresh per orchestrate() call so winners from the previous
    // moveend don't influence the new fan-out — no explicit .clear() needed
    // on first arrival because the const above is already the empty Map.
    const polyByOsmId = new Map();

    if (tier === 'cluster') {
      const z = Math.floor(zoom);
      // §4.1 — cross-backend re-clustering via Supercluster. Each backend's
      // server-bucketed cells are fed in as weighted points; on each
      // arrival we load the accumulated set and re-emit the merged
      // clusters so a viewport spanning two backends shows a single seam-
      // less ring per cell instead of two overlapping rings at the border.
      const accumulated = [];
      const sc = new Supercluster({
        radius: 60,
        // Match the OL tile model (256 px); Supercluster's default extent
        // is 512 which would effectively double the clustering radius
        // relative to the server's cell-size table.
        extent: 256,
        maxZoom: clusterMaxZoom,
        map: (p) => ({
          count:      p.count,
          complete:   p.complete,
          partial:    p.partial,
          missing:    p.missing,
          restricted: p.restricted,
        }),
        reduce: (acc, p) => {
          acc.count      += p.count;
          acc.complete   += p.complete;
          acc.partial    += p.partial;
          acc.missing    += p.missing;
          acc.restricted += p.restricted;
        },
      });
      await fanOut({
        fetcher: (url, sig) => clusterFetcherFor(url)(z, extent3857, url, sig, filters),
        backends: selected,
        signal,
        onResult: (entry) => {
          if (signal.aborted) return;
          if (entry.ok && Array.isArray(entry.value)) {
            let droppedMalformed = 0;
            for (const b of entry.value) {
              // Drop buckets with non-finite coordinates rather than
              // pushing a `[NaN, NaN]` Point that projects to lon=0,lat=0
              // (Gulf of Guinea) or trips Supercluster's KDBush. Warn
              // at most once per backend per session.
              if (!Number.isFinite(b.lon) || !Number.isFinite(b.lat)) {
                droppedMalformed += 1;
                continue;
              }
              accumulated.push(bucketToSuperclusterPoint(b, entry.backendUrl));
            }
            if (droppedMalformed > 0 && !backendMalformedBucketWarned.has(entry.backendUrl)) {
              backendMalformedBucketWarned.add(entry.backendUrl);
              console.warn(`[hub-tier] backend ${entry.backendUrl} returned ${droppedMalformed} cluster bucket(s) with non-finite lon/lat — dropped`);
            }
            // Reload the index with the accumulated set and re-render.
            // Supercluster's `load` is O(N); for cluster-tier viewport
            // sizes this is well under a millisecond. The source-clear
            // here also covers the first-arrival "wipe stale features
            // from the prior tier" need, so no separate latch is needed
            // on this branch.
            sc.load(accumulated);
            const clusters = sc.getClusters(viewportBbox, z);
            clusterSource.clear();
            clusterSource.addFeatures(clusters.map(superclusterFeatureToOl));
          } else if (!entry.ok && isNotFound(entry.error)) {
            markBackendLegacy(entry.backendUrl);
          }
          hubLoadingStore.update(s => ({ ...s, loaded: s.loaded + 1 }));
        },
      });
      if (!signal.aborted) {
        hubLoadingStore.update(s => ({ ...s, settling: false }));
      }
    } else {
      // polygon tier
      await fanOut({
        fetcher: (url, sig) => polygonFetcherFor(url)(extent3857, url, sig),
        backends: selected,
        signal,
        onResult: (entry) => {
          if (signal.aborted) return;
          // Clear the source on the *first* arrival regardless of `ok` so
          // an all-error fan-out doesn't leave ghost polygons from the
          // previous viewport. The latch fires exactly once per
          // orchestrate() call; subsequent arrivals append.
          if (polygonFirstArrival) {
            polygonFirstArrival = false;
            polygonSource.clear();
            // polyByOsmId is already empty (declared `new Map()` per orchestrate()
            // call) — no .clear() needed.
          }
          if (entry.ok) {
            const backend = backendByUrl.get(entry.backendUrl);
            const features = parsePolygonFeatures(entry.value, entry.backendUrl, backend);
            const { toAdd, toRemove } = applyDedup(features, polyByOsmId);
            polygonSource.removeFeatures(toRemove);
            polygonSource.addFeatures(toAdd);
          } else if (isNotFound(entry.error)) {
            markBackendLegacy(entry.backendUrl);
          }
          hubLoadingStore.update(s => ({ ...s, loaded: s.loaded + 1 }));
        },
      });
      if (!signal.aborted) {
        hubLoadingStore.update(s => ({ ...s, settling: false }));
      }
    }
  }

  // Pick the per-backend cluster fetcher. If we've previously seen a 404
  // from this backend's tier RPC, return [] without dispatching any fetch
  // — the legacy `get_playgrounds(relation_id)` RPC doesn't bucket, and
  // downloading every polygon in the region just to discard them at the
  // cluster tier wastes bandwidth without any visible benefit. The user
  // sees a temporary hole over that backend until they zoom past
  // `clusterMaxZoom`, where the polygon tier will use the legacy fetch.
  function clusterFetcherFor(url) {
    if (backendUseLegacy.has(url)) {
      return async () => [];
    }
    return fetchPlaygroundClusters;
  }

  function polygonFetcherFor(url) {
    if (backendUseLegacy.has(url)) {
      return async (_extent, baseUrl, signal) => {
        return fetchPlaygrounds(baseUrl, signal);
      };
    }
    return fetchPlaygroundsBbox;
  }

  function markBackendLegacy(url) {
    backendUseLegacy.add(url);
    if (!backendLegacyWarned.has(url)) {
      backendLegacyWarned.add(url);
      console.warn(`[hub-tier] backend ${url} returned 404 on a tier RPC — falling back to legacy get_playgrounds for the rest of the session`);
    }
  }

  map.on('moveend', debounced);
  // Initial dispatch runs immediately (not debounced) so first paint
  // doesn't wait on a moveend.
  orchestrate();

  return {
    detach() {
      debounced.cancel?.();
      if (abort) abort.abort();
      map.un('moveend', debounced);
      detachStore();
    },
    rerun() {
      orchestrate();
    },
  };
}

// Matches the exact format thrown by api.js fetchers: `<rpc> failed: 404`.
// Anchored on the trailing `failed: 404` so a transient error whose message
// happens to mention "404" elsewhere (URL fragment, payload echo) cannot
// permanently degrade a backend to the legacy fallback for the rest of the
// session.
function isNotFound(err) {
  return typeof err?.message === 'string' && /failed: 404$/.test(err.message);
}

// Wrap a server cluster bucket in the GeoJSON shape Supercluster expects.
// All count fields are coerced to 0 if missing — Supercluster's `reduce`
// callback adds them in place, and a single `undefined` would propagate
// `NaN` through every downstream cluster's count fields silently.
// `_backendUrl` is preserved on the singleton case so a cluster of one can
// still route its cluster-click zoom to the right backend if needed.
function bucketToSuperclusterPoint(b, backendUrl) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
    properties: {
      count:       b.count      ?? 0,
      complete:    b.complete   ?? 0,
      partial:     b.partial    ?? 0,
      missing:     b.missing    ?? 0,
      restricted:  b.restricted ?? 0,
      _backendUrl: backendUrl,
    },
  };
}

// Convert a Supercluster output feature (cluster or singleton) into an
// OL Feature with the props the existing cluster-style renderer expects.
function superclusterFeatureToOl(c) {
  const [lon, lat] = c.geometry.coordinates;
  const f = new Feature({
    geometry: new Point(transform([lon, lat], 'EPSG:4326', 'EPSG:3857')),
  });
  if (c.properties.cluster) {
    // Multi-bucket merge — the reduce callback summed the per-bucket counts.
    // We don't expose `cluster_id` here: Supercluster's drill-down APIs
    // (`getClusterExpansionZoom`, `getLeaves`) need the index instance,
    // which is local to the orchestrate() call and GC'd when it returns.
    // Re-introduce only when a future click handler retains the index.
    f.setProperties({
      _tier:       'cluster',
      count:       c.properties.count,
      complete:    c.properties.complete,
      partial:     c.properties.partial,
      missing:     c.properties.missing,
      restricted:  c.properties.restricted,
    });
  } else {
    // Singleton — original bucket properties pass through.
    f.setProperties({
      _tier:       'cluster',
      _backendUrl: c.properties._backendUrl,
      count:       c.properties.count,
      complete:    c.properties.complete,
      partial:     c.properties.partial,
      missing:     c.properties.missing,
      restricted:  c.properties.restricted,
    });
  }
  return f;
}

function parsePolygonFeatures(geojson, backendUrl, backend) {
  // Legacy fetchPlaygrounds also returns a FeatureCollection — same
  // parsing path works for both bbox-scoped and legacy responses.
  if (!geojson || !geojson.features) return [];
  const features = geojsonFormat.readFeatures(geojson, {
    dataProjection:    'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });
  features.forEach(f => {
    f.set('_backendUrl', backendUrl);
    f.set('_lastImportAt', backend?.lastImportAt ?? null);
    if (backend?.slug) f.set('_backendSlug', backend.slug);
    if (backend?.name) f.set('_backendName', backend.name);
  });
  return features;
}
