## Context

Pitch features in `EquipmentList.svelte` derive a display label by passing the raw `sport` property directly as an i18n key suffix. OSM allows semicolon-separated multi-values on any tag, so `sport=cycling;bmx;skateboard` is valid data. The current code treats the whole string as a single key, fails to find it, and falls back to rendering the raw value — which breaks the list layout.

The fix is entirely within the frontend label derivation and the locale files. No API, DB, or style changes are needed.

## Goals / Non-Goals

**Goals:**
- Render multi-value `sport` tags as a readable joined string (e.g. `"BMX track / Skate park"`)
- Add missing common sport keys to both locale files
- Provide a contributor guide for adding new sport types in the future

**Non-Goals:**
- Changing how `equipmentAttributes.js` renders the detail panel (it already splits on `;` correctly)
- Adding every possible OSM sport value — only the most common ones that appear in the wild on playgrounds/skate areas

## Decisions

**D1 — Split on `;`, translate each part, join with ` / `**

In `EquipmentList.svelte`, replace the single-key lookup with:
```js
const parts = sport ? sport.split(';') : [];
const label = parts.length
  ? parts.map(s => $_('equipment.pitches.' + s.trim(),
      { default: s.trim() })).join(' / ')
  : $_('equipment.pitchDefault');
```
When a sport key is unknown the raw value is used as-is (same as current single-value fallback). This is graceful — new OSM sport values won't break the UI.

Alternatives considered:
- Generic "Multi-sport area" label when `;` is present — loses specificity; poor UX when only 2 known sports are involved
- Look up a combined key like `skateboard_bmx` — combinatorial explosion, unmaintainable

**D2 — Add sport keys for: `cycling`, `kick_scooter`, `roller_skating`, `hockey`, `athletics`, `baseball`, `cricket`, `rugby`, `archery`, `golf`, `gymnastics`**

These are the most frequently mapped OSM sport values that don't yet have translations. Chosen by checking OSM tag usage stats for `leisure=pitch` combinations common in Central Europe.

**D3 — New doc file `docs/contributing/add-sport-type.md`**

Mirrors the existing `docs/contributing/add-device.md` structure: step-by-step, with OSM wiki links, a local verification command, and a commit/PR template. Lives alongside the existing guide for discoverability.

## Risks / Trade-offs

- [Risk] A sport value containing `;` in ways other than list separation → very rare in OSM; the split-and-join approach handles it gracefully (raw value shown for unrecognised segments)
- [Trade-off] Showing raw values for unknown sports is slightly inconsistent with translated ones — acceptable until those keys are added; the contributing guide makes adding them easy
