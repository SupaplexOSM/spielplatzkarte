# Glossary

OSM-specific terms you'll encounter when working with this project.

## OSM relation ID

Every city, district, or region in OpenStreetMap has a numeric ID called a **relation ID**. spieli uses this ID to know which geographic area to show on the map.

To find the relation ID for your region: search on [Nominatim](https://nominatim.openstreetmap.org) or [openstreetmap.org](https://openstreetmap.org) — it appears in the URL, e.g. `openstreetmap.org/relation/62700` → ID is `62700`.

## PBF file

A **PBF file** (Protocolbuffer Binary Format) is a compressed snapshot of OpenStreetMap data for a geographic region. Geofabrik publishes regularly-updated PBF extracts at [download.geofabrik.de](https://download.geofabrik.de).

The importer reads a PBF file to populate the database. The file only needs to *contain* your region — a Bundesland extract works for a single Kreis within it.

## osm2pgsql

**osm2pgsql** is the tool that reads a PBF file and imports the OSM data into PostgreSQL. You run it via `make import` to load data for the first time, and again whenever you want to refresh from a newer Geofabrik extract.

More: [osm2pgsql.org](https://osm2pgsql.org)

## PostgREST

**PostgREST** is a server that automatically turns a PostgreSQL database into a REST API. Instead of writing server-side code, you write SQL functions and PostgREST exposes them as HTTP endpoints. spieli's entire API layer is PostgREST — there is no custom backend application server.

More: [postgrest.org](https://postgrest.org)

## Data Quality indicator

Each playground carries a **Data Quality** badge whose colour reflects how completely it has been mapped in OpenStreetMap:

| Colour | Legend label | Meaning |
|--------|-------------|---------|
| Green  | hoch / high   | Photos, a name, and at least one detail (equipment, surface, …) are present |
| Yellow | mittel / medium | At least one of the above is present, but not all |
| Red    | niedrig / low  | None of the above — the playground exists in OSM but has no additional data |

The map legend is headed "Datenqualität" / "Data Quality" and uses short scale labels (hoch / mittel / niedrig). The panel badge also reads "Datenqualität" / "Data Quality" in the matching colour. The same three-state breakdown is used in cluster rings and the federation macro view.

Internally, the three states are referred to as `complete`, `partial`, and `missing`. These values appear in the API responses (see [`api.md`](api.md)) and in the database (`playground_stats` materialised view). The display label is intentionally kept neutral — it describes *what* is shown, not a judgement.

## Overpass Turbo

**Overpass Turbo** ([overpass-turbo.eu](https://overpass-turbo.eu)) is a web tool for running ad-hoc queries against live OpenStreetMap data. It is useful when adding support for a new device type — you can search for `playground=<tag>` to find real playgrounds that have the device mapped and use them for testing.
