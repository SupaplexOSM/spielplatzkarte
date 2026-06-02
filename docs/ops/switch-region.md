# Switching regions

This guide covers changing the geographic coverage of a running spieli instance — for example, switching from a Landkreis to a full Bundesland, or expanding to all of Germany.

The process requires a full database re-import. Plan for downtime proportional to the size of the new extract (see [Import duration](#import-duration)).

## 1. Find the new relation ID and PBF extract

**OSM relation ID** — search on [Nominatim](https://nominatim.openstreetmap.org). The relation ID appears in the URL: `openstreetmap.org/relation/51477` → ID is `51477`.

**PBF extract** — browse [download.geofabrik.de](https://download.geofabrik.de) for an extract that covers your target region. The extract only needs to *contain* your region — a country extract works fine for a single Bundesland.

Common extracts:

| Coverage | URL |
|---|---|
| Germany | `https://download.geofabrik.de/europe/germany-latest.osm.pbf` |
| Baden-Württemberg | `https://download.geofabrik.de/europe/germany/baden-wuerttemberg-latest.osm.pbf` |
| Bayern | `https://download.geofabrik.de/europe/germany/bayern-latest.osm.pbf` |
| Hessen | `https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf` |
| NRW | `https://download.geofabrik.de/europe/germany/nordrhein-westfalen-latest.osm.pbf` |

## 2. Update `.env`

Edit `~/spieli/.env` and change the two region-specific lines:

```env
OSM_RELATION_ID=51477
PBF_URL=https://download.geofabrik.de/europe/germany-latest.osm.pbf
```

## 3. Wipe the database and re-import

**Warning:** This permanently deletes all existing playground data. The import re-downloads the PBF and rebuilds the database from scratch.

```bash
cd ~/spieli

# Stop the stack
docker compose --profile data-node-ui down

# Delete the database and cached PBF
docker volume rm spieli_pgdata spieli_pbf_cache

# Start the stack (initialises a fresh database)
docker compose --profile data-node-ui up -d

# Run the importer
docker compose run --rm importer
```

The app will return empty responses until the import finishes.

## Import duration

Import time scales with extract size and available CPU/RAM:

| Extract | PBF size | Approximate duration |
|---|---|---|
| Landkreis (via Bundesland extract) | 0.2–1 GB | 5–20 min |
| Bundesland | 0.5–2 GB | 10–40 min |
| Germany | ~4.5 GB | 1–3 h |

Increase `OSM2PGSQL_THREADS` in `.env` to speed up the import on multi-core servers.

## After the import

The app picks up the new data automatically — no restart needed. Verify with:

```bash
curl -s https://yourdomain.example.com/api/rpc/get_meta | python3 -m json.tool
```

The `playground_count` and `bbox` fields should reflect the new region.
