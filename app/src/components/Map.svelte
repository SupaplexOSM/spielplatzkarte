<script>
  import { onMount, onDestroy } from 'svelte';
  import { Map, View } from 'ol';
  import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer.js';
  import VectorSource from 'ol/source/Vector.js';
  import XYZ from 'ol/source/XYZ.js';
  import GeoJSON from 'ol/format/GeoJSON.js';
  import { transform, transformExtent } from 'ol/proj';
  import { ScaleLine, defaults as defaultControls } from 'ol/control.js';
  import { defaults as defaultInteractions } from 'ol/interaction/defaults';

  import { mapZoom, mapMinZoom, apiBaseUrl } from '../lib/config.js';
  import {
    playgroundStyleFn,
    selectionStyle,
    equipmentLayerStyleFn,
    treeStyleFn,
    clusterTierStyleFn,
  } from '../lib/vectorStyles.js';
  import { macroRingStyleFn } from '../hub/macroRingStyle.js';
  import { selection } from '../stores/selection.js';
  import { mapStore } from '../stores/map.js';
  import { playgroundSourceStore } from '../stores/playgroundSource.js';
  import { activeTierStore } from '../stores/tier.js';
  import { filterStore, matchesFilters } from '../stores/filters.js';
  import { overlayFeaturesStore } from '../stores/overlayLayer.js';
  import { debounce } from '../lib/utils.js';

  // Props: the sources are injected by the shell; Map itself never loads data.
  /** @type {VectorSource | null} - polygon-tier source (zoom > clusterMaxZoom) */
  export let playgroundSource = null;
  /** @type {VectorSource | null} - cluster-tier source (zoom ≤ clusterMaxZoom) */
  export let clusterSource = null;
  /** @type {VectorSource | null} - macro-tier source (hub-only, zoom ≤ macroMaxZoom) */
  export let macroSource = null;
  /** Backend URL used for selection — standalone passes apiBaseUrl, hub passes per-feature URL */
  export let defaultBackendUrl = apiBaseUrl;
  
  /** Hover callback: (feature, pixel) => void */
  export let onhover = null;
  /** Clear hover callback: () => void */
  export let onclearhover = null;
  /** Equipment hover callback: (feature, pixel) => void */
  export let onequipmenthover = null;
  /** Clear equipment hover callback: () => void */
  export let onclearequipmenthover = null;

  let mapContainer;
  let olMap = null;
  let backendPopup = null; // { x, y, name, offline, degraded }
  let playgroundLayer = null; // polygon tier (zoom > clusterMaxZoom) — exposed for filter reactivity
  let clusterLayer = null;    // cluster tier (zoom ≤ clusterMaxZoom) — §3
  let macroLayer = null;      // macro tier (hub-only, zoom ≤ macroMaxZoom) — P2 §5
  let equipmentLayer = null;  // overlay: equipment points/polygons
  let treeLayer = null;       // overlay: tree dots
  let overlayUnsubscribe = null;
  let tierUnsubscribe = null;

  onMount(async () => {
    // The shell owns the sources; fall back to empty ones so the map still
    // renders in degraded paths (e.g. tests that mount Map without a parent).
    const polygonSrc = playgroundSource ?? new VectorSource();
    const clusterSrc = clusterSource    ?? new VectorSource();
    const macroSrc   = macroSource      ?? new VectorSource();

    // All three tier layers start hidden; the activeTierStore subscription
    // below reveals exactly one once the orchestrator has chosen a tier.
    playgroundLayer = new VectorLayer({
      source: polygonSrc,
      zIndex: 10,
      style: playgroundStyleFn,
      visible: false,
    });
    clusterLayer = new VectorLayer({
      source: clusterSrc,
      zIndex: 12,
      style: clusterTierStyleFn,
      visible: false,
    });
    // Macro tier sits above the cluster layer (zIndex 14) so any future
    // overlap during a tier transition keeps the macro rings on top.
    macroLayer = new VectorLayer({
      source: macroSrc,
      zIndex: 14,
      style: macroRingStyleFn,
      visible: false,
    });

    const basemap = new TileLayer({
      source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        attributions:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
          '| &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }),
    });

    const view = new View({
      center: transform([10.5, 51.2], 'EPSG:4326', 'EPSG:3857'), // Germany fallback
      zoom: mapZoom,
      minZoom: mapMinZoom,
    });

    olMap = new Map({
      target: mapContainer,
      layers: [basemap, playgroundLayer, clusterLayer, macroLayer],
      view,
      // Disable default zoom/rotate controls for cleaner UI like Google Maps
      controls: defaultControls({ 
        zoom: false, 
        rotate: false,
        attribution: true 
      }).extend([
        new ScaleLine({ units: 'metric', className: 'custom-scale-line' })
      ]),
      interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
    });

    mapStore.set(olMap);

    // Subscribe to overlay features store — rebuild equipment/tree layers on each change
    overlayUnsubscribe = overlayFeaturesStore.subscribe(({ equipment, trees }) => {
      if (equipmentLayer) { olMap.removeLayer(equipmentLayer); equipmentLayer = null; }
      if (treeLayer)      { olMap.removeLayer(treeLayer);      treeLayer      = null; }

      if (equipment.length > 0) {
        const src = new VectorSource();
        const olFeatures = new GeoJSON().readFeatures(
          { type: 'FeatureCollection', features: equipment },
          { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
        );
        src.addFeatures(olFeatures);
        equipmentLayer = new VectorLayer({
          source: src,
          zIndex: 20,
          style: equipmentLayerStyleFn,
          properties: { kind: 'overlay' },
        });
        olMap.addLayer(equipmentLayer);
      }

      if (trees.length > 0) {
        const src = new VectorSource();
        src.addFeatures(new GeoJSON().readFeatures(
          { type: 'FeatureCollection', features: trees },
          { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
        ));
        treeLayer = new VectorLayer({ source: src, zIndex: 15, style: treeStyleFn });
        olMap.addLayer(treeLayer);
      }
    });

    // Zoom level at which the current playground was selected; null when nothing selected.
    // Used to auto-clear selection when the user zooms out 2+ levels.
    let selectionZoom = null;
    olMap.on('moveend', () => {
      if (selectionZoom !== null && view.getZoom() <= selectionZoom - 4) {
        selection.clear();
        selectionZoom = null;
      }
      // P1: popup is anchored to a click pixel; dismiss it on any pan/zoom so it
      // doesn't drift away from its ring.
      backendPopup = null;
    });

    // Click handler: tier-aware.
    //  - Polygon tier: select + fit-to-extent (existing behaviour).
    //  - Cluster tier (§4.5): zoom in ~2 levels toward the cluster centre;
    //    a single-child cluster (count === 1) at high zoom transitions
    //    naturally into the polygon tier.
    //  - Macro tier (P2 §5): fit-to-bbox of the clicked backend; the
    //    orchestrator's debounced moveend will land in cluster or polygon
    //    tier and trigger a fan-out scoped to that backend.
    //  - Empty space: clear selection.
    olMap.on('click', (evt) => {
      const polygonHit = olMap.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === playgroundLayer,
        hitTolerance: 10,
      });
      if (polygonHit) {
        const backendUrl = polygonHit.get('_backendUrl') ?? defaultBackendUrl;
        selection.select(polygonHit, backendUrl);
        selectionZoom = null;
        view.fit(polygonHit.getGeometry().getExtent(), {
          padding: [40, 40, 40, 420], // right/top/bottom clear; 420 = sidebar width + margin
          maxZoom: 19,
          duration: 400,
          callback: () => { selectionZoom = view.getZoom(); },
        });
        return;
      }
      const clusterHit = olMap.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === clusterLayer,
      });
      if (clusterHit) {
        const center = clusterHit.getGeometry().getCoordinates();
        view.animate({
          center,
          zoom: Math.min((view.getZoom() ?? 0) + 2, view.getMaxZoom?.() ?? 19),
          duration: 400,
        });
        return;
      }
      const macroHit = olMap.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === macroLayer,
      });
      if (macroHit) {
        const isOffline  = macroHit.get('_offline');
        const isDegraded = macroHit.get('_degraded');
        if (isOffline || isDegraded) {
          backendPopup = {
            x:        evt.pixel[0],
            y:        evt.pixel[1],
            name:     macroHit.get('_name') ?? 'Backend',
            offline:  isOffline,
            degraded: isDegraded,
          };
          return;
        }
        backendPopup = null;
        const bbox4326 = macroHit.get('_bbox');
        if (Array.isArray(bbox4326) && bbox4326.length === 4) {
          view.fit(transformExtent(bbox4326, 'EPSG:4326', 'EPSG:3857'), {
            padding: [40, 40, 40, 420],
            duration: 400,
          });
        }
        return;
      }
      backendPopup = null;
      selection.clear();
    });

    // Pointer cursor on hover + hover preview callback
    let lastHoverFeature = null;
    let lastEquipHoverFeature = null;
    const debouncedHover = debounce((feature, pixel) => {
      if (onhover) onhover(feature, pixel);
    }, 100);

    olMap.on('pointermove', (evt) => {
      // Overlay hit-test: any layer tagged with `kind: 'overlay'` participates
      // (equipment points, standalone pitches contributed by the shell).
      const overlayHit = olMap.forEachFeatureAtPixel(evt.pixel, f => f, {
        layerFilter: l => l.get('kind') === 'overlay',
      });
      const playHit = olMap.forEachFeatureAtPixel(evt.pixel, f => f, {
        layerFilter: l => l === playgroundLayer,
        hitTolerance: 10,
      });
      // Cluster tier hits get the pointer cursor too — click-to-zoom is
      // wired for them and users need the affordance.
      const clusterHit = olMap.forEachFeatureAtPixel(evt.pixel, f => f, {
        layerFilter: l => l === clusterLayer,
      });
      // Macro tier rings: click → fit-to-bbox; same affordance as clusters.
      const macroHit = olMap.forEachFeatureAtPixel(evt.pixel, f => f, {
        layerFilter: l => l === macroLayer,
      });

      mapContainer.style.cursor = (overlayHit || playHit || clusterHit || macroHit) ? 'pointer' : '';

      // Overlay hover takes priority
      if (overlayHit !== lastEquipHoverFeature) {
        lastEquipHoverFeature = overlayHit;
        if (overlayHit) {
          if (onequipmenthover) onequipmenthover(overlayHit, evt.pixel);
          if (lastHoverFeature) { lastHoverFeature = null; if (onclearhover) onclearhover(); }
        } else {
          if (onclearequipmenthover) onclearequipmenthover();
        }
      }

      // Playground hover (only when not hovering an overlay feature)
      if (!overlayHit) {
        if (playHit && playHit !== lastHoverFeature) {
          lastHoverFeature = playHit;
          debouncedHover(playHit, evt.pixel);
        } else if (!playHit && lastHoverFeature) {
          lastHoverFeature = null;
          debouncedHover.cancel();
          if (onclearhover) onclearhover();
        }
      }
    });

    mapContainer.addEventListener('pointerleave', () => {
      debouncedHover.cancel();
      if (lastEquipHoverFeature) {
        lastEquipHoverFeature = null;
        if (onclearequipmenthover) onclearequipmenthover();
      }
      if (lastHoverFeature) {
        lastHoverFeature = null;
        mapContainer.style.cursor = '';
        if (onclearhover) onclearhover();
      }
    });

    // Publish the polygon source once. Consumers that need to know whether
    // the polygon tier is *visible* read activeTierStore; consumers that
    // only need to read or hydrate features (NearbyPlaygrounds, AppShell
    // hash restore) get a stable reference at any tier.
    playgroundSourceStore.set(polygonSrc);

    // Tier-driven layer visibility. `tier === null` means the orchestrator
    // hasn't run yet — keep all three tier layers hidden.
    tierUnsubscribe = activeTierStore.subscribe(tier => {
      if (!playgroundLayer) return;
      if (tier === null) {
        playgroundLayer.setVisible(false);
        clusterLayer.setVisible(false);
        macroLayer.setVisible(false);
        return;
      }
      // P2: dismiss the popup whenever we leave macro tier.
      if (tier !== 'macro') backendPopup = null;
      playgroundLayer.setVisible(tier === 'polygon');
      clusterLayer.setVisible(tier === 'cluster');
      macroLayer.setVisible(tier === 'macro');
    });
  });

  onDestroy(() => {
    if (overlayUnsubscribe) overlayUnsubscribe();
    if (tierUnsubscribe) tierUnsubscribe();
    if (olMap) {
      olMap.setTarget(undefined);
      mapStore.set(null);
    }
    playgroundSourceStore.set(null);
  });

  // Re-style the playground layer whenever filters change.
  $: if (playgroundLayer) {
    const filters = $filterStore;
    playgroundLayer.setStyle(feature => {
      if (!matchesFilters(feature.getProperties(), filters)) return null;
      return playgroundStyleFn(feature);
    });
  }
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape' && backendPopup) backendPopup = null; }} />
<div bind:this={mapContainer} class="map-container">
  {#if backendPopup}
    <div
      class="backend-popup"
      style="left: {backendPopup.x}px; top: {backendPopup.y}px"
      role="status"
      aria-label="Backend status"
      aria-live="polite"
    >
      <button class="backend-popup-close" on:click={() => backendPopup = null} aria-label="Close">×</button>
      <strong class="backend-popup-name">{backendPopup.name}</strong>
      {#if backendPopup.offline}
        <p class="backend-popup-msg">Backend ist nicht erreichbar. Möglicherweise liegt ein Konfigurationsproblem im Hub oder beim Backend vor.</p>
        <a
          class="backend-popup-link"
          href="https://mfuhrmann.github.io/spieli/ops/troubleshooting/#hub-shows-all-backends-as-red--unreachable"
          target="_blank"
          rel="noopener noreferrer"
        >Troubleshooting →</a>
      {:else}
        <p class="backend-popup-msg">Backend erreichbar, aber keine Spielplatzdaten vorhanden.</p>
        <a
          class="backend-popup-link"
          href="https://mfuhrmann.github.io/spieli/ops/troubleshooting/#hub-shows-a-backend-as-reachable-but-with-0-playgrounds"
          target="_blank"
          rel="noopener noreferrer"
        >Troubleshooting →</a>
      {/if}
    </div>
  {/if}
</div>

<style>
  .map-container {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
  }

  .backend-popup {
    position: absolute;
    z-index: 200;
    transform: translate(-50%, calc(-100% - 12px));
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    padding: 12px 14px 10px;
    width: 240px;
    font-size: 13px;
    line-height: 1.4;
    pointer-events: all;
  }

  .backend-popup-close {
    position: absolute;
    top: 6px;
    right: 8px;
    background: none;
    border: none;
    font-size: 16px;
    line-height: 1;
    color: #6b7280;
    cursor: pointer;
    padding: 0 2px;
  }

  .backend-popup-close:hover {
    color: #111827;
  }

  .backend-popup-name {
    display: block;
    font-size: 14px;
    margin-bottom: 5px;
    padding-right: 16px;
    color: #111827;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .backend-popup-msg {
    margin: 0 0 8px;
    color: #374151;
  }

  .backend-popup-link {
    color: #2563eb;
    text-decoration: none;
    font-weight: 500;
  }

  .backend-popup-link:hover {
    text-decoration: underline;
  }

  /* Custom scale line styling - bottom left, minimal */
  :global(.custom-scale-line) {
    position: absolute;
    bottom: 24px;
    left: 10px;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    color: #333;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }

  :global(.custom-scale-line .ol-scale-line-inner) {
    border: 1px solid #333;
    border-top: none;
    color: #333;
    font-size: 11px;
    text-align: center;
  }

  /* Attribution styling - bottom right, minimal */
  :global(.ol-attribution) {
    position: absolute;
    bottom: 4px;
    right: 4px;
    background: rgba(255, 255, 255, 0.7);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
  }

  :global(.ol-attribution ul) {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  :global(.ol-attribution li) {
    display: inline;
  }

  :global(.ol-attribution button) {
    display: none;
  }
</style>
