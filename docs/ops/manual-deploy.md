# Manual Deploy (from source)

Use this path if you want to build the images yourself or run from a local clone. For most deployments the [Quick Start](../getting-started/quick-start.md) installer is simpler.

## Requirements

- [Node.js](https://nodejs.org/) v18 or newer
- Docker with the Compose plugin
- `git`

## Step 1 — Find your region's OSM relation ID

Search for your city, Kreis, or district on [Nominatim](https://nominatim.openstreetmap.org) or [openstreetmap.org](https://openstreetmap.org). The relation ID appears in the URL — e.g. `openstreetmap.org/relation/62700` → ID is `62700`.

## Step 2 — Find a Geofabrik PBF extract

Browse [download.geofabrik.de](https://download.geofabrik.de) for an extract covering your region. German Bundesländer and many sub-regions are available. The PBF only needs to *contain* your region — a Bundesland extract works fine for a single Kreis.

## Step 3 — Configure

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
DEPLOY_MODE=data-node-ui
OSM_RELATION_ID=62700
PBF_URL=https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf
```

See [Configuration](configuration.md) for all available variables, including `DEPLOY_MODE` options (`data-node`, `ui`, `data-node-ui`).

## Step 4 — Start the stack and import data

```bash
# Start the database, API, and web server
docker compose --profile data-node-ui up -d

# Import OSM data (downloads PBF, filters to region with osmium, runs osm2pgsql)
docker compose --profile data-node run --rm importer
```

Replace `data-node-ui` with your chosen `DEPLOY_MODE`. The app will be available at `http://localhost:8080` (or the port set in `APP_PORT`).

!!! info "How the import works"
    The importer runs a two-step osmium pipeline before osm2pgsql:

    1. **Bbox extract** — clips the source PBF to your region's bounding box (~322 MB Bundesland → ~50 MB)
    2. **Tag filter** — keeps only objects the app queries (playgrounds, trees, pitches, POIs, …), reducing the file to ~4–8 MB

    osm2pgsql then runs on that small file in a few seconds, regardless of how large the source PBF was.

    | Run | What happens | Typical time |
    |---|---|---|
    | First (no PBF cached) | Downloads source PBF, bbox clip, tag filter, import | ~2–5 min (mostly download) |
    | First (PBF already cached) | Bbox clip, tag filter, import | ~30–60 s |
    | Any subsequent run | Reuses both cached filtered PBFs, import | ~20–30 s |

    All three files (source, bbox-clipped, tag-filtered) are stored in the `pbf_cache` Docker volume and reused automatically.

## Step 5 — Updating data

Re-run the importer at any time to refresh from Geofabrik (extracts are updated daily):

```bash
docker compose --profile data-node run --rm importer
```

For daemon mode deployments or troubleshooting a stale import, see [Refresh Data](refresh-data.md).

## Applying database changes without a full re-import

SQL changes to `importer/api.sql` (PostgREST functions, indexes) can be applied directly to the running database:

```bash
make db-apply
```

## Testing on a phone / LAN access

```bash
make lan-url
```

Prints your machine's LAN IP and ready-to-use URLs. The Vite dev server and Docker stack both bind to all interfaces, so the printed URLs work immediately on any device on the same WiFi.

!!! warning "Geolocation on mobile"
    Browsers block the geolocation API on plain HTTP. If you need to test the location button on a phone, use Chrome and enable "Insecure origins treated as secure" at `chrome://flags`, or test against the production HTTPS URL.

To remove the stack, see [Uninstall](uninstall.md).

