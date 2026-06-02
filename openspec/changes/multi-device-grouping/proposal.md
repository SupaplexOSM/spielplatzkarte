## Why

Playground constructions often consist of multiple physically connected devices (a platform, a climbing slope, a rope) that are mapped as separate OSM nodes/ways but represent a single piece of equipment. Today the app lists each component separately, producing an inflated and confusing equipment list. When a mapper wraps the structure in a `playground=structure` way, the app should recognize it as one device.

## What Changes

- Detect `playground=structure` polygon ways in the equipment feature list and treat them as group containers.
- Devices spatially contained within a structure polygon are presented as components of that structure, not as standalone list items.
- The equipment list renders a structure as one expandable entry with its components listed underneath.
- The map layer shows only the structure itself; component dots are suppressed.
- The photo viewer for a structure aggregates Panoramax photos from all components into a single shared strip (Option B).
- Playgrounds not mapped with a structure wrapper are unaffected (current flat-list behavior is preserved).

## Capabilities

### New Capabilities

- `equipment-grouping`: Detecting and grouping playground devices that belong to a `playground=structure` container, both in the equipment list and on the map layer.

### Modified Capabilities

<!-- none — existing flat-list behavior is unchanged for non-grouped devices -->

## Impact

- `app/src/components/EquipmentList.svelte` — new group rendering path
- `app/src/components/PlaygroundPanel.svelte` — grouping logic after equipment fetch
- `app/src/lib/vectorStyles.js` — suppress sub-device dots for grouped features
- `app/src/stores/overlayLayer.js` — may need to carry group membership metadata
- No backend / API changes required
- No new npm dependencies required (plain GeoJSON ray-casting, no turf.js)
