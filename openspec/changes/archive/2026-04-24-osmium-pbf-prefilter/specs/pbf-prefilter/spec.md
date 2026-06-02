## ADDED Requirements

### Requirement: osmium-tool available in importer image
The importer Docker image SHALL include `osmium-tool`, `jq`, and `curl` so the pre-filter step can run without additional downloads at import time.

#### Scenario: Tools present at import runtime
- **WHEN** the importer container starts
- **THEN** `osmium`, `jq`, and `curl` are available on `PATH`

---

### Requirement: Bounding box resolved from Nominatim
Before running osm2pgsql, the importer SHALL query the Nominatim lookup API to obtain the bounding box of `OSM_RELATION_ID` and convert it to `west,south,east,north` order with a configurable padding (default 0.15°).

#### Scenario: Nominatim returns bbox for known relation
- **WHEN** `OSM_RELATION_ID` is a valid OSM relation ID
- **THEN** the importer fetches `nominatim.openstreetmap.org/lookup?osm_ids=R<id>&format=json` and extracts the four bbox coordinates

#### Scenario: Bbox padded before use
- **WHEN** the raw Nominatim bbox is retrieved
- **THEN** each side is expanded by `OSM_BBOX_PADDING` degrees (default `0.15`) before passing to osmium

---

### Requirement: OSM_BBOX env var overrides Nominatim lookup
The importer SHALL accept an `OSM_BBOX` environment variable in `west,south,east,north` format. When set, the Nominatim lookup SHALL be skipped entirely.

#### Scenario: OSM_BBOX provided
- **WHEN** `OSM_BBOX=8.5,50.4,9.8,51.2` is set in the environment
- **THEN** osmium uses that bbox directly, no HTTP request is made to Nominatim

---

### Requirement: Graceful fallback to full PBF on bbox failure
If the Nominatim request fails (network error, HTTP error, or unparseable response) and `OSM_BBOX` is not set, the importer SHALL log a warning and pass the full cached PBF to osm2pgsql unchanged.

#### Scenario: Nominatim unreachable
- **WHEN** the Nominatim request times out or returns a non-200 status
- **THEN** the importer logs `[importer] WARNING: bbox lookup failed, importing full PBF` and continues with the original PBF

---

### Requirement: Filtered PBF extracted with osmium smart strategy
The importer SHALL run `osmium extract --bbox=<bbox> --strategy=smart` to produce a filtered PBF, ensuring that ways and relations (including the region boundary relation) that intersect the bbox are fully included.

#### Scenario: osmium produces complete region slice
- **WHEN** osmium extract runs with `--strategy=smart`
- **THEN** the output PBF contains all nodes, ways, and relations whose geometry intersects the padded bbox, with no truncated way geometries

---

### Requirement: Filtered PBF cached and invalidated by source age
The filtered PBF SHALL be written to `/data/<pbf-basename>_<relation-id>.pbf`. If this file already exists and is newer than the source PBF, the osmium step SHALL be skipped. If the source PBF is newer, the filtered PBF SHALL be regenerated.

#### Scenario: Filtered PBF cache hit
- **WHEN** `/data/hessen-latest.osm.pbf_454863.pbf` exists and is newer than `hessen-latest.osm.pbf`
- **THEN** osmium is not re-run and the cached file is passed to osm2pgsql

#### Scenario: Filtered PBF cache miss — source updated
- **WHEN** the source PBF is newer than the cached filtered PBF
- **THEN** osmium re-runs and overwrites the filtered PBF

---

### Requirement: Skip pre-filter for small source PBFs
If the source PBF file size is less than `OSM_PREFILTER_MIN_MB` (default `20`) megabytes, the osmium pre-filter step SHALL be skipped and the source PBF passed directly to osm2pgsql.

#### Scenario: Small PBF skips osmium
- **WHEN** the source PBF is 15 MB
- **THEN** the importer logs `[importer] Source PBF is small, skipping pre-filter` and runs osm2pgsql on the original file
