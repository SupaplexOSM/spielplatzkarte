## 1. Docker image

- [ ] 1.1 Add `osmium-tool`, `jq`, and `curl` to `importer/Dockerfile`
- [ ] 1.2 Verify tools are on PATH in a test run (`osmium --version`, `jq --version`, `curl --version`)

## 2. import.sh — bbox resolution

- [ ] 2.1 Add `OSM_BBOX` and `OSM_BBOX_PADDING` (default `0.15`) variable declarations at the top of `import.sh`
- [ ] 2.2 Add `OSM_PREFILTER_MIN_MB` variable (default `20`)
- [ ] 2.3 Implement `resolve_bbox` logic: if `OSM_BBOX` is set, use it directly; otherwise query Nominatim `lookup?osm_ids=R<id>&format=json` and parse with `jq`
- [ ] 2.4 Apply padding to the four bbox coordinates (shell arithmetic via `awk` or `python3 -c`)
- [ ] 2.5 Handle Nominatim failure: log warning and set `SKIP_PREFILTER=1` so the full PBF is used

## 3. import.sh — osmium extract step

- [ ] 3.1 After the download block, check source PBF size; if smaller than `OSM_PREFILTER_MIN_MB`, log and set `SKIP_PREFILTER=1`
- [ ] 3.2 Derive filtered PBF path: `/data/$(basename "$PBF_FILE" .pbf)_${OSM_RELATION_ID}.pbf`
- [ ] 3.3 Check if filtered PBF is newer than source PBF (cache hit); if so, skip osmium and log the cache hit
- [ ] 3.4 Run `osmium extract --bbox=<west,south,east,north> --strategy=smart -o <filtered> <source> --overwrite` when pre-filter is active
- [ ] 3.5 Set `IMPORT_PBF` to the filtered PBF path (or original if `SKIP_PREFILTER=1`) and pass `$IMPORT_PBF` to osm2pgsql

## 4. Configuration

- [ ] 4.1 Add `OSM_BBOX`, `OSM_BBOX_PADDING`, and `OSM_PREFILTER_MIN_MB` to `.env.example` with comments
- [ ] 4.2 Add the three new variables to the `app` and `importer` service environments in `compose.yml` (pass-through only for importer)
- [ ] 4.3 Add the three variables to `docs/ops/configuration.md`

## 5. Verification

- [ ] 5.1 Run `make import` from scratch (no cached PBF) — confirm osmium runs and filtered PBF is produced
- [ ] 5.2 Run `make import` a second time — confirm osmium cache hit is logged, osm2pgsql runs on filtered PBF
- [ ] 5.3 Run `make import2` — confirm second relation uses its own filtered PBF (`_454881.pbf`)
- [ ] 5.4 Set `OSM_BBOX=8.5,50.4,9.8,51.2` and confirm Nominatim is not queried
- [ ] 5.5 Simulate Nominatim failure (set DNS to invalid) — confirm fallback to full PBF with warning logged
- [ ] 5.6 Verify playground data is correct after osmium-filtered import (same playgrounds as full import)
