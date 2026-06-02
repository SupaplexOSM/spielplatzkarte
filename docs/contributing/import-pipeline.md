# Import Pipeline

This guide explains how OSM data flows from a Geofabrik PBF extract into the PostgreSQL database. It is aimed at contributors who want to add new OSM data types or change how existing data is processed.

## Overview

```
Geofabrik PBF (~300 MB Bundesland extract)
        │
        ▼  osmium extract (bbox clip — Nominatim lookup or OSM_BBOX override)
Bbox-clipped PBF (~5–20 MB)
        │
        ▼  osmium tags-filter
Tag-filtered PBF (~1–5 MB)
        │
        ▼  osm2pgsql --slim --drop --hstore
        │  (default pgsql output — no Lua script)
        │
        ▼  PostgreSQL tables (EPSG:3857)
        │   planet_osm_point    — OSM nodes
        │   planet_osm_polygon  — closed ways and relations as polygons
        │
        ▼  api.sql applied by import.sh
        │   ALTER SYSTEM (pg tuning)
        │   DROP + CREATE MATERIALIZED VIEW playground_stats
        │   CREATE/REPLACE api schema functions
        │
        ▼  PostgREST /api/rpc/* endpoints
```

The pipeline is driven by `importer/import.sh`, which is the `CMD` of the importer Docker image (`importer/Dockerfile`).

## osm2pgsql and the hstore schema

osm2pgsql runs in its default **pgsql output mode** — no Lua flex script is involved. It imports the filtered PBF into standard tables (`planet_osm_point`, `planet_osm_polygon`), all in EPSG:3857.

A fixed set of common OSM keys get their own columns (`name`, `operator`, `access`, `surface`, `leisure`, `amenity`, `sport`, `natural`, `highway`, …). Every other tag is stored as a key→value pair in the `tags` **hstore** column. The `--hstore` flag enables this.

All application logic (computing completeness, deriving filter flags, building cluster counts) lives in `importer/api.sql`, which queries these standard tables.

### Adding a new attribute to an existing object type

Two distinct cases:

**The object type is already imported** (e.g. adding a new attribute to playground equipment nodes, which are already in the filter as `n/playground`):

1. The tag value is already in the `tags` hstore — access it with `tags->'my_tag'` in `importer/api.sql`.
2. Run `make db-apply` to apply the SQL change (no re-import needed).

**The tag is used on a new object type not yet in the filter** (e.g. `amenity=drinking_water`):

1. Add the tag to the `osmium tags-filter` list in `importer/import.sh`. Otherwise the importer silently discards those objects.
2. In `importer/api.sql`, add or extend a function to read the new data. Use `tags->'my_tag'` for hstore values or the named column for common keys.
3. Run `make import` — the tag filter change requires a full re-import.

### Adding a new OSM object type

1. Add its tag to the `osmium tags-filter` list in `importer/import.sh`.
2. In `importer/api.sql`, add a new PostgREST function that queries `planet_osm_point` or `planet_osm_polygon` (depending on geometry type). Follow the pattern of existing functions.
3. Expose it: `GRANT EXECUTE ON FUNCTION api.your_function(...) TO web_anon;`
4. Run `make import` to load the data. Use `make db-apply` for subsequent SQL-only iterations.

> **Testing**: there are no SQL unit tests. Verify changes with a real import (`make import`) against a region that has the relevant data, then check the feature appears correctly in the UI.

## The tag filter (`importer/import.sh`)

Before osm2pgsql runs, `osmium tags-filter` keeps only objects with tags the app actually queries. This is a performance optimisation — a Bundesland PBF goes from ~300 MB to ~1–5 MB. The current filter passes:

- `leisure=playground`, `leisure=pitch`, `leisure=fitness_station`, `leisure=picnic_table`
- `amenity=bench`, `amenity=shelter`, `amenity=toilets`, `amenity=ice_cream`, `amenity=cafe`, `amenity=restaurant`
- `natural=tree`, `natural=tree_row`, `playground=*`
- `highway=bus_stop`, `shop=chemist/supermarket/convenience`, `emergency=*`
- `boundary=administrative`, `type=multipolygon`

**If you add a new OSM object type**, add its tag to this filter — otherwise the importer will silently discard those objects.

## The `playground_stats` materialised view

The most important post-import step in `importer/api.sql` is building the `playground_stats` materialized view. It pre-computes per-playground statistics (tree count, bench count, sport types, completeness state) so `get_playgrounds_bbox` is a fast indexed lookup rather than an aggregation query.

It is built entirely from the standard osm2pgsql tables:

- Playground polygons and nodes come from `planet_osm_polygon` (`leisure = 'playground'`) and `planet_osm_point`.
- Equipment and trees are joined from `planet_osm_point` and `planet_osm_polygon` using spatial containment (`ST_Intersects` / `ST_DWithin`).
- Less common tags (e.g. `panoramax`, `opening_hours`) are read from the `tags` hstore column.

The completeness logic in `api.sql` must stay in sync with `app/src/lib/completeness.js` in the frontend. Both implement the same rule:

| Criterion | SQL (api.sql) | JS (completeness.js) |
|---|---|---|
| Has photo | `tags` contains key `panoramax` or a key starting with `panoramax:` | `Object.keys(props).some(k => k.startsWith('panoramax'))` |
| Has name | `name IS NOT NULL` (`name` is a dedicated column) | `!!props.name` |
| Has info | `surface` set, or `access` set and not `'yes'`, or `opening_hours` set | `!!(props.surface \|\| …)` |

Note: `operator` is present in the JS completeness check but intentionally absent from the SQL criterion — the SQL view was narrowed to attributes that directly inform a parent's visit decision.

- `complete` = all three present
- `partial` = at least one present
- `missing` = none present

**If you change the completeness criteria**, update both files and rebuild the materialised view with `make db-apply`.

## Filter flags (`for_baby`, `for_toddler`, `is_water`, …)

Several boolean columns in `playground_stats` are computed from equipment found inside each playground polygon. They drive both the filter UI and the `filter_attrs` payload in the cluster RPC.

| Flag | Triggers |
|---|---|
| `for_baby` | `baby=yes` on any equipment; `playground` ∈ `baby_swing`, `basketswing`, `sandpit`, `springy`; `capacity:baby` present |
| `for_toddler` | `provided_for:toddler=yes` on any equipment; `playground=basketswing` |
| `is_water` | `playground` contains `water` or ∈ `splash_pad`, `pump` |
| `for_wheelchair` | `wheelchair=yes` on any equipment |
| `has_soccer` / `has_basketball` | `leisure=pitch` with matching `sport` value |

All flag logic lives in `importer/api.sql` (the `equip_stats` CTE inside `playground_stats`).

**If you add a new flag**, add it to `playground_stats` in `api.sql` and run `make db-apply`. A full `make import` is only needed if the new flag depends on a tag not yet in the tag filter.

> **Testing**: verify with a real import against a region that has playgrounds with the relevant equipment, then check the filter chip appears correctly in the UI.

## Applying schema changes without a full re-import

`make db-apply` runs only the `api.sql` step (skips the osm2pgsql data load). Use it when:
- You added or changed a PostgREST function
- You changed the `playground_stats` view definition
- You added a new filter flag

Do a full `make import` when you changed the tag filter (new object types needed in the PBF) — these affect which objects are stored in `planet_osm_*` tables.

## See also

- [API Reference](../reference/api.md) — PostgREST function signatures
- [Local Development](local-dev.md) — how to test changes quickly with seed data
- [Source Tree Analysis](../source-tree-analysis.md) — where all the files live
