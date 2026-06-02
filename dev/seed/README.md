# Dev Fixture Database

`seed.sql` is a self-contained PostgreSQL dump with 4 sample playgrounds from
Fulda/Hessen. It lets you spin up the full app stack locally without running the
time-consuming OSM import (`make import`).

## Included data

| OSM ID      | Name                              |
|-------------|-----------------------------------|
| 37808214    | Grezzbachpark                     |
| 165956764   | Bewegungspark Fuldaaue            |
| 818585707   | Spielplatz Carl-Schurz-Straße II  |
| 26796507    | (unnamed playground)              |

Region polygon: Hessen (OSM relation 62700, `osm_id = -62700`)

Also includes all OSM points and lines within 100 m of each playground
(~207 points, ~254 lines) so that equipment and POI queries work correctly.

## Usage

```bash
# 1. Start only the database container
docker compose up -d db

# 2. Load the fixture (replaces any existing data)
make seed-load

# 3. Start the rest of the stack
docker compose up -d

# 4. Open the app
#    The app reads OSM_RELATION_ID from .env — set it to 62700 to match the seed:
#    echo "OSM_RELATION_ID=62700" >> .env
```

The seed is idempotent: `make seed-load` truncates the three OSM tables before
inserting the fixture rows, so it is safe to run on a populated DB. Any
previously imported OSM data will be replaced by the 4 sample playgrounds.

## Updating the seed

The seed is regenerated from a live Hessen import. Run this when the playground
data or API schema changes significantly:

```bash
# Requires a running DB with a full Hessen import (make import)
make seed-extract
```

This calls `dev/seed/extract.sh`, which:

1. Dumps the CREATE TABLE/INDEX DDL for the three osm2pgsql tables
2. Exports the 4 playgrounds + region polygon from `planet_osm_polygon`
3. Exports all points/lines within 100 m of those playgrounds
4. Appends `importer/api.sql` with `OSM_RELATION_ID` replaced by `62700`

Commit the updated `seed.sql` and open a PR.
