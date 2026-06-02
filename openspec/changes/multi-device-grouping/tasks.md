## 1. Grouping Logic

- [x] 1.1 Write `groupEquipment(features)` utility function — separates `playground=structure` polygon features from all others, runs point-in-polygon containment check (ray-casting on GeoJSON coordinates), returns `{ groups: [{structure, children}], standalone: Feature[] }`
- [x] 1.2 Add unit test for `groupEquipment`: device inside polygon → grouped; device outside → standalone; no structure polygons → all standalone
- [x] 1.3 Call `groupEquipment` in `PlaygroundPanel.svelte` after the equipment fetch; tag each sub-device feature with `_groupId = structure.properties.osm_id` before writing to `overlayFeaturesStore`

## 2. Map Layer

- [x] 2.1 In `vectorStyles.js` `equipmentLayerStyleFn`, return `null` for features where `properties._groupId` is set (suppresses sub-device dots)
- [ ] 2.2 Verify in the browser that structure polygons still render and sub-device dots are hidden

## 3. Equipment List — Group Rendering

- [x] 3.1 Add `groups` prop to `EquipmentList.svelte` (array of `{structure, children}`); render groups before standalone devices
- [x] 3.2 Render each group as a collapsible entry showing structure name + component count badge when collapsed (e.g., "Spielstruktur · 3 Teile")
- [x] 3.3 When expanded, list each child device name as a sub-row beneath the structure header
- [x] 3.4 Pass grouped data from `PlaygroundPanel.svelte` to `EquipmentList` via the new `groups` prop

## 4. Photo Viewer Integration

- [x] 4.1 When rendering a group entry in `EquipmentList`, collect `panoramax` tag values from the structure and all children into a single UUID array (structure first, then children in order)
- [x] 4.2 Pass the aggregated UUID array to `PanoramaxViewer` inside the expanded group — verify multi-photo thumbnail strip works correctly
- [x] 4.3 Verify that components with no `panoramax` tag are silently skipped and show no empty slot

## 5. Edge Cases & Polish

- [x] 5.1 Handle structure with zero contained components: render as a standalone device entry (no grouping UI, no component list)
- [ ] 5.2 Verify flat-list behavior is fully unchanged for playgrounds with no `playground=structure` features
- [ ] 5.3 Test with a real mapped structure from OSM (way/1498338233 or similar) via `make dev` with Overpass fallback
