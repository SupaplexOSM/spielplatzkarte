# Data quality (Datenqualität)

Every playground is assigned one of three data-quality states based on how thoroughly it is documented in OpenStreetMap. The state is computed from a fixed set of OSM tag criteria — it is not a universal mapping standard but a practical indicator for the tags that make a playground entry most useful to visitors.

The label key `completeness.label` (`"Datenqualität"` / `"Data quality"`) can be used wherever the concept needs a heading.

## Criteria

Three independent criteria are evaluated per playground:

| Criterion | Satisfied when |
|---|---|
| **hasPhoto** | At least one `panoramax` or `panoramax:*` tag is present |
| **hasEquipment** | At least one mapped piece of equipment exists inside the playground (devices, benches, pitches, fitness stations, etc.) |
| **hasInfo** | Any one of `opening_hours`, `surface`, or `access` (with a value other than `yes`) is present |

Each criterion is satisfied by the presence of **any** qualifying tag — `hasInfo` does not require all three tags.

## States

| State | Rule | Color |
|---|---|---|
| `complete` | All three criteria satisfied | Green |
| `partial` | At least one criterion satisfied | Orange |
| `missing` | No criteria satisfied | Red |

## Implementation

The logic is maintained in two mirrored places that must stay in sync:

- **Frontend**: `app/src/lib/completeness.js` — `playgroundCompleteness(props)`
- **Database**: `importer/api.sql`, CTE `completeness_attrs` (around line 110) — used to populate the `playground_stats` materialized view

Run `make db-apply` after changing the SQL definition to rebuild the materialized view.

## Locale keys

All UI strings live under the `completeness.*` namespace in `locales/de.json` and `locales/en.json` (repo root).

| Key | DE | EN |
|---|---|---|
| `completeness.legendTitle` | Datenqualität | Data Quality |
| `completeness.complete` | hoch | high |
| `completeness.partial` | mittel | medium |
| `completeness.missing` | niedrig | low |
| `completeness.dotComplete` | Daten vollständig | Data complete |
| `completeness.dotPartial` | Teilweise erfasst | Partially mapped |
| `completeness.dotMissing` | Daten fehlen | No data |
| `completeness.restrictedHint` | nicht öffentlich | not public |
