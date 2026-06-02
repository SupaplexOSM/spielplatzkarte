<script>
  import GeoJSON from 'ol/format/GeoJSON.js';
  import { get } from 'svelte/store';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { selection } from '../stores/selection.js';
  import { mapStore } from '../stores/map.js';
  import { playgroundCompleteness } from '../lib/completeness.js';
  import { fetchPlaygroundByOsmId } from '../lib/api.js';
  import { _ } from 'svelte-i18n';

  export let lat;
  export let lon;
  /** Called when the panel should close (suggestion selected). */
  export let ondismiss = null;
  /**
   * Fetcher returning `{ osm_id, name, distance_m, ... }` items sorted by
   * distance ascending. Standalone injects a single-backend PostgREST call;
   * hub injects a merge across all registered backends. Always present in
   * production; null only in degraded local-dev modes where no PostgREST
   * is configured, in which case the panel renders empty.
   */
  export let fetcher = null;
  /**
   * Backend URL to attach to the selection when the user picks a suggestion.
   * Hub overrides this per-feature via the feature's `_backendUrl`.
   */
  export let defaultBackendUrl = '';

  let items = [];
  let loading = true;
  const geojsonFormat = new GeoJSON();
  let selectAbort = null; // cancels any in-flight hydration when a new suggestion is tapped

  $: if (lat != null && lon != null) {
    load(lat, lon);
  }

  async function load(lt, lg) {
    loading = true;
    items = [];
    if (!fetcher) {
      loading = false;
      return;
    }
    try {
      items = await fetcher(lt, lg);
    } catch (err) {
      console.error('Nearest playgrounds fetch failed:', err);
      items = [];
    } finally {
      loading = false;
    }
  }

  function formatDistance(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  }

  function completenessClass(tags) {
    const c = playgroundCompleteness(tags);
    if (c === 'complete') return 'dot-complete';
    if (c === 'partial')  return 'dot-partial';
    return 'dot-missing';
  }

  async function selectSuggestion(item) {
    if (selectAbort) selectAbort.abort();
    selectAbort = new AbortController();
    const { signal } = selectAbort;

    const source = $playgroundSourceStore;
    let feature = source?.getFeatures().find(f => f.get('osm_id') === item.osm_id);
    const backendUrl = item._backendUrl ?? defaultBackendUrl;

    // §5 — at cluster zoom the polygon source is empty. Hydrate the
    // single playground so the panel can open with full data and the
    // map can fit-to-extent. Stamp `_backendUrl` on the hydrated feature
    // so subsequent reads (e.g. another selectSuggestion finding the same
    // feature in-source) route to the right backend in hub mode.
    if (!feature && source) {
      try {
        const json = await fetchPlaygroundByOsmId(item.osm_id, backendUrl, signal);
        if (signal.aborted) return;
        if (json) {
          const olFeatures = geojsonFormat.readFeatures(
            { type: 'FeatureCollection', features: [json] },
            { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' },
          );
          for (const f of olFeatures) f.set('_backendUrl', backendUrl);
          source.addFeatures(olFeatures);
          feature = olFeatures[0];
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('[nearby] hydration failed:', err);
      }
    }

    if (signal.aborted) return;
    if (feature) {
      selection.select(feature, feature.get('_backendUrl') ?? backendUrl);
      const map = get(mapStore);
      if (map) {
        map.getView().fit(feature.getGeometry().getExtent(), {
          padding: [40, 40, 40, 420],
          maxZoom: 19,
          duration: 400,
        });
      }
    }
    if (ondismiss) ondismiss();
  }
</script>

<div class="nearby-card">
  <div class="nearby-header">{$_('nearby.header')}</div>
  {#if loading}
    <div class="nearby-loading">{$_('nearby.loading')}</div>
  {:else if items.length === 0}
    <div class="nearby-loading">{$_('nearby.empty')}</div>
  {:else}
    <ul class="nearby-list">
      {#each items.slice(0, 5) as item}
        <li>
          <button class="nearby-item" onclick={() => selectSuggestion(item)}>
            <span class="dot {completenessClass(item.tags)}"></span>
            <span class="nearby-name">{item.name || $_('nearby.unknownName')}</span>
            <span class="nearby-dist">{formatDistance(item.distance_m)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .nearby-card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    width: 300px;
    max-width: calc(100vw - 5rem);
  }

  .nearby-header {
    padding: 8px 14px 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9aa0a6;
    border-bottom: 1px solid #e8eaed;
  }

  .nearby-loading {
    padding: 10px 14px;
    font-size: 13px;
    color: #9aa0a6;
  }

  .nearby-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .nearby-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    width: 100%;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .nearby-item:hover {
    background: #f1f3f4;
  }

  .dot {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .dot-complete { background: #22c55e; }
  .dot-partial  { background: #f59e0b; }
  .dot-missing  { background: #ef4444; }

  .nearby-name {
    flex: 1;
    font-size: 13px;
    color: #202124;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nearby-dist {
    flex-shrink: 0;
    font-size: 12px;
    color: #9aa0a6;
  }
</style>
