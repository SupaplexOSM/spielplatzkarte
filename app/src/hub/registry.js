// Hub registry — loads the registry JSON, fetches per-backend metadata
// (`get_meta`) on a 5-min poll, exposes the resulting `backends` readable
// store, and provides a multi-backend nearest-playground fetcher.
//
// Note (P2 §3): the eager `get_playgrounds(relation_id)` fetch that this
// module used to do at startup has moved to `hubOrchestrator.js`, which
// fans out the per-tier RPCs (clusters / bbox-polygons) on every moveend.
// The registry now only handles registry discovery + metadata + nearest.

import { readable, writable, derived } from 'svelte/store';
import { registryUrl, hubPollInterval } from '../lib/config.js';
import { fetchMeta } from '../lib/api.js';
import { isValidSlug } from '../lib/deeplink.js';
import { startFederationHealthPoll, stopFederationHealthPoll } from './federationHealth.js';
import { parseNominalCentroid } from './centroid.js';
import booleanContains from '@turf/boolean-contains';

// Per-backend timeout for multi-backend nearest fan-out. A slow or unreachable
// backend contributes zero results but never stalls the user interaction.
const NEAREST_TIMEOUT_MS = 3000;
const NEAREST_DEFAULT_LIMIT = 10;
// Discard results from backends that are farther away than this — prevents
// a distant backend from polluting the list with its own "nearby" playgrounds.
const NEAREST_MAX_DISTANCE_M = 25_000;

/**
 * Backend status shape:
 * {
 *   url: string,
 *   name: string,
 *   slug: string | null,
 *   loading: boolean,
 *   error: string | null,
 *   version: string | null,
 *   region: string | null,
 *   bbox: [minLon, minLat, maxLon, maxLat] | null,
 *   playgroundCount: number,                          // from get_meta.playground_count (P1)
 *   completeness: { complete, partial, missing } | null, // from get_meta (P1)
 * }
 *
 * `completeness` is `null` until `get_meta` returns, AND stays `null` if the
 * backend is on a pre-P1 release that doesn't ship the three completeness
 * fields. Downstream macro-view rendering uses this sentinel to distinguish
 * "stale / pre-P1 backend" from "actual zero-playground region".
 *
 * Each `loadBackend` call replaces the entry in the `backends` array with a
 * new object identity (immutable patch via `{ ...prev, ...patch }`) so
 * memoised consumers (e.g. macro-view rings) can use reference equality.
 */

/**
 * Creates a registry that loads backend status into a Svelte readable store
 * and exposes derived stores + a multi-backend nearest fetcher. The hub
 * orchestrator (P2 §3) consumes the `backends` store to drive bbox routing
 * and per-tier fan-out; the registry no longer touches any vector source.
 *
 * @returns {{
 *   backends: import('svelte/store').Readable<Array>,
 *   registryError: import('svelte/store').Readable<string|null>,
 *   aggregatedBbox: import('svelte/store').Readable<number[]|null>,
 *   fetchNearestAcrossBackends: (lat: number, lon: number, limit?: number) => Promise<Array>,
 * }}
 */
export function createRegistry() {
  let backends = [];
  let pollTimer = null;
  const registryError = writable(null);

  const store = readable([], (set) => {
    function notify() {
      set([...backends]);
    }

    function patchBackend(url, patch) {
      const idx = backends.findIndex(b => b.url === url);
      if (idx < 0) return null;
      const updated = { ...backends[idx], ...patch };
      backends[idx] = updated;
      notify();
      return updated;
    }

    async function loadBackend(backend) {
      patchBackend(backend.url, { loading: true, error: null });

      try {
        const meta = await fetchMeta(backend.url);

        const patch = { loading: false };
        if (meta) {
          patch.version         = meta.version ?? null;
          patch.region          = meta.name    ?? null;
          patch.bbox            = Array.isArray(meta.bbox) && meta.bbox.length === 4 && meta.bbox.every(Number.isFinite) ? meta.bbox : null;
          patch.playgroundCount = meta.playground_count ?? 0;
          // Pre-P1 backends omit the three completeness fields. Use a null
          // sentinel for `completeness` in that case so the macro view can
          // render a "no completeness data" treatment instead of an
          // all-zero ring (which would look like a healthy empty region).
          //
          // The `Number.isFinite` check (rather than `k in meta`) also
          // collapses `null` and `NaN` sentinels into the unknown branch
          // — without it, a backend that ships `{ complete: null, partial:
          // null, missing: null }` would pass the `in` test, then poison
          // the macro renderer's `quantiseSegments` with NaN tenths and
          // produce an invisible ring with no error surface.
          const hasCompleteness = ['complete', 'partial', 'missing'].every(k => Number.isFinite(meta[k]));
          patch.completeness = hasCompleteness
            ? { complete: meta.complete, partial: meta.partial, missing: meta.missing }
            : null;
          // ISO timestamp of the backend's last successful import. Null on
          // pre-#301 backends that don't yet ship api.import_status. Used by
          // the polygon-tier dedup to pick the fresher copy when two backends
          // return the same osm_id.
          patch.lastImportAt = backend._lastImportAtOverride ?? meta.last_import_at ?? null;
          patch.regionGeom   = meta.region_geom ?? null;
          if (!backend.name && patch.region) patch.name = patch.region;
        }

        patchBackend(backend.url, patch);
      } catch (err) {
        patchBackend(backend.url, { error: err.message, loading: false });
      }
    }

    async function loadAll() {
      try {
        const res = await fetch(registryUrl);
        if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
        const data = await res.json();

        registryError.set(null);

        // Support both { instances: [...] } and bare array formats
        const entries = Array.isArray(data) ? data : (data.instances ?? []);
        backends = entries.map(entry => ({
          url:              entry.url,
          name:             entry.name || entry.url,
          slug:             normaliseSlug(entry.slug, entry.url),
          loading:          true,
          error:            null,
          version:          null,
          region:           null,
          bbox:             null,
          playgroundCount:  0,
          completeness:     null,  // populated after get_meta lands; see status-shape JSDoc
          lastImportAt:     null,  // from get_meta.last_import_at; used by polygon-tier dedup (#202)
          regionGeom:       null,  // GeoJSON Feature geometry from get_meta.region_geom; used for polygon overlap detection (#532)
          nominalCentroid:       parseNominalCentroid(entry.centroid, entry.url),  // fallback position for null-bbox backends (#598)
          _lastImportAtOverride: entry.lastImportAt ?? null,  // registry.json static override; takes priority over meta on every poll
          // Populated from /federation-status.json (hub-side cron poll, this change)
          healthUp:         null,  // null = unknown, true/false = known
          dataAgeSec:       null,  // seconds since the importer last ran (operator-facing)
          osmDataAgeSec:    null,  // seconds since the OSM data was snapshotted (user-facing)
          lastReachable:    null,  // ISO string of last successful hub probe
          observationStale: false,
          importing:        false, // true while osm2pgsql is actively running
          impressumUrl:     null,
          privacyUrl:       null,
          hasLegal:         false,
        }));
        notify();

        await Promise.all(backends.map(b => loadBackend(b)));
      } catch (err) {
        console.error('[registry] load failed:', err);
        registryError.set(err.message);
      }

      schedulePoll();
    }

    function schedulePoll() {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(async () => {
        // Re-fetch each backend (registry list stays fixed between page loads)
        await Promise.all(backends.map(b => loadBackend(b)));
        schedulePoll();
      }, hubPollInterval * 1000);
    }

    loadAll();

    startFederationHealthPoll((status, observationStale) => {
      // Match by `url`, not slug: slugs are optional in registry.json (only
      // used for deep-link URLs), but every federation-status entry carries
      // a `url` field. Matching by url avoids having two implementations of
      // the slug-fallback algorithm (jq `gsub` server-side, `normaliseSlug`
      // client-side) that have to stay in lockstep.
      const entriesByUrl = new Map();
      for (const e of Object.values(status)) {
        if (e?.url) entriesByUrl.set(e.url, e);
      }
      for (const b of backends) {
        const entry = entriesByUrl.get(b.url);
        if (!entry) continue;
        const patch = {
          healthUp:           entry.up ?? null,
          // dataAgeSec       — when the importer last ran (operator concern)
          dataAgeSec:         entry.data_age_seconds ?? null,
          // osmDataAgeSec    — how old the OSM data is (user concern). Null
          //                    on pre-osm-data-age backends; the drawer
          //                    falls back to dataAgeSec in that case.
          osmDataAgeSec:      entry.osm_data_age_seconds ?? null,
          lastReachable:      entry.last_success ?? null,
          observationStale,
          // false on older backends that don't yet ship the importing field
          importing:          entry.importing ?? false,
          impressumUrl:       entry.impressum_url ?? null,
          privacyUrl:         entry.privacy_url  ?? null,
          hasLegal:           entry.has_legal     ?? false,
          version:            entry.version       ?? null,
        };
        // Completeness counts added to federation-status in #545. Absent on
        // older hub releases — skip the patch so the direct get_meta path
        // (registry.js loadBackend) isn't overwritten with undefined.
        // When present, this path is faster on first load: federation-status.json
        // is served from the hub itself vs. N parallel get_meta calls to remotes.
        const hasEntryCompleteness = ['complete', 'partial', 'missing'].every(k => Number.isFinite(entry[k]));
        if (hasEntryCompleteness) {
          patch.completeness = { complete: entry.complete, partial: entry.partial, missing: entry.missing };
        }
        patchBackend(b.url, patch);
      }
    });

    return () => {
      if (pollTimer) clearTimeout(pollTimer);
      stopFederationHealthPoll();
    };
  });

  // Union of all reported backend bboxes. Null until at least one backend has
  // reported; updates reactively as `backends` changes. Backends without a
  // reachable `get_meta` (bbox === null) are ignored.
  const aggregatedBbox = derived(store, ($backends) => {
    const withBbox = $backends.filter(b => b.bbox);
    if (withBbox.length === 0) return null;
    return withBbox.reduce((acc, b) => {
      const [minLon, minLat, maxLon, maxLat] = b.bbox;
      return [
        Math.min(acc[0], minLon),
        Math.min(acc[1], minLat),
        Math.max(acc[2], maxLon),
        Math.max(acc[3], maxLat),
      ];
    }, [Infinity, Infinity, -Infinity, -Infinity]);
  });

  // Map from backend URL to array of overlapping backend names.
  // Uses actual region boundary polygons (region_geom from get_meta).
  // Fires when one region contains the other (e.g. a city backend inside a
  // state backend). Adjacent regions that merely share a border are not
  // flagged. Falls back to no warning for backends without region_geom
  // (pre-#532 images).
  const overlapWarnings = derived(store, ($backends) => {
    const withGeom = $backends.filter(b => b.regionGeom);
    /** @type {Map<string, string[]>} */
    const warnings = new Map();
    for (let i = 0; i < withGeom.length; i++) {
      for (let j = i + 1; j < withGeom.length; j++) {
        const a = withGeom[i];
        const b = withGeom[j];
        try {
          if (booleanContains(a.regionGeom, b.regionGeom) || booleanContains(b.regionGeom, a.regionGeom)) {
            if (!warnings.has(a.url)) warnings.set(a.url, []);
            if (!warnings.has(b.url)) warnings.set(b.url, []);
            warnings.get(a.url).push(b.name);
            warnings.get(b.url).push(a.name);
          }
        } catch {
          // Malformed geometry — skip this pair rather than crashing the store.
        }
      }
    }
    return warnings;
  });

  // Multi-backend nearest-playground search.
  //
  // Fires `get_nearest_playgrounds` against every registered backend in
  // parallel with a per-backend AbortController timeout. Slow or failing
  // backends contribute zero results but never block the response.
  async function fetchNearestAcrossBackends(lat, lon, limit = NEAREST_DEFAULT_LIMIT) {
    const results = await Promise.all(
      backends.map(b => fetchNearestOne(b, lat, lon).catch(() => []))
    );

    // Flatten, dedupe by osm_id (keeping the closest), sort, truncate.
    const byOsmId = new Map();
    for (const items of results) {
      for (const item of items) {
        const existing = byOsmId.get(item.osm_id);
        if (!existing || item.distance_m < existing.distance_m) {
          byOsmId.set(item.osm_id, item);
        }
      }
    }
    return [...byOsmId.values()]
      .sort((a, b) => a.distance_m - b.distance_m)
      .filter(item => item.distance_m <= NEAREST_MAX_DISTANCE_M)
      .slice(0, limit);
  }

  return {
    backends:                   store,
    registryError,
    aggregatedBbox,
    overlapWarnings,
    fetchNearestAcrossBackends,
  };
}

/** Normalises a slug value from the registry. Invalid slugs log a warning
 *  and are treated as missing, so the rest of the registry entry still works. */
function normaliseSlug(raw, url) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (isValidSlug(raw)) return raw;
  console.warn(`[registry] invalid slug "${raw}" on backend ${url} — treating as missing`);
  return null;
}

/** Per-backend nearest-playgrounds call with a timeout. Returns [] on any
 *  error, timeout, or non-OK response so a single bad backend never blocks
 *  the merged result. Attaches `_backendUrl` / `_backendSlug` to each item
 *  for downstream feature lookup + deep-link writing. */
async function fetchNearestOne(backend, lat, lon) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEAREST_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ lat, lon });
    const res = await fetch(
      `${backend.url}/rpc/get_nearest_playgrounds?${params}`,
      { signal: controller.signal }
    );
    if (!res.ok) return [];
    const items = await res.json();
    return items.map(item => ({
      ...item,
      _backendUrl:  backend.url,
      _backendSlug: backend.slug ?? null,
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
