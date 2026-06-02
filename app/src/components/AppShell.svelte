<script>
  import Map from './Map.svelte';
  import PlaygroundPanel from './PlaygroundPanel.svelte';
  import SearchBar from './SearchBar.svelte';
  import LocateButton from './LocateButton.svelte';
  import FilterPanel from './FilterPanel.svelte';
  import FilterChips from './FilterChips.svelte';

  import HoverPreview from './HoverPreview.svelte';
  import EquipmentTooltip from './EquipmentTooltip.svelte';
  import NearbyPlaygrounds from './NearbyPlaygrounds.svelte';
  import DataContributionModal from './DataContributionModal.svelte';
  import CompletenessLegend from './CompletenessLegend.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { Info, Plus, Minus, ArrowLeft } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';
  import GeoJSON from 'ol/format/GeoJSON.js';
  import { mapStore } from '../stores/map.js';
  import { selection, hasSelection } from '../stores/selection.js';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { parseHash } from '../lib/deeplink.js';
  import { fetchPlaygroundByOsmId } from '../lib/api.js';
  import { impressumUrl, privacyUrl } from '../lib/config.js';

  /**
   * The OL VectorSource that renders the polygon tier (zoom ≥ 14). The shell
   * passes it to the Map and to widgets that need to scan features
   * (NearbyPlaygrounds fallback, URL-hash restore).
   * @type {import('ol/source/Vector.js').default}
   */
  export let playgroundSource;

  /**
   * Cluster-tier source (zoom ≤ clusterMaxZoom). Fed by the orchestrator from
   * `get_playground_clusters`.
   * @type {import('ol/source/Vector.js').default | null}
   */
  export let clusterSource = null;

  /**
   * Macro-tier source (hub-only, zoom ≤ macroMaxZoom). Fed by `MacroView`
   * from the registry's per-backend metadata; null in standalone mode.
   * @type {import('ol/source/Vector.js').default | null}
   */
  export let macroSource = null;

  /**
   * Readable store emitting the current map view in WGS84 as
   * `[minLon, minLat, maxLon, maxLat]` (or null). Consumed by SearchBar as
   * Nominatim `viewbox`.
   * @type {import('svelte/store').Readable<[number,number,number,number]|null>}
   */
  export let searchExtent;

  /**
   * `(lat, lon) => Promise<Array<{ osm_id, name, distance_m, ... }>>` returning
   * distance-sorted nearby playgrounds. Standalone wires this to a single
   * PostgREST call; hub wires it to a multi-backend merge.
   * @type {(lat: number, lon: number) => Promise<Array>}
   */
  export let nearestFetcher = null;

  /**
   * Links shown in the info modal.
   * @type {{ chatUrl: string | null }}
   */
  export let dataContribLinks;

  /** Fallback backend URL applied to features that don't carry `_backendUrl`. */
  export let defaultBackendUrl = '';

  /**
   * Optional Svelte snippet rendered in the bottom-left corner, above the
   * scale-line. Hub uses this to render the instance-pill; standalone leaves
   * it empty.
   * @type {import('svelte').Snippet | null}
   */
  export let instancePanel = null;

  /**
   * Hub-only slug → backend URL resolver. When a deep-link carries a slug,
   * the shell uses this to narrow the feature search to that backend. Returns
   * the URL, or `null` if the slug is unknown — in which case we keep retrying
   * on every source `change` event as more backends populate, but only log the
   * "unknown slug" warning once. Standalone passes `null`, so any slug in the
   * hash is silently ignored.
   * @type {((slug: string) => {url: string, name: string|null} | null) | null}
   */
  export let resolveSlugToBackendUrl = null;

  /**
   * Hub-only "list every registered backend" accessor returning
   * `[{ url, slug }, ...]`. The slug is preserved through the broadcast
   * hydration so a slug-less hash can still rewrite to its canonical
   * `#<slug>/W<id>` form once the matching backend is identified.
   * Standalone passes `null`.
   * @type {(() => Array<{url: string, slug: string|null, name: string|null}>) | null}
   */
  export let getAllBackendUrls = null;

  /**
   * Hub-only registration: AppShell calls this with a callback to be invoked
   * on every backends-store update. Used to re-trigger `tryRestoreFromHash`
   * when a slug becomes resolvable (post-registry-load) or backends arrive
   * after the initial source-change retry has stalled. Returns an unsubscribe.
   * Standalone passes `null` and the source-change trigger alone is enough.
   * @type {((cb: () => void) => () => void) | null}
   */
  export let onBackendsUpdate = null;

  // ── URL hash restore ──────────────────────────────────────────────────────
  //
  // Runs once on first load and again on every `change` event from the
  // injected source until a match is found. Supports both `#W<osm_id>` and
  // `#<slug>/W<osm_id>`: with a slug, selection is scoped to the matching
  // backend; without a slug, we broadcast-search across all loaded features
  // and warn on duplicate osm_ids (rare — same OSM entity present in two
  // overlapping regional databases).
  let hashRestored = false;
  let warnedUnknownSlug = false;
  let hydrating = false;
  let warnedHydrationFailed = false;
  const geojsonFormat = new GeoJSON();

  async function tryRestoreFromHash() {
    if (hashRestored) return;
    const parsed = parseHash(window.location.hash);
    if (!parsed) { hashRestored = true; return; }

    let candidates = playgroundSource.getFeatures();

    if (parsed.slug && resolveSlugToBackendUrl) {
      const resolved = resolveSlugToBackendUrl(parsed.slug);
      if (!resolved) {
        if (!warnedUnknownSlug) {
          console.warn(`[deeplink] unknown registry slug "${parsed.slug}" — will retry as backends load`);
          warnedUnknownSlug = true;
        }
        return;
      }
      candidates = candidates.filter(f => f.get('_backendUrl') === resolved.url);
    }

    const matches = candidates.filter(f => f.get('osm_id') === parsed.osmId);
    if (matches.length > 0) {
      if (matches.length > 1 && !parsed.slug) {
        console.warn(`[deeplink] osm_id ${parsed.osmId} matched ${matches.length} backends — selecting the first`);
      }
      const feat = matches[0];
      const backendUrl = feat.get('_backendUrl') ?? defaultBackendUrl;
      selection.select(feat, backendUrl);
      // Fit to the playground so the user sees what they linked to even if
      // they landed at a low zoom that doesn't render polygons.
      const map = $mapStore;
      if (map) {
        map.getView().fit(feat.getGeometry().getExtent(), {
          padding: [40, 40, 40, 420],
          maxZoom: 19,
          duration: 400,
        });
      }
      hashRestored = true;
      return;
    }

    // §5.1 — when the polygon source is empty (cluster/macro tier on first
    // load), hydrate the single feature on demand from `get_playground`.
    //
    // Hydration cases:
    //   - Standalone + slug-less hash → fetch from `defaultBackendUrl`.
    //   - Hub + slug-prefixed hash    → fetch from the slug-resolved
    //     backend URL (P2 §3 — registry no longer eager-loads polygons,
    //     so this path is needed for slug-routed hub deeplinks too).
    //   - Hub + slug-less hash (broadcast) → fan out `get_playground`
    //     across every registered backend; first match wins, duplicates
    //     log a warning. Cost: N parallel requests per slug-less hub
    //     deeplink load (bounded by registry size, ≤30 backends).
    //   - Standalone + slug-prefixed → defer; standalone has no slug
    //     resolver, so `resolveSlugToBackendUrl` is null and we wait for
    //     the orchestrator's polygon-tier load to surface the feature.
    if (hydrating) return;

    // Hub + slug-less broadcast — handled separately because it's the
    // only path that fans out across multiple backends in parallel.
    if (!parsed.slug && resolveSlugToBackendUrl && getAllBackendUrls) {
      const targets = getAllBackendUrls();
      if (targets.length === 0) return; // backends still loading — retry on next change
      hydrating = true;
      try {
        const settled = await Promise.all(targets.map(({ url, slug }) =>
          fetchPlaygroundByOsmId(parsed.osmId, url)
            .then(feat => feat ? { feat, url, slug } : null)
            .catch(() => null),
        ));
        const matches = settled.filter(Boolean);
        if (matches.length > 1) {
          console.warn(`[deeplink] osm_id ${parsed.osmId} matched ${matches.length} backends — selecting the first`);
        }
        if (matches.length > 0) {
          const { feat, url, slug, name } = matches[0];
          const olFeatures = geojsonFormat.readFeatures(
            { type: 'FeatureCollection', features: [feat] },
            { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' },
          );
          // Stamp URL, slug (for hash canonicalisation), and name (for the
          // backend subtitle in PlaygroundPanel) on every hydrated feature.
          for (const f of olFeatures) {
            f.set('_backendUrl', url);
            if (slug) f.set('_backendSlug', slug);
            if (name) f.set('_backendName', name);
          }
          playgroundSource.addFeatures(olFeatures);
          // The standard match path inside `playgroundSource.on('change')`
          // will pick up the freshly-added features and complete the
          // selection + fit on the next tick.
        } else if (!warnedHydrationFailed) {
          warnedHydrationFailed = true;
          console.warn(`[deeplink] no playground found for osm_id ${parsed.osmId} across ${targets.length} backend(s)`);
          hashRestored = true;
        }
      } catch (err) {
        if (!warnedHydrationFailed) {
          warnedHydrationFailed = true;
          console.warn('[deeplink] broadcast hydration failed (give up; reload to retry):', err);
        }
        hashRestored = true;
      } finally {
        hydrating = false;
      }
      return;
    }

    let hydrateFromUrl = null;
    let hydrateFromName = null;
    if (parsed.slug && resolveSlugToBackendUrl) {
      const resolved = resolveSlugToBackendUrl(parsed.slug);
      if (!resolved) return; // unknown slug — keep waiting (warned above)
      hydrateFromUrl = resolved.url;
      hydrateFromName = resolved.name;
    } else if (!parsed.slug && !resolveSlugToBackendUrl) {
      hydrateFromUrl = defaultBackendUrl;
    } else {
      return; // standalone-with-slug — defer to source change
    }
    hydrating = true;
    try {
      const feature = await fetchPlaygroundByOsmId(parsed.osmId, hydrateFromUrl);
      if (feature) {
        const olFeatures = geojsonFormat.readFeatures(
          { type: 'FeatureCollection', features: [feature] },
          { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' },
        );
        // Stamp `_backendUrl`, `_backendSlug` (when present), and `_backendName`
        // so the standard match path routes to the right hub backend and
        // PlaygroundPanel can show the backend name subtitle.
        for (const f of olFeatures) {
          f.set('_backendUrl', hydrateFromUrl);
          if (parsed.slug) f.set('_backendSlug', parsed.slug);
          if (hydrateFromName) f.set('_backendName', hydrateFromName);
        }
        playgroundSource.addFeatures(olFeatures);
      } else {
        // 200 OK with no body — the backend confirms no playground exists
        // with this osm_id. Give up rather than retry on every change.
        if (!warnedHydrationFailed) {
          warnedHydrationFailed = true;
          console.warn(`[deeplink] no playground found for osm_id ${parsed.osmId}`);
        }
        hashRestored = true;
      }
    } catch (err) {
      // Server error / network / timeout. Logging once and giving up
      // beats fetching on every subsequent moveend's source change. User
      // can reload to retry.
      if (!warnedHydrationFailed) {
        warnedHydrationFailed = true;
        console.warn('[deeplink] hydration failed (give up; reload to retry):', err);
      }
      hashRestored = true;
    } finally {
      hydrating = false;
    }
  }

  onMount(() => {
    // If features are already loaded (sync fetch or test fixture), try now.
    tryRestoreFromHash();
    // Otherwise wait for the source to populate.
    playgroundSource.on('change', tryRestoreFromHash);
    // Hub-mode also retries on every backends-store update — covers the
    // case where the initial tryRestoreFromHash runs before the registry
    // has loaded (slug not yet resolvable, or `getAllBackendUrls` returns
    // []), and the polygon source never changes at cluster tier so the
    // source-change retry alone never fires.
    const detachBackends = onBackendsUpdate?.(tryRestoreFromHash);
    return () => {
      playgroundSource.un('change', tryRestoreFromHash);
      detachBackends?.();
    };
  });

  let dataModalOpen  = false;

  // Nearest-playground suggestions panel
  let nearbyLocation = null;  // { lat, lon } | null
  let dismissUnsub = null;

  function handleLocation(lat, lon) {
    if (dismissUnsub) { dismissUnsub(); dismissUnsub = null; }
    if (lat === null) { nearbyLocation = null; return; }
    nearbyLocation = { lat, lon };
    let first = true;
    dismissUnsub = selection.subscribe(() => {
      if (first) { first = false; return; }
      nearbyLocation = null;
      if (dismissUnsub) { dismissUnsub(); dismissUnsub = null; }
    });
  }

  function dismissNearby() {
    nearbyLocation = null;
    if (dismissUnsub) { dismissUnsub(); dismissUnsub = null; }
  }

  onDestroy(() => {
    if (dismissUnsub) dismissUnsub();
    clearTimeout(panelBlockTimer);
  });

  // Responsive: track if we're on mobile
  let isMobile = false;
  function checkMobile() {
    isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
  }
  $: if (typeof window !== 'undefined') {
    checkMobile();
  }

  // Briefly block pointer events on the mobile detail panel body after it opens
  // to prevent the map tap that triggered the selection from bleeding into links
  // (email, Panoramax, etc.) that appear at the same screen coordinates.
  let panelBlockTouch = false;
  let panelBlockTimer = null;
  let _panelWasOpen = false;
  $: {
    const panelOpen = isMobile && $hasSelection;
    if (panelOpen && !_panelWasOpen) {
      panelBlockTouch = true;
      clearTimeout(panelBlockTimer);
      panelBlockTimer = setTimeout(() => { panelBlockTouch = false; }, 350);
    }
    _panelWasOpen = panelOpen;
  }

  // Center the map on the selected playground when the mobile full-screen panel
  // opens, and re-center when it closes so the full area is visible on return.
  // Uses balanced padding — the full-screen panel covers the map entirely while
  // open, so there is no bottom-sheet offset to account for.
  let lastMobileFeature = null;
  $: {
    if (isMobile && $hasSelection) {
      const feat = $selection.feature;
      if (feat && $mapStore) {
        lastMobileFeature = feat;
        $mapStore.getView().fit(feat.getGeometry().getExtent(), {
          padding: [60, 20, 60, 20],
          maxZoom: 19,
          duration: 400,
        });
      }
    } else if (isMobile && !$hasSelection && lastMobileFeature && $mapStore) {
      const feat = lastMobileFeature;
      lastMobileFeature = null;
      $mapStore.getView().fit(feat.getGeometry().getExtent(), {
        padding: [80, 40, 80, 40],
        maxZoom: 19,
        duration: 300,
      });
    }
  }

  // Hover preview state
  let hoverFeature = null;
  let hoverPosition = null;

  function handleHover(feature, pixel) {
    if (isMobile) return;
    hoverFeature = feature;
    hoverPosition = pixel ? { x: pixel[0], y: pixel[1] } : null;
  }

  function clearHover() {
    hoverFeature = null;
    hoverPosition = null;
  }

  let equipHoverFeature = null;
  let equipHoverPosition = null;

  function handleEquipHover(feature, pixel) {
    if (isMobile) return;
    equipHoverFeature = feature;
    equipHoverPosition = pixel ? { x: pixel[0], y: pixel[1] } : null;
  }

  function clearEquipHover() {
    equipHoverFeature = null;
    equipHoverPosition = null;
  }

  function zoomIn() {
    if ($mapStore) {
      const view = $mapStore.getView();
      view.animate({ zoom: view.getZoom() + 1, duration: 200 });
    }
  }

  function zoomOut() {
    if ($mapStore) {
      const view = $mapStore.getView();
      view.animate({ zoom: view.getZoom() - 1, duration: 200 });
    }
  }
</script>

<svelte:window onresize={checkMobile} />

<div class="app-root">
  <Map
    {playgroundSource}
    {clusterSource}
    {macroSource}
    {defaultBackendUrl}
    onhover={handleHover}
    onclearhover={clearHover}
    onequipmenthover={handleEquipHover}
    onclearequipmenthover={clearEquipHover}
  />

  {#if !(isMobile && $hasSelection)}
    <div class="search-area">
      <SearchBar regionExtent={$searchExtent} onlocation={handleLocation} />
      {#if nearbyLocation}
        <NearbyPlaygrounds
          lat={nearbyLocation.lat}
          lon={nearbyLocation.lon}
          fetcher={nearestFetcher}
          {defaultBackendUrl}
          ondismiss={dismissNearby}
        />
      {/if}
      {#if !isMobile && !$hasSelection}
        <CompletenessLegend />
      {/if}
    </div>

    <!-- On mobile: pencil (info) on top, filter below — avoids clashing with search bar -->
    <div class="controls-top-right">
      <div class="controls-row">
        <button
          class="control-btn"
          onclick={() => dataModalOpen = true}
          title={$_('nav.about')}
          aria-label={$_('nav.about')}
        >
          <Info class="h-5 w-5" />
        </button>
        <FilterPanel />
      </div>
      <FilterChips />
    </div>

    <div class="controls-bottom-right">
      <LocateButton onlocation={handleLocation} />
      <div class="zoom-controls">
        <button
          class="zoom-btn zoom-in"
          onclick={zoomIn}
          title={$_('zoom.in')}
          aria-label={$_('zoom.in')}
        >
          <Plus class="h-4 w-4" />
        </button>
        <button
          class="zoom-btn zoom-out"
          onclick={zoomOut}
          title={$_('zoom.out')}
          aria-label={$_('zoom.out')}
        >
          <Minus class="h-4 w-4" />
        </button>
      </div>
    </div>

    {#if isMobile && !$hasSelection}
      <div class="legend-mobile">
        <CompletenessLegend />
      </div>
    {/if}

    {#if instancePanel}
      <div class="instance-slot">
        {@render instancePanel()}
      </div>
    {/if}

  {/if}

  {#if !isMobile && $hasSelection}
    <div class="side-panel">
      <PlaygroundPanel />
    </div>
  {/if}

  {#if isMobile && $hasSelection}
    <div class="mobile-detail-panel">
      <div class="mobile-detail-header">
        <button
          class="mobile-back-btn"
          onclick={() => selection.clear()}
          aria-label={$_('info.closeBtn')}
        >
          <ArrowLeft class="h-5 w-5" />
          <span>{$_('info.backToMap')}</span>
        </button>
      </div>
      <div class="mobile-detail-body" style={panelBlockTouch ? 'pointer-events: none' : ''}>
        <PlaygroundPanel embedded={true} />
      </div>
    </div>
  {/if}

  <HoverPreview position={$hasSelection ? null : hoverPosition} feature={$hasSelection ? null : hoverFeature} />
  <EquipmentTooltip position={equipHoverPosition} feature={equipHoverFeature} />

  <DataContributionModal
    bind:open={dataModalOpen}
    chatUrl={dataContribLinks.chatUrl}
    {impressumUrl}
    {privacyUrl}
  />
</div>

<style>
  .app-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .search-area {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .controls-top-right {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-end;
  }

  .controls-row {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
  }

  .controls-bottom-right {
    position: absolute;
    bottom: 7rem;
    right: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: white;
    border: none;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    color: #666;
    transition: background 0.15s, color 0.15s;
  }

  .control-btn:hover {
    background: #f5f5f5;
    color: #333;
  }

  .zoom-controls {
    display: flex;
    flex-direction: column;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: white;
    border: none;
    cursor: pointer;
    color: #666;
    transition: background 0.15s, color 0.15s;
  }

  .zoom-btn:hover {
    background: #f5f5f5;
    color: #333;
  }

  .zoom-in {
    border-bottom: 1px solid #e0e0e0;
  }

  /* Bottom-left slot for the hub instance-pill (and any future bottom-left
     widget). Raised above the scale-line (bottom:24px + ~14px tall) with a
     small gap so the two don't collide. */
  .instance-slot {
    position: absolute;
    bottom: 3rem;
    left: 1rem;
    z-index: 100;
  }

  @media (max-width: 1023px) {
    .instance-slot {
      left: 0.75rem;
    }
  }

  .mobile-detail-panel {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    touch-action: pan-y;
    color-scheme: light;
    --color-background: #ffffff;
    --color-foreground: #1f2937;
    --color-card: #ffffff;
    --color-card-foreground: #1f2937;
    --color-muted: #f3f4f6;
    --color-muted-foreground: #6b7280;
    --color-border: #e5e7eb;
  }

  .mobile-detail-header {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .mobile-back-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #4b5563;
    font-size: 0.9rem;
    padding: 0.25rem 0;
  }

  .mobile-detail-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 1rem 1rem;
  }

  .side-panel {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 380px;
    z-index: 200;
    background: var(--color-card);
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    animation: slideInLeft 0.3s ease-out;
    color-scheme: light;

    --color-background: #ffffff;
    --color-foreground: #1f2937;
    --color-card: #ffffff;
    --color-card-foreground: #1f2937;
    --color-popover: #ffffff;
    --color-popover-foreground: #1f2937;
    --color-muted: #f3f4f6;
    --color-muted-foreground: #6b7280;
    --color-border: #e5e7eb;
    --color-input: #e5e7eb;
  }

  @keyframes slideInLeft {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  @media (max-width: 1023px) {
    .search-area {
      top: 0.75rem;
      left: 0.75rem;
      /* Leave room for the stacked top-right buttons (40px wide + gaps). */
      right: calc(0.75rem + 40px + 0.5rem);
    }

    .controls-top-right {
      top: 0.75rem;
      right: 0.75rem;
    }

    .controls-row {
      /* Stack vertically on mobile so they don't overlap the search bar. */
      flex-direction: column;
    }

    .controls-bottom-right {
      bottom: 10rem;
      right: 0.75rem;
    }

    /* Legend moved out of the search column on mobile — sits below the
       bottom-right control cluster, aligned to the same right edge. */
    .legend-mobile {
      position: absolute;
      bottom: 2rem;
      right: 0.75rem;
      z-index: 100;
    }
  }

  @media (min-width: 1024px) {
    .app-root:has(.side-panel) .search-area {
      left: calc(380px + 1rem);
      transition: left 0.3s ease-out;
    }
  }
</style>
