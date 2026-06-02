## Why

The osm2pgsql import processes the full Geofabrik Bundesland extract (e.g. Hessen, ~322 MB, ~31M nodes) even though the target region is a single city or Kreis containing ~50–80k objects. This makes every `make import` or `make import2` run take ~60s on the osm2pgsql step alone, purely wasted work. Pre-filtering the PBF to a padded bounding box of the target region with `osmium extract` reduces that step to ~3–5s.

## What Changes

- Add `osmium-tool`, `jq`, and `curl` to the importer Docker image
- Before running osm2pgsql, query Nominatim for the bounding box of `OSM_RELATION_ID` and run `osmium extract --bbox --strategy=smart` on the cached PBF to produce a small regional slice
- Cache the filtered PBF alongside the source PBF (key: `<pbf-basename>_<relation-id>.pbf`); invalidate when source is newer
- Fall back gracefully to the full PBF if the Nominatim request fails
- Accept an optional `OSM_BBOX` env var to skip the Nominatim lookup entirely (useful for air-gapped or rate-limited environments)
- Skip the osmium step if the source PBF is already small (< 20 MB) — no net benefit for pre-filtered downloads

## Capabilities

### New Capabilities

- `pbf-prefilter`: Pre-filter a large Geofabrik PBF to a padded bounding box before handing it to osm2pgsql, using osmium-tool and a Nominatim bbox lookup

### Modified Capabilities

<!-- none — no existing spec-level requirements change -->

## Impact

- **`importer/Dockerfile`**: adds `osmium-tool`, `jq`, `curl`
- **`importer/import.sh`**: new pre-filter step between download and osm2pgsql
- **`importer/` volume (`/data`)**: filtered PBFs cached alongside source PBF
- **No API or frontend changes**
- **Nominatim**: new outbound HTTP dependency during import (optional, with fallback)
- **Import time**: ~60s osm2pgsql step → ~3–5s for city/Kreis-sized regions
