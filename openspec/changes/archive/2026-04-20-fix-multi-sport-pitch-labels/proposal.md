## Why

OSM pitches can carry multiple sport values in a single semicolon-separated tag (e.g. `sport=cycling;bmx;skateboard`). The equipment list in `EquipmentList.svelte` looks up the sport value as a single i18n key, so multi-value tags produce a raw, unformatted fallback string as the list label instead of a readable name. Additionally, several common sport values (`cycling`, `kick_scooter`, `roller_skating`, etc.) are missing from the locale files entirely, so even single-value tags for those sports fall back to the raw OSM string.

## What Changes

- `EquipmentList.svelte`: split `sport` on `;`, translate each value individually using existing `equipment.pitches.*` keys, join translated labels with ` / `
- `locales/en.json` + `locales/de.json`: add missing common sport keys (`cycling`, `kick_scooter`, `roller_skating`, `hockey`, `athletics`, and others)
- `docs/contributing/add-sport-type.md`: new guide documenting how to add support for a new sport type in the future (mirrors the existing `add-device.md` pattern)

## Capabilities

### New Capabilities

- `multi-sport-label-rendering`: Correct rendering of pitch list labels when the `sport` tag contains multiple semicolon-separated values
- `sport-contributing-guide`: Developer documentation for adding new sport pitch types

### Modified Capabilities

- none

## Impact

- `app/src/components/EquipmentList.svelte` — label derivation logic for `pitchFeatures`
- `locales/en.json`, `locales/de.json` — new keys under `equipment.pitches`
- `docs/contributing/add-sport-type.md` — new file
- No API, DB, or breaking changes
