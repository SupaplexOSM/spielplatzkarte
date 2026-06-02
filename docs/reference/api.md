# API Reference

PostgREST exposes the `api` schema as JSON-RPC endpoints under `/api/rpc/`. All endpoints accept GET requests with query-string parameters.

## Full RPC index

| RPC | Used by | Notes |
|---|---|---|
| [`get_playground_clusters`](#get_playground_clustersz-bbox) | Standalone cluster tier | zoom ≤ `clusterMaxZoom` |
| [`get_playgrounds_bbox`](#get_playgrounds_bboxbbox) | Standalone polygon tier | zoom > `clusterMaxZoom` |
| [`get_playground`](#get_playgroundosm_id) | Deeplink restore, nearby-list hydration | single feature |
| [`get_playground_centroids`](#get_playground_centroidsbbox-server-only-in-p1) | Federation re-clustering (P2), not consumed by standalone | server-shipped |
| [`get_equipment`](#get_equipmentbbox) | PlaygroundPanel | devices, pitches, benches within a bbox |
| [`get_standalone_equipment`](#get_standalone_equipmentbbox) | Standalone pitch layer | pitches/benches outside playgrounds |
| [`get_pois`](#get_poislat-lon-radius_m) | PlaygroundPanel | nearby toilets, bus stops, cafés |
| [`get_trees`](#get_treesbbox) | PlaygroundPanel tree layer | natural=tree nodes and natural=tree_row lines |
| [`get_meta`](#get_meta) | Hub federation discovery | instance metadata + import freshness |
| [`get_nearest_playgrounds`](#get_nearest_playgroundslat-lon) | NearbyPlaygrounds component | ordered by distance |
| [`get_playgrounds` (deprecated)](#deprecated-get_playgroundsrelation_id) | Legacy fallback | region-scoped, will be removed |

## Two-tier client contract

The standalone client renders playgrounds through two zoom-scoped layers:

| Zoom | Tier | RPC |
|---|---|---|
| ≤ `clusterMaxZoom` (default 13) | cluster | `get_playground_clusters(z, bbox)` |
| > `clusterMaxZoom` | polygon | `get_playgrounds_bbox(bbox)` |

Single-feature hydration on demand:

| Use case | RPC |
|---|---|
| Deeplink restore at low zoom; nearby-list selection of a not-yet-loaded playground | `get_playground(osm_id)` |

A third bbox-scoped RPC, `get_playground_centroids(bbox)`, ships server-side for future use (federated re-clustering across backends, lighter mid-zoom payloads) but is not consumed by the standalone client in this release.

## `get_playground_clusters(z, bbox)`

Pre-aggregated cluster buckets for the cluster tier. Each bucket counts playgrounds whose centroid snaps to a zoom-appropriate grid cell, broken down by completeness and access.

**Parameters**

| Name | Type | Default | Notes |
|---|---|---|---|
| `z` | `int` | — | Zoom level — drives cell size via a hardcoded table (10 Mm at z=0, halving each level down to ~1.2 km at z=13) |
| `min_lon`, `min_lat`, `max_lon`, `max_lat` | `float8` | — | WGS84 bounding box |
| `filter_private` | `boolean` | `false` | When `true`, exclude access-restricted playgrounds |
| `filter_water` | `boolean` | `false` | When `true`, include only water playgrounds |
| `filter_baby` | `boolean` | `false` | When `true`, include only baby-friendly playgrounds |
| `filter_toddler` | `boolean` | `false` | When `true`, include only toddler-friendly playgrounds |
| `filter_wheelchair` | `boolean` | `false` | When `true`, include only wheelchair-accessible playgrounds |
| `filter_bench` | `boolean` | `false` | When `true`, include only playgrounds with a bench |
| `filter_picnic` | `boolean` | `false` | When `true`, include only playgrounds with a picnic table |
| `filter_shelter` | `boolean` | `false` | When `true`, include only playgrounds with a shelter |
| `filter_table_tennis` | `boolean` | `false` | When `true`, include only playgrounds with a table tennis table |
| `filter_soccer` | `boolean` | `false` | When `true`, include only playgrounds with a football pitch |
| `filter_basketball` | `boolean` | `false` | When `true`, include only playgrounds with a basketball court |
| `filter_complete` | `boolean` | `true` | When `false`, exclude complete playgrounds |
| `filter_partial` | `boolean` | `true` | When `false`, exclude partial playgrounds |
| `filter_missing` | `boolean` | `true` | When `false`, exclude missing playgrounds |

**Response** — JSON array of bucket objects:

```json
[
  {
    "lon":         9.7140,
    "lat":         50.5489,
    "count":       2,
    "complete":    1,
    "partial":     0,
    "missing":     1,
    "restricted":  0
  }
]
```

**Invariant**: `count = complete + partial + missing + restricted` for every bucket. The three completeness counts include only public playgrounds; access-restricted playgrounds are pulled out into `restricted` so the client can render them as a hatched gray segment.

**Bucket centre**: emitted `lon` / `lat` is the **unweighted spatial mean of the bucket's member centroids** (`ST_Centroid(ST_Collect(centroid_3857))`, reprojected to WGS84) — not the grid anchor. The grid still defines *which* playgrounds share a bucket (the grouping key), but the dot is drawn at the geographic mean of those members so it tracks settlements rather than a lattice. Output is deterministic for a given `(z, bbox)` and dataset: identical inputs produce identical positions. See [Architecture — Tiered playground delivery](architecture.md#tiered-playground-delivery) for the grouping-vs-position split.

**Example**

```bash
curl 'https://example.com/api/rpc/get_playground_clusters?z=12&min_lon=9&min_lat=50&max_lon=10&max_lat=51'
```

## `get_playgrounds_bbox(bbox)`

Polygon-tier RPC. Returns the same `FeatureCollection` shape as the legacy region-scoped `get_playgrounds(relation_id)`, but restricted to playgrounds whose geometry intersects the bbox (so polygons straddling the viewport edge are returned in full).

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `min_lon`, `min_lat`, `max_lon`, `max_lat` | `float8` | WGS84 bounding box |

**Response** — GeoJSON `FeatureCollection`. Each feature's `properties` include `osm_id`, `osm_type` (`R`, `W`, or `N`), `name`, `leisure`, `operator`, `access`, `surface`, `area`, the playground-stats counts (`tree_count`, `bench_count`, etc.), and the per-equipment booleans (`is_water`, `for_baby`, `for_toddler`, `for_wheelchair`, `has_soccer`, `has_basketball`). The original tag hstore is spread on top so any OSM tag is reachable. Node playgrounds (`osm_type = 'N'`) are returned as small circular polygons (5 m radius buffer around the node point).

The equipment booleans are aggregated across all equipment within the playground polygon. `for_baby` is `true` when any equipment has `baby=yes`, `capacity:baby` set, or `playground` ∈ `baby_swing`, `basketswing`, `sandpit`, `springy`. See [Import Pipeline — filter flags](../contributing/import-pipeline.md#filter-flags-for_baby-for_toddler-is_water) for the full trigger list.

> Note: the polygon RPC names the water flag `is_water` (legacy from the materialised-view column). The centroid RPC's `filter_attrs` payload (below) renames it to `has_water` for consistency with the other client-side filter keys (`for_baby`, `has_soccer`, …). Same boolean, different key.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [...] },
      "properties": {
        "osm_id":             37808214,
        "osm_type":           "W",
        "name":               "Grezzbachpark",
        "leisure":            "playground",
        "operator":           "...",
        "access":             "yes",
        "surface":            "...",
        "area":               2480,
        "tree_count":         12,
        "bench_count":        4,
        "has_soccer":         true,
        "is_water":           true,
        "for_wheelchair":     false
      }
    }
  ]
}
```

## `get_playground(osm_id)`

Single-feature lookup used by the deeplink-hydration and nearby-list fallback paths when the polygon source isn't populated for the current viewport (cluster tier on first load).

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `osm_id` | `bigint` | Magnitude only; the function tries both relation (`-osm_id`) and way (`+osm_id`) rows and prefers a relation row when both exist |

**Response** — A single GeoJSON `Feature` with the same `properties` shape as one element of `get_playgrounds_bbox.features[*]`, or JSON `null` when no playground matches.

**Frontend convention**: callers throw on non-2xx responses and treat a `null` body as a legitimate "not found", so server errors and missing playgrounds can be acted on differently.

## `get_playground_centroids(bbox)` *(server-only in P1)*

Returns lightweight per-playground rows for a bbox — `osm_id`, lon/lat, completeness, and a nested `filter_attrs` object (`has_water`, `for_baby`, `for_toddler`, `for_wheelchair`, `has_soccer`, `has_basketball`, `access_restricted`). No polygon geometry, no tag hstore.

```json
[
  {
    "osm_id":       37808214,
    "lon":          9.7096,
    "lat":          50.5438,
    "completeness": "complete",
    "filter_attrs": {
      "has_water":         true,
      "for_baby":          false,
      "for_toddler":       false,
      "for_wheelchair":    false,
      "has_soccer":        true,
      "has_basketball":    false,
      "access_restricted": false
    }
  }
]
```

The standalone client doesn't consume this RPC in P1 — the server-bucketed cluster tier covers zoom ≤ 13 directly. The RPC ships now so federated hub clustering (`add-federated-playground-clustering`) and any future "centroid + Supercluster" tier can use it without a schema change.

## `get_meta()` — extended

Existing federation-discovery RPC, extended with completeness counts.

**Response shape** (changed in this release):

```json
{
  "relation_id":      62700,
  "name":             "Landkreis Fulda",
  "playground_count": 4,
  "complete":         2,
  "partial":          1,
  "missing":          1,
  "bbox":             [9.43, 50.36, 10.08, 50.81]
}
```

**Invariant**: `playground_count = complete + partial + missing` (`get_meta` does *not* split out access-restricted; they're rolled into the completeness counts here, unlike `get_playground_clusters`). Hub uses the three counts to render a country-level macro view — see `add-federated-playground-clustering`.

Additional fields:

| Field | Type | Notes |
|---|---|---|
| `last_import_at` | `timestamptz` \| `null` | Timestamp of the last successful `import.sh` run. `null` before any import has run (first deploy). |
| `data_age_seconds` | `int` \| `null` | `EXTRACT(EPOCH FROM (now() - last_import_at))::int`. `null` when `last_import_at` is `null`. |
| `region_geom` | GeoJSON geometry \| `null` | Simplified boundary polygon of the backend's region (`ST_SimplifyPreserveTopology` at 0.05°, WGS84). Used by the hub for accurate polygon-based overlap detection. `null` when the region relation is absent from `planet_osm_polygon`. Backends running a pre-0.4.13 image omit this field — the hub falls back to no overlap warning for those backends. |

The hub reads `last_import_at` and `data_age_seconds` via `/federation-status.json` (written by the hub container's 60-second cron poll) — see [Monitoring](../ops/monitoring.md) for the full exposition format. `region_geom` is read directly by the browser-side registry store and used by `@turf/boolean-intersects` to determine whether two backends genuinely share geographic area.

## Deprecated: `get_playgrounds(relation_id)`

The pre-tiered region-scoped RPC stays available for one release for compatibility with Playwright fixtures and external consumers. Marked DEPRECATED via SQL `COMMENT`; the client `fetchPlaygrounds` logs a one-time console warning. It will be removed in the release after next.

Migration: replace any caller with `fetchPlaygroundsBbox(extent, baseUrl)` driven by viewport extent.

## `get_equipment(bbox)`

Returns all playground equipment within a WGS84 bounding box — devices (`playground=*`), pitches (`leisure=pitch`), benches (`amenity=bench`), shelters (`amenity=shelter`), fitness stations (`leisure=fitness_station`), and picnic tables (`leisure=picnic_table`).

Covers nodes, polygon ways, and linear ways. Used by `PlaygroundPanel` to populate the equipment list and overlay layers when a playground is selected.

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `min_lon`, `min_lat`, `max_lon`, `max_lat` | `float8` | WGS84 bbox — typically the selected playground's extent |

**Response** — GeoJSON `FeatureCollection`. Each feature's `properties` include `osm_id`, `osm_type` (`N` or `W`), `name`, `amenity`, `leisure`, `sport`, plus all OSM tags from the hstore column spread onto the properties object.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [9.71, 50.54] },
      "properties": {
        "osm_id":    12345678,
        "osm_type":  "N",
        "amenity":   null,
        "leisure":   null,
        "sport":     null,
        "playground": "slide",
        "height":    "1.2"
      }
    }
  ]
}
```

**Example**

```bash
curl 'https://example.com/api/rpc/get_equipment?min_lon=9.70&min_lat=50.53&max_lon=9.72&max_lat=50.55'
```

---

## `get_standalone_equipment(bbox)`

Returns pitches, benches, shelters, picnic tables, and fitness stations that do **not** lie within any `leisure=playground` polygon. Used by the standalone pitch layer (`filterStore.standalonePitches`).

Same parameter and response shape as `get_equipment`. Returns an empty `FeatureCollection` when `apiBaseUrl` is empty (Overpass fallback, used in local frontend dev without a database).

**Example**

```bash
curl 'https://example.com/api/rpc/get_standalone_equipment?min_lon=9.60&min_lat=50.50&max_lon=9.80&max_lat=50.60'
```

---

## `get_pois(lat, lon, radius_m)`

Returns nearby points of interest within `radius_m` metres of the given WGS84 point. Used by `PlaygroundPanel` to show nearby amenities.

**Parameters**

| Name | Type | Default | Notes |
|---|---|---|---|
| `lat` | `float8` | — | WGS84 latitude |
| `lon` | `float8` | — | WGS84 longitude |
| `radius_m` | `integer` | `500` | Search radius in metres (configurable via `POI_RADIUS_M` env var) |

**POI types returned:**

| Category | OSM tag |
|---|---|
| Toilets | `amenity=toilets` |
| Ice cream | `amenity=ice_cream` or `amenity=cafe/restaurant` + `cuisine=*ice_cream*` |
| Emergency | `emergency=yes` + hospital/clinic, or `healthcare:speciality=emergency` |
| Bus stop | `highway=bus_stop` |
| Pharmacy | `shop=chemist` |
| Supermarket / convenience | `shop=supermarket`, `shop=convenience` |

**Response** — JSON array:

```json
[
  {
    "osm_id":  987654321,
    "lat":     50.5421,
    "lon":     9.7133,
    "name":    "Spielplatz-WC",
    "amenity": "toilets",
    "shop":    null,
    "highway": null,
    "tags":    {}
  }
]
```

**Example**

```bash
curl 'https://example.com/api/rpc/get_pois?lat=50.54&lon=9.71&radius_m=300'
```

---

## `get_trees(bbox)`

Returns `natural=tree` nodes and `natural=tree_row` line features within a WGS84 bounding box. Used by `PlaygroundPanel` to populate the tree overlay layer when a playground is selected. Tree rows render as dark green lines on the map; the panel merges both signals into a single shade hint ("N trees / M m").

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `min_lon`, `min_lat`, `max_lon`, `max_lat` | `float8` | WGS84 bbox |

**Response** — GeoJSON `FeatureCollection`. Point features (`natural=tree`) carry `properties.osm_id`, `properties.name`, plus OSM tags. LineString features (`natural=tree_row`) additionally carry `properties.length_m` (row length in metres, from `ST_Length`).

**Example**

```bash
curl 'https://example.com/api/rpc/get_trees?min_lon=9.70&min_lat=50.53&max_lon=9.72&max_lat=50.55'
```

---

## `get_meta()`

Returns instance metadata used by the Hub for federation discovery. Required for a backend to participate in a Hub.

**Parameters:** none (uses the configured `OSM_RELATION_ID`)

**Response:**

```json
{
  "relation_id":          62700,
  "name":                 "Landkreis Fulda",
  "playground_count":     147,
  "complete":             42,
  "partial":              81,
  "missing":              24,
  "bbox":                 [9.43, 50.36, 10.08, 50.81],
  "last_import_at":       "2026-04-30T03:12:00Z",
  "data_age_seconds":     86400,
  "osm_data_timestamp":   "2026-04-29T21:00:00Z",
  "osm_data_age_seconds": 108000,
  "importing":            false,
  "version":              "0.4.1",
  "impressum_url":        "https://spieli.example.com/impressum",
  "privacy_url":          "https://spieli.example.com/datenschutz"
}
```

**Field notes:**

| Field | Notes |
|---|---|
| `playground_count` | Total playgrounds in the region. Equals `complete + partial + missing`. |
| `complete`, `partial`, `missing` | Completeness breakdown (access-restricted playgrounds roll into these counts, unlike `get_playground_clusters`). |
| `bbox` | `[west, south, east, north]` in WGS84. `null` when the relation is not found. |
| `last_import_at` | When `import.sh` last ran successfully. `null` before any import. |
| `data_age_seconds` | Seconds since `last_import_at`. `null` when `last_import_at` is null. |
| `osm_data_timestamp` | PBF replication timestamp (when Geofabrik last generated the extract). `null` when the PBF header lacks this field. |
| `osm_data_age_seconds` | Seconds since `osm_data_timestamp`. `null` when `osm_data_timestamp` is null. |
| `importing` | `true` while `osm2pgsql` is actively running (data partially rebuilt); `false` at all other times. `false` on older backends that pre-date this field. The Hub drawer shows an "updating" badge while this is `true`. |
| `version` | spieli version string baked in at import time from `package.json` (e.g. `"0.4.1"`). Displayed in the Hub's instance drawer. |
| `impressum_url` | Absolute URL of the Impressum page. `IMPRESSUM_URL` env var takes priority; otherwise constructed from `SITE_URL + /impressum`. `null` when neither is configured. Baked in at import time — run `make db-apply` after changing legal env vars. |
| `privacy_url` | Absolute URL of the Datenschutzerklärung. `PRIVACY_URL` env var takes priority; otherwise `SITE_URL + /datenschutz`. `null` when neither is configured. |

**Example**

```bash
curl 'https://example.com/api/rpc/get_meta'
```

---

## `get_legal(type)`

Returns generated legal HTML for `data-node` backends (no nginx web UI). The Hub calls this when `get_meta()` returns a `null` `impressum_url` or `privacy_url`.

**Parameters**

| Name | Type | Values |
|---|---|---|
| `type` | `text` | `'impressum'` or `'datenschutz'` |

**Response** — JSON object or `null`:

```json
{ "content": "<html>...</html>" }
```

Returns `null` (HTTP 200) when no content has been stored for the requested type (i.e. `IMPRESSUM_NAME` was not set when the container started).

**Example**

```bash
curl 'https://example.com/api/rpc/get_legal?type=impressum'
```

---

## `get_nearest_playgrounds(lat, lon)`

Returns the nearest playgrounds to a WGS84 point, ordered by distance ascending. Used by the `NearbyPlaygrounds` component. Returns an empty array when `apiBaseUrl` is empty (Overpass fallback, used in local frontend dev without a database).

**Parameters**

| Name | Type | Default | Notes |
|---|---|---|---|
| `lat` | `float8` | — | WGS84 latitude |
| `lon` | `float8` | — | WGS84 longitude |
| `relation_id` | `bigint` | `OSM_RELATION_ID` | Scope to this region |
| `max_results` | `int` | `5` | Maximum results |

**Response** — JSON array:

```json
[
  {
    "osm_id":     37808214,
    "name":       "Grezzbachpark",
    "lat":        50.5438,
    "lon":        9.7096,
    "distance_m": 342,
    "tags":       { "name": "Grezzbachpark", "operator": "…", "access": "yes" }
  }
]
```

**Example**

```bash
curl 'https://example.com/api/rpc/get_nearest_playgrounds?lat=50.54&lon=9.71'
```

---

## See also

- [Federation](federation.md) — Hub-mode discovery, `registry.json`, federation endpoints overview.
- [Architecture](architecture.md) — DEPLOY_MODE × APP_MODE matrix, where `apiBaseUrl` is set.
- `importer/api.sql` — authoritative SQL source for every RPC.
- `app/src/lib/api.js` — all client fetchers (each with JSDoc).
- `app/src/lib/tieredOrchestrator.js` — moveend-driven tier picker that calls these RPCs.
