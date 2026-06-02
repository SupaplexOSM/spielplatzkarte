## Context

`get_equipment` returns a flat GeoJSON FeatureCollection containing all `playground=*` nodes, lines, and polygon ways within a playground's bounding box. This includes `playground=structure` polygon ways and their spatially-contained sub-devices, which today all render as separate list rows and separate dots on the map layer.

`EquipmentList.svelte` renders devices from a flat `features[]` prop. `PlaygroundPanel.svelte` fetches equipment and writes it to `overlayFeaturesStore`, which `Map.svelte` reads to drive the equipment layer.

The `PanoramaxViewer` component already accepts a `uuids[]` array and renders a thumbnail strip — it requires no changes.

## Goals / Non-Goals

**Goals:**
- Group devices spatially contained within a `playground=structure` polygon into a single list entry with expandable components.
- Suppress component dots from the map layer; show only the structure polygon.
- Aggregate component Panoramax UUIDs into one shared photo strip on the structure entry.
- Leave flat-list behavior untouched for playgrounds with no structure polygons.

**Non-Goals:**
- Case 2 grouping (connected devices without a wrapper way) — requires OSM topology data not in the current API; deferred.
- Backend / API changes.
- New npm dependencies.

## Decisions

### Where grouping runs — PlaygroundPanel, not EquipmentList

Grouping runs in `PlaygroundPanel.svelte` immediately after the equipment fetch, producing a structured `{ groups, standalone }` result. `EquipmentList` receives this pre-grouped data rather than doing the geometry math itself.

**Why:** `PlaygroundPanel` is also the source of `overlayFeaturesStore`, so it has a single place to tag sub-device features with a `_groupId` before handing them to the map layer. Doing it in `EquipmentList` would require duplicating the logic or a second pass.

### Containment algorithm — frontend ray-casting on GeoJSON coordinates

Point-in-polygon check using standard ray-casting against the structure polygon's GeoJSON coordinate ring. For linestring/polygon sub-devices, use the feature's first coordinate (or centroid approximation).

**Why over turf.js:** No new dependency. The structures involved are small convex-ish polygons; precision edge cases don't matter. If coordinates of a device fall clearly outside the ring, it's not part of the structure.

**Alternative considered:** PostGIS `ST_Within` in `api.sql`. Ruled out to keep this a frontend-only prototype without DB changes.

### Passing grouped data to EquipmentList — new props shape

`EquipmentList` gains two new optional props: `groups` (array of `{structure, children}`) and keeps existing `features` for standalone devices. Existing callers pass only `features`; the component renders groups first, then standalones.

**Why:** Avoids a breaking change to the component's existing flat-list path. Gradual enhancement.

### Sub-device suppression on the map — `_groupId` flag in overlayFeaturesStore

`PlaygroundPanel` tags each sub-device feature with `_groupId = <structure osm_id>` before writing to `overlayFeaturesStore`. `equipmentLayerStyleFn` in `vectorStyles.js` returns `null` style for features where `_groupId` is set.

**Why null style over filtering:** OL style functions returning `null` hide features without requiring a separate filtered source. Simpler than maintaining two sources.

### Photo aggregation — collect at group render time, pass to PanoramaxViewer

When rendering a group in `EquipmentList`, collect `panoramax` tag values from all children into a single UUID array and pass to `PanoramaxViewer`. Structure's own `panoramax` tag is included first if present.

**Why Option B (pooled) over Option A (per-device):** Not every component will have a photo; a pooled strip avoids empty rows and matches how `PanoramaxViewer` already works.

## Risks / Trade-offs

- **Bbox overlap false positives**: A device near a structure's bbox boundary that isn't actually inside the polygon could pass a loose check. Ray-casting on the actual polygon ring avoids this — only true geometric containment qualifies.
- **Partial mapping**: A playground with some components inside a structure polygon and others outside will show a mixed list (some grouped, some standalone). This is intentional and correct behavior.
- **`_groupId` is a client-side mutation** on the GeoJSON features: keeps implementation simple but means features must not be shared across renders without cloning. Currently `PlaygroundPanel` always refetches on playground change, so there's no stale mutation risk.

## Open Questions

- Should the structure entry show a component count badge (e.g., "Spielstruktur · 3 Teile") even when collapsed?
- When a structure polygon is hovered on the map, should the tooltip show the structure name or the component list?
