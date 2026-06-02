// Zoom-tier playground data orchestrator.
//
// Attaches to an OL Map. On every (debounced) moveend, picks the active tier
// from the view's zoom, publishes it to activeTierStore, and fetches the
// matching RPC:
//
//   zoom ≤ clusterMaxZoom → get_playground_clusters (server-bucketed)
//   zoom >  clusterMaxZoom → get_playgrounds_bbox   (existing polygon style)
//
// Cancels any in-flight request from a superseded moveend via AbortController.
// On tier-RPC 404 (backend older than this change) logs a one-time warning
// and falls back to the legacy region-scoped get_playgrounds.

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { transform } from 'ol/proj.js';

import {
  fetchPlaygroundClusters,
  fetchPlaygroundsBbox,
  fetchPlaygrounds,
} from './api.js';
import { clusterMaxZoom } from './config.js';
import { activeTierStore } from '../stores/tier.js';
import { debounce } from './utils.js';

const geojsonFormat = new GeoJSON();

export function tierForZoom(zoom) {
  return zoom <= clusterMaxZoom ? 'cluster' : 'polygon';
}

/**
 * Wire the zoom-tier orchestrator to a map.
 *
 * @param {Object} opts
 * @param {import('ol/Map.js').default} opts.map
 * @param {string} opts.baseUrl  PostgREST base URL (may be '' for dev without backend)
 * @param {import('ol/source/Vector.js').default} opts.clusterSource
 * @param {import('ol/source/Vector.js').default} opts.polygonSource
 * @param {() => object|null} [opts.getFilters]  Returns current cluster-relevant filter snapshot.
 *   Called on every orchestrate() run — including debounced moveend — so filters stay in sync
 *   without the caller having to pass them explicitly on each moveend event.
 * @returns {{ detach: () => void, rerun: () => void }}
 */
export function attachTieredOrchestrator({
  map,
  baseUrl,
  clusterSource,
  polygonSource,
  getFilters = () => null,
}) {
  let abort = null;
  let useLegacy = false; // sticky: once a tier RPC 404s, route to legacy for the rest of the session

  async function orchestrate() {
    const view = map.getView();
    const zoom = view.getZoom();
    const tier = useLegacy ? 'polygon' : tierForZoom(zoom);
    activeTierStore.set(tier);

    if (abort) abort.abort();
    abort = new AbortController();
    const signal = abort.signal;

    const extent3857 = view.calculateExtent(map.getSize());
    const filters = getFilters();

    try {
      if (useLegacy) {
        const geojson = await fetchPlaygrounds(baseUrl);
        if (signal.aborted) return;
        fillPolygonSource(polygonSource, geojson);
      } else if (tier === 'cluster') {
        const buckets = await fetchPlaygroundClusters(Math.floor(zoom), extent3857, baseUrl, signal, filters);
        if (signal.aborted) return;
        fillClusterSource(clusterSource, buckets);
      } else {
        const geojson = await fetchPlaygroundsBbox(extent3857, baseUrl, signal);
        if (signal.aborted) return;
        fillPolygonSource(polygonSource, geojson);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (isNotFound(err) && !useLegacy) {
        useLegacy = true;
        console.warn(`[tier] ${tier} RPC returned 404 — backend does not support tiered delivery; switching to legacy get_playgrounds for the rest of the session`);
        try {
          const geojson = await fetchPlaygrounds(baseUrl);
          if (signal.aborted) return;
          fillPolygonSource(polygonSource, geojson);
          activeTierStore.set('polygon');
        } catch (fallbackErr) {
          console.error('[tier] legacy fallback failed:', fallbackErr);
        }
        return;
      }
      console.warn(`[tier] ${tier} fetch failed:`, err);
    }
  }

  const debounced = debounce(orchestrate, 300);
  map.on('moveend', debounced);
  // Initial load runs immediately, not debounced.
  orchestrate();

  return {
    detach() {
      debounced.cancel?.();
      if (abort) abort.abort();
      map.un('moveend', debounced);
    },
    rerun() {
      orchestrate();
    },
  };
}

function isNotFound(err) {
  return typeof err?.message === 'string' && /\b404\b/.test(err.message);
}

function fillClusterSource(source, buckets) {
  source.clear();
  const features = buckets.map(b => {
    const f = new Feature({
      geometry: new Point(transform([b.lon, b.lat], 'EPSG:4326', 'EPSG:3857')),
    });
    f.setProperties({
      _tier:      'cluster',
      count:      b.count,
      complete:   b.complete,
      partial:    b.partial,
      missing:    b.missing,
      restricted: b.restricted ?? 0,
    });
    return f;
  });
  source.addFeatures(features);
}

function fillPolygonSource(source, geojson) {
  const features = geojsonFormat.readFeatures(geojson, {
    dataProjection:    'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });
  source.clear();
  source.addFeatures(features);
}
