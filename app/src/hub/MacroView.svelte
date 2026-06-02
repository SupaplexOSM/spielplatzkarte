<script>
  // Country-level macro view (P2 §5).
  //
  // Subscribes to the backends store and rebuilds one Point feature per
  // backend at the backend's bbox centroid, with ring properties
  // (count + completeness) sourced from each backend's cached `get_meta`
  // response. The resulting features live in `source` and are styled by
  // `macroRingStyleFn` (registered on `macroLayer` in Map.svelte).
  //
  // The orchestrator is what *decides* whether the macro layer is visible —
  // this component just keeps the source contents in sync so a tier toggle
  // shows the latest data without a fetch round-trip. Cost: one O(N)
  // rebuild per backends-store update (poll every 5 min + initial load).
  //
  // Pre-P1 backends ship `get_meta` without the `complete/partial/missing`
  // extension. Their entries arrive with `completeness: null`; we render
  // those as a flat gray ring (everything in the "restricted" segment) so
  // the operator sees "data quality unknown" rather than a misleading
  // healthy-but-empty zero ring.
  //
  // Offline backends are flagged on the feature; the renderer branches to a
  // dashed outline + "offline" label. Health currently comes from the
  // federationHealth stub (always healthy) — the same wiring applies once
  // `add-federation-health-exposition` lands the real signal.

  import { onDestroy } from 'svelte';
  import Feature from 'ol/Feature.js';
  import Point from 'ol/geom/Point.js';
  import { transform } from 'ol/proj.js';
  import { isBackendHealthy } from './federationHealth.js';
  import { bboxCentroid } from './centroid.js';

  /** @type {import('svelte/store').Readable<Array>} */
  export let backends;
  /** @type {import('ol/source/Vector.js').default} */
  export let source;

  function buildFeature(backend) {
    const centroid = bboxCentroid(backend.bbox) ?? backend.nominalCentroid ?? null;
    if (!centroid) return null;
    const offline   = !isBackendHealthy(backend);
    const importing = !offline && (backend.importing ?? false);
    // Pre-P1 backends → unknown completeness; map the count into the
    // restricted bucket so the renderer draws a flat gray ring.
    const c     = backend.completeness;
    const count = backend.playgroundCount ?? 0;
    const degraded = !offline && !importing && count === 0;
    const props = c
      ? {
          count,
          complete:   c.complete,
          partial:    c.partial,
          missing:    c.missing,
          restricted: 0,
        }
      : {
          count,
          complete:   0,
          partial:    0,
          missing:    0,
          restricted: count,
        };
    return new Feature({
      geometry: new Point(transform(centroid, 'EPSG:4326', 'EPSG:3857')),
      _tier:        'macro',
      _backendUrl:  backend.url,
      _backendSlug: backend.slug ?? null,
      _bbox:        backend.bbox,
      _offline:     offline,
      _importing:   importing,
      _degraded:    degraded,
      _name:        backend.name ?? backend.region ?? backend.slug ?? backend.url,
      ...props,
    });
  }

  // Rebuild on every store update. Backends typically change shape twice
  // per session (initial load + 5-min poll) and number <20, so a full
  // clear+addFeatures is well below any perceptible cost.
  const detach = backends.subscribe(($backends) => {
    if (!source) return;
    const features = $backends
      .map(buildFeature)
      .filter(Boolean);
    source.clear();
    source.addFeatures(features);
  });

  onDestroy(() => {
    detach();
    if (source) source.clear();
  });
</script>
