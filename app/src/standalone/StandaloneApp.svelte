<script>
  import { onMount, onDestroy } from 'svelte';
  import { readable, get } from 'svelte/store';
  import VectorSource from 'ol/source/Vector.js';
  import { Vector as VectorLayer } from 'ol/layer.js';
  import GeoJSON from 'ol/format/GeoJSON.js';
  import { transformExtent } from 'ol/proj';

  import AppShell from '../components/AppShell.svelte';
  import {
    apiBaseUrl,
    osmRelationId,
    regionChatUrl,
  } from '../lib/config.js';
  import {
    fetchNearestPlaygrounds,
    fetchStandaloneEquipment,
  } from '../lib/api.js';
  import { fetchRegionInfo } from '../lib/region.js';
  import { parseHash } from '../lib/deeplink.js';
  import { attachTieredOrchestrator } from '../lib/tieredOrchestrator.js';
  import { equipmentLayerStyleFn } from '../lib/vectorStyles.js';
  import { debounce } from '../lib/utils.js';
  import { mapStore } from '../stores/map.js';
  import { filterStore } from '../stores/filters.js';
  import { activeTierStore } from '../stores/tier.js';
  import { selection } from '../stores/selection.js';

  // Standalone owns two VectorSources — one per tier. The orchestrator
  // populates the active one on every debounced moveend; Map.svelte toggles
  // layer visibility from activeTierStore.
  const playgroundSource = new VectorSource(); // polygon tier (zoom > clusterMaxZoom)
  const clusterSource    = new VectorSource(); // cluster tier (zoom ≤ clusterMaxZoom)
  let detachOrchestrator = null;
  let clusterFilterFingerprint = '';

  // Deselect the playground when the user zooms out past the cluster threshold.
  let prevTier = null;
  const detachTierDeselect = activeTierStore.subscribe(tier => {
    if (prevTier === 'polygon' && tier === 'cluster') selection.clear();
    prevTier = tier;
  });

  // Standalone pitches (leisure=pitch outside any playground) — own layer,
  // attached to the map when it becomes available and refreshed on moveend.
  const PITCH_MIN_ZOOM = 12;
  let pitchLayer = null;
  let detachPitchLayer = null;
  let detachMapSub = null;
  let regionFitTimer = null;
  let detachRegionFitWatcher = null;

  // Readable store of the current map view in WGS84 for Nominatim `viewbox`.
  // Subscribes to the map's `moveend` when the map becomes available and
  // re-emits the bounds each time the user pans or zooms.
  const searchExtent = readable(null, (set) => {
    let detach = null;
    const unsub = mapStore.subscribe((map) => {
      if (detach) { detach(); detach = null; }
      if (!map) return;
      const update = () => {
        const size = map.getSize();
        if (!size) return;
        set(transformExtent(map.getView().calculateExtent(size), 'EPSG:3857', 'EPSG:4326'));
      };
      map.on('moveend', update);
      detach = () => map.un('moveend', update);
      update();
    });
    return () => {
      if (detach) detach();
      unsub();
    };
  });

  // Single-backend PostgREST call. Null in local-dev (no API) so
  // NearbyPlaygrounds falls back to a distance scan of the loaded source.
  const nearestFetcher = apiBaseUrl
    ? (lat, lon) => fetchNearestPlaygrounds(lat, lon, apiBaseUrl)
    : null;

  const dataContribLinks = {
    chatUrl: regionChatUrl,
  };

  onMount(async () => {
    // Fit to the configured region and attach the pitch layer once the map
    // becomes available (Map.svelte publishes itself via mapStore on mount).
    detachMapSub = mapStore.subscribe(async (map) => {
      if (!map) return;
      detachMapSub?.();
      detachMapSub = null;

      // Region fit via Nominatim bbox. The deeplink hash (if any) is read
      // BEFORE the await so the decision can't be invalidated by anything
      // that mutates window.location.hash while we're waiting on Nominatim.
      const hadDeeplink = parseHash(window.location.hash);
      try {
        const region = await fetchRegionInfo(osmRelationId);
        document.title = `spieli ${region.name}`;
        const regionExtent = transformExtent(region.extent, 'EPSG:4326', 'EPSG:3857');
        const fitToRegion = () => {
          map.getView().fit(regionExtent, {
            padding: [20, 20, 20, 380], // leave room for the side panel on desktop
            duration: 0,
          });
        };
        if (!hadDeeplink) {
          fitToRegion();
        } else {
          // Deeplink hash present — the deeplink expresses explicit user
          // intent that takes precedence over the default region framing,
          // so we don't fit eagerly. But if AppShell.tryRestoreFromHash
          // can't deliver (osm_id 404, hydration error, unknown slug, etc.)
          // no fit ever happens and the user lands on the OL default view.
          // Fall back to the region view after a short delay if no moveend
          // has fired — the deeplink-restore success path always fires one.
          let restored = false;
          const onMove = () => { restored = true; };
          map.once('moveend', onMove);
          detachRegionFitWatcher = () => map.un('moveend', onMove);
          regionFitTimer = setTimeout(() => {
            regionFitTimer = null;
            detachRegionFitWatcher?.();
            detachRegionFitWatcher = null;
            if (!restored) fitToRegion();
          }, 1500);
        }
      } catch (err) {
        console.warn('Nominatim region fetch failed, using default extent:', err);
      }

      // Standalone pitch layer — viewport-scoped, refreshed on moveend.
      const pitchSource = new VectorSource();
      pitchLayer = new VectorLayer({
        source: pitchSource,
        zIndex: 9,
        style: equipmentLayerStyleFn,
        properties: { kind: 'overlay' },
      });
      map.addLayer(pitchLayer);

      const reloadPitches = debounce(async () => {
        const zoom = map.getView().getZoom();
        if (zoom < PITCH_MIN_ZOOM) { pitchSource.clear(); return; }
        const extent = map.getView().calculateExtent(map.getSize());
        try {
          const geojson = await fetchStandaloneEquipment(extent);
          const features = new GeoJSON().readFeatures(geojson, {
            dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857',
          });
          pitchSource.clear();
          pitchSource.addFeatures(features);
        } catch (err) {
          console.warn('Standalone pitch fetch failed:', err);
        }
      }, 300);

      map.on('moveend', reloadPitches);
      detachPitchLayer = () => {
        map.un('moveend', reloadPitches);
        map.removeLayer(pitchLayer);
        pitchLayer = null;
      };

      // Tiered orchestrator: replaces the one-shot region fetch. Picks a
      // tier from the view's zoom on every moveend, fetches the matching
      // RPC, and populates the relevant source. Cancels superseded requests.
      //
      // When apiBaseUrl is empty (local-dev without Docker, see CLAUDE.md
      // "Local dev note") there is no data path — skip the orchestrator so
      // the console isn't spammed with 404s against the Vite dev server.
      if (apiBaseUrl) {
        const orchestrator = attachTieredOrchestrator({
          map,
          baseUrl: apiBaseUrl,
          clusterSource,
          polygonSource: playgroundSource,
          getFilters: () => clusterFilterFingerprint ? JSON.parse(clusterFilterFingerprint) : null,
        });
        detachOrchestrator = orchestrator.detach;

        // Subscribe to filter changes imperatively — avoids Svelte $: dependency-tracking
        // uncertainty for variables set inside async/nested callbacks.
        // Skip the immediate invocation (filters start all-false, orchestrator just ran).
        let filterSubReady = false;
        const unsubFilters = filterStore.subscribe(filters => {
          const { standalonePitches: _sp, ...cf } = filters;
          clusterFilterFingerprint = JSON.stringify(cf);
          if (!filterSubReady) { filterSubReady = true; return; }
          if (get(activeTierStore) === 'cluster') orchestrator.rerun();
        });
        const baseDetach = orchestrator.detach;
        detachOrchestrator = () => { baseDetach(); unsubFilters(); };
      } else {
        console.info('[standalone] apiBaseUrl empty — tiered orchestrator not attached (local dev without Docker)');
      }
    });
  });

  // Toggle pitch-layer visibility from the filter store.
  $: if (pitchLayer) pitchLayer.setVisible($filterStore.standalonePitches);

  onDestroy(() => {
    detachTierDeselect();
    if (detachMapSub)      detachMapSub();
    if (detachPitchLayer)  detachPitchLayer();
    if (detachOrchestrator) detachOrchestrator();
    if (regionFitTimer)    clearTimeout(regionFitTimer);
    if (detachRegionFitWatcher) detachRegionFitWatcher();
  });
</script>

<AppShell
  {playgroundSource}
  {clusterSource}
  {searchExtent}
  {nearestFetcher}
  {dataContribLinks}
  defaultBackendUrl={apiBaseUrl}
/>
