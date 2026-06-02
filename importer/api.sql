-- PostgREST API functions.
-- Called by import.sh after each osm2pgsql run.
-- All functions live in the "api" schema and are exposed via PostgREST /rpc/<name>.
--
-- osm2pgsql (classic schema) geometry notes:
--   - All geometries are stored in EPSG:3857 (Web Mercator)
--   - planet_osm_point  → nodes
--   - planet_osm_polygon → ways/relations rendered as polygons
--   - Uncommon tags land in other_tags (hstore)

-- =========================================================================
-- Parallel-query / memory tuning. We persist via ALTER SYSTEM (writes to
-- postgresql.auto.conf in the data volume) so the values survive container
-- recreation and apply to every connection — including PostgREST's runtime
-- queries — without needing `command:` overrides in compose files. All five
-- GUCs are reload-eligible, so pg_reload_conf() is enough; no restart.
--
-- We *also* SET them at the session level so the current psql session (the
-- import / db-apply run that follows immediately below) picks up the new
-- values without depending on the SIGHUP-reload race window.
--
-- Values are substituted by envsubst in import.sh / make db-apply.
-- Tune via PG_* variables in .env (see .env.example).
-- =========================================================================
ALTER SYSTEM SET max_parallel_workers             = ${PG_MAX_PARALLEL_WORKERS};
ALTER SYSTEM SET max_parallel_workers_per_gather  = ${PG_MAX_PARALLEL_WORKERS_PER_GATHER};
ALTER SYSTEM SET max_parallel_maintenance_workers = ${PG_MAX_PARALLEL_MAINTENANCE_WORKERS};
ALTER SYSTEM SET maintenance_work_mem             = '${PG_MAINTENANCE_WORK_MEM}';
ALTER SYSTEM SET work_mem                         = '${PG_WORK_MEM}';
SELECT pg_reload_conf();

SET max_parallel_workers             = ${PG_MAX_PARALLEL_WORKERS};
SET max_parallel_workers_per_gather  = ${PG_MAX_PARALLEL_WORKERS_PER_GATHER};
SET max_parallel_maintenance_workers = ${PG_MAX_PARALLEL_MAINTENANCE_WORKERS};
SET maintenance_work_mem             = '${PG_MAINTENANCE_WORK_MEM}';
SET work_mem                         = '${PG_WORK_MEM}';

-- Make sure web_anon can call everything we create here.
GRANT USAGE ON SCHEMA api TO web_anon;

-- =========================================================================
-- playground_stats — materialized view pre-computing per-playground stats.
-- Rebuilt on every import / db-apply so get_playgrounds is a plain lookup.
-- =========================================================================

-- Terminate PostgREST connections that hold (or could re-acquire) locks on
-- playground_stats so the subsequent DROP does not block on
-- AccessExclusiveLock. We target *all* PostgREST connection states (active,
-- idle, idle in transaction) because:
--   - 'active' / 'idle in transaction' actually hold the AccessShareLock
--     that blocks the DROP — these are the ones that matter.
--   - 'idle' connections can reconnect and re-acquire the lock between our
--     terminate and the DROP, so killing them too closes the race window.
-- We scope by application_name='PostgREST' (PostgREST sets this by default)
-- so admin shells / monitoring / replication helpers are not collateral.
-- pg_terminate_backend requires superuser or pg_signal_backend membership;
-- the DO block fails loudly if the role lacks that privilege rather than
-- silently leaving the DROP to block.
DO $playground_stats_unblock$
DECLARE
  failed int;
BEGIN
  SELECT COUNT(*) INTO failed FROM (
    SELECT NOT pg_terminate_backend(pid) AS still_alive
    FROM   pg_stat_activity
    WHERE  datname          = current_database()
      AND  application_name = 'PostgREST'
      AND  state            IN ('active', 'idle', 'idle in transaction')
      AND  pid             <> pg_backend_pid()
  ) t WHERE still_alive;
  IF failed > 0 THEN
    RAISE EXCEPTION
      'Could not terminate % PostgREST connection(s) — current role lacks pg_signal_backend?',
      failed;
  END IF;
END
$playground_stats_unblock$;

DROP MATERIALIZED VIEW IF EXISTS public.playground_stats CASCADE;

CREATE MATERIALIZED VIEW public.playground_stats AS
  WITH all_playgrounds AS (
    -- osm2pgsql can emit multiple rows per relation for multipolygon
    -- playgrounds (one row per outer ring). Without dedup, the MV would
    -- have multiple rows per osm_id and the unique index below would
    -- fail to create. GROUP BY osm_id with ST_Union merges fragments
    -- back into one (multi)polygon. Non-geometry columns (name,
    -- operator, access, surface, tags) are tied to the relation, not
    -- the fragment, so they're identical across the rows of one
    -- multipolygon — `MAX()` for text and `(array_agg(...))[1]` for
    -- hstore both pick a (stable) value. The hstore case can't use
    -- MAX() because hstore lacks a < ordering operator.
    --
    -- No region filter: each stack imports exactly one Bundesland's PBF,
    -- so every playground in the DB belongs to the configured region.
    -- A ST_Within filter against the state boundary relation was removed
    -- because some states (e.g. Brandenburg, which surrounds Berlin) are
    -- stored by osm2pgsql as linestrings in planet_osm_line rather than
    -- polygons in planet_osm_polygon — the boundary relation's member ways
    -- can't always be assembled into a closed ring from the osmium-filtered
    -- PBF. When the polygon is missing, the region CTE returns NULL and
    -- ST_Within excludes all playgrounds, producing playground_count = 0.
    SELECT
      p.osm_id,
      CASE WHEN p.osm_id < 0 THEN 'R' ELSE 'W' END AS osm_type,
      ST_Union(p.way)         AS way,
      MAX(p.name)             AS name,
      MAX(p.operator)         AS operator,
      MAX(p.access)           AS access,
      MAX(p.surface)          AS surface,
      -- tags are identical across all fragments of one relation, but
      -- order_by-area keeps the chosen value deterministic if a future
      -- osm2pgsql change ever introduced per-fragment tag variance.
      (array_agg(p.tags ORDER BY ST_Area(p.way) DESC))[1] AS tags
    FROM planet_osm_polygon p
    WHERE p.leisure = 'playground'
    GROUP BY p.osm_id
    UNION ALL
    -- leisure=playground nodes: buffered to a 5 m circle so geometry-based
    -- joins (tree proximity, equipment containment, ST_Centroid) work uniformly.
    SELECT
      n.osm_id,
      'N'::text               AS osm_type,
      ST_Transform(
        ST_Buffer(ST_Transform(n.way, 4326)::geography, 5)::geometry,
        3857
      )                       AS way,
      n.name,
      n.operator,
      n.access,
      n.surface,
      n.tags
    FROM planet_osm_point n
    WHERE n.leisure = 'playground'
  ),
  tree_counts AS (
    SELECT
      pl.osm_id,
      pl.osm_type,
      COUNT(t.osm_id)::int AS tree_count
    FROM all_playgrounds pl
    LEFT JOIN planet_osm_point t
      ON ST_DWithin(t.way, pl.way, 15)
      AND t.natural = 'tree'
    GROUP BY pl.osm_id, pl.osm_type
  ),
  all_equip AS (
    SELECT osm_id, amenity, leisure, sport, tags, way
    FROM planet_osm_point
    WHERE amenity IN ('bench', 'shelter')
       OR leisure IN ('picnic_table', 'pitch', 'fitness_station')
       OR tags ? 'playground'
    UNION ALL
    SELECT osm_id, amenity, leisure, sport, tags, way
    FROM planet_osm_polygon
    WHERE amenity IN ('bench', 'shelter')
       OR leisure IN ('picnic_table', 'pitch', 'fitness_station')
       OR tags ? 'playground'
  ),
  equip_stats AS (
    SELECT
      pl.osm_id,
      pl.osm_type,
      COUNT(CASE WHEN e.tags ? 'playground'      THEN 1 END)::int AS device_count,
      COUNT(CASE WHEN e.amenity = 'bench'        THEN 1 END)::int AS bench_count,
      COUNT(CASE WHEN e.amenity = 'shelter'      THEN 1 END)::int AS shelter_count,
      COUNT(CASE WHEN e.leisure = 'picnic_table' THEN 1 END)::int AS picnic_count,
      COUNT(CASE WHEN e.leisure = 'pitch'
                  AND (e.sport = 'table_tennis' OR e.tags->'sport' = 'table_tennis') THEN 1 END)::int AS table_tennis_count,
      BOOL_OR(e.leisure = 'pitch'
              AND (e.sport = 'soccer' OR e.tags->'sport' = 'soccer'))          AS has_soccer,
      BOOL_OR(e.leisure = 'pitch'
              AND (e.sport IN ('basketball','streetball')
                   OR e.tags->'sport' IN ('basketball','streetball')))          AS has_basketball,
      BOOL_OR(e.tags ? 'playground'
              AND (e.tags->'playground' ~* 'water'
                   OR e.tags->'playground' IN ('splash_pad','pump')))           AS is_water,
      BOOL_OR((e.tags->'baby' = 'yes')
              OR (e.tags->'playground' IN ('baby_swing','basketswing','sandpit','springy'))
              OR (e.tags ? 'playground' AND e.tags->'capacity:baby' IS NOT NULL)) AS for_baby,
      BOOL_OR((e.tags->'provided_for:toddler' = 'yes')
              OR (e.tags->'playground' = 'basketswing'))                        AS for_toddler,
      BOOL_OR(e.tags->'wheelchair' = 'yes'
              AND (NOT (e.tags ? 'playground')
                   OR e.tags->'playground' != 'sandpit'))                       AS for_wheelchair
    FROM all_playgrounds pl
    LEFT JOIN all_equip e ON ST_Intersects(pl.way, e.way)
    GROUP BY pl.osm_id, pl.osm_type
  ),
  -- Mirrors app/src/lib/completeness.js so the server classification and the
  -- client style function agree. Update both sides together if the rule changes.
  completeness_attrs AS (
    SELECT
      pl.osm_id,
      pl.osm_type,
      (pl.tags ? 'panoramax'
        OR EXISTS (SELECT 1 FROM skeys(pl.tags) k WHERE k LIKE 'panoramax:%')
      ) AS has_photo,
      -- Any mapped equipment inside the playground area (devices, benches,
      -- pitches, etc.). device_count covers playground=* nodes/polygons;
      -- the other columns cover amenity/leisure-tagged items.
      (
        COALESCE(es.device_count,        0) > 0
        OR COALESCE(es.bench_count,      0) > 0
        OR COALESCE(es.shelter_count,    0) > 0
        OR COALESCE(es.picnic_count,     0) > 0
        OR COALESCE(es.table_tennis_count, 0) > 0
        OR COALESCE(es.has_soccer,     false)
        OR COALESCE(es.has_basketball, false)
        OR COALESCE(es.is_water,       false)
        OR COALESCE(es.for_baby,       false)
        OR COALESCE(es.for_toddler,    false)
        OR COALESCE(es.for_wheelchair, false)
      ) AS has_equipment,
      -- NULLIF('', '') IS NULL — matches JS truthy semantics on empty-string tags.
      -- operator excluded: it's administrative data, not useful to parents.
      (
        NULLIF(pl.surface, '') IS NOT NULL
        OR (NULLIF(pl.access, '') IS NOT NULL AND pl.access <> 'yes')
        OR NULLIF(pl.tags->'opening_hours', '') IS NOT NULL
      ) AS has_info
    FROM all_playgrounds pl
    LEFT JOIN equip_stats es ON es.osm_id = pl.osm_id AND es.osm_type = pl.osm_type
  )
  SELECT
    tc.osm_id,
    pl.osm_type,
    tc.tree_count,
    COALESCE(es.device_count,       0) AS device_count,
    COALESCE(es.bench_count,        0) AS bench_count,
    COALESCE(es.shelter_count,      0) AS shelter_count,
    COALESCE(es.picnic_count,       0) AS picnic_count,
    COALESCE(es.table_tennis_count, 0) AS table_tennis_count,
    COALESCE(es.has_soccer,     false) AS has_soccer,
    COALESCE(es.has_basketball, false) AS has_basketball,
    COALESCE(es.is_water,       false) AS is_water,
    COALESCE(es.for_baby,       false) AS for_baby,
    COALESCE(es.for_toddler,    false) AS for_toddler,
    COALESCE(es.for_wheelchair, false) AS for_wheelchair,
    -- Tiered-delivery (P1): persisted centroid + per-playground completeness
    ST_Centroid(pl.way)                           AS centroid_3857,
    (pl.access IN ('private', 'customers'))       AS access_restricted,
    CASE
      WHEN ca.has_photo AND ca.has_equipment AND ca.has_info THEN 'complete'
      WHEN ca.has_photo OR  ca.has_equipment OR  ca.has_info THEN 'partial'
      ELSE 'missing'
    END                                           AS completeness
  FROM all_playgrounds pl
  LEFT JOIN tree_counts        tc ON tc.osm_id = pl.osm_id AND tc.osm_type = pl.osm_type
  LEFT JOIN equip_stats        es ON es.osm_id = pl.osm_id AND es.osm_type = pl.osm_type
  LEFT JOIN completeness_attrs ca ON ca.osm_id = pl.osm_id AND ca.osm_type = pl.osm_type;

CREATE UNIQUE INDEX ON public.playground_stats (osm_id, osm_type);
CREATE INDEX        ON public.playground_stats USING GIST (centroid_3857);

-- =========================================================================
-- 1. get_playgrounds(relation_id)
--    Returns all leisure=playground polygons inside the given OSM admin
--    relation as a GeoJSON FeatureCollection.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playgrounds(bigint);

CREATE OR REPLACE FUNCTION api.get_playgrounds(relation_id bigint DEFAULT ${OSM_RELATION_ID})
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH region AS (
    -- osm2pgsql stores relation IDs as negative numbers. Union all matching
    -- rows: assembly can emit multiple polygon rows per relation when member
    -- ways are clipped (e.g. by a narrow PBF extract), and picking one at
    -- random yields inconsistent results.
    SELECT ST_Union(way) AS way FROM planet_osm_polygon
    WHERE osm_id = -relation_id
  ),
  playgrounds AS (
    SELECT
      p.osm_id,
      CASE WHEN p.osm_id < 0 THEN 'R' ELSE 'W' END        AS osm_type,
      MAX(p.name)                                          AS name,
      MAX(p.leisure)                                       AS leisure,
      MAX(p.operator)                                      AS operator,
      MAX(p.access)                                        AS access,
      MAX(p.surface)                                       AS surface,
      SUM(p.way_area)::int                                 AS area,
      (array_agg(p.tags ORDER BY ST_Area(p.way) DESC))[1] AS tags,
      ST_Transform(ST_Union(p.way), 4326)                  AS geom
    FROM planet_osm_polygon p
    JOIN region r ON ST_Within(p.way, r.way)
    WHERE p.leisure = 'playground'
    GROUP BY p.osm_id
    UNION ALL
    SELECT
      n.osm_id,
      'N'::text                                            AS osm_type,
      n.name,
      n.leisure,
      n.operator,
      n.access,
      n.surface,
      0                                                    AS area,
      n.tags,
      ST_Buffer(ST_Transform(n.way, 4326)::geography, 5)::geometry AS geom
    FROM planet_osm_point n
    JOIN region r ON ST_Within(n.way, r.way)
    WHERE n.leisure = 'playground'
  )
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(pl.geom)::json,
          'properties', (
            jsonb_build_object(
              'osm_id',             abs(pl.osm_id),
              'osm_type',           pl.osm_type,
              'name',               pl.name,
              'leisure',            pl.leisure,
              'operator',           pl.operator,
              'access',             pl.access,
              'surface',            pl.surface,
              'area',               pl.area,
              'tree_count',         COALESCE(s.tree_count, 0),
              'device_count',       COALESCE(s.device_count, 0),
              'bench_count',        COALESCE(s.bench_count, 0),
              'shelter_count',      COALESCE(s.shelter_count, 0),
              'picnic_count',       COALESCE(s.picnic_count, 0),
              'table_tennis_count', COALESCE(s.table_tennis_count, 0),
              'has_soccer',         COALESCE(s.has_soccer, false),
              'has_basketball',     COALESCE(s.has_basketball, false),
              'is_water',           COALESCE(s.is_water, false),
              'for_baby',           COALESCE(s.for_baby, false),
              'for_toddler',        COALESCE(s.for_toddler, false),
              'for_wheelchair',     COALESCE(s.for_wheelchair, false)
            ) || COALESCE(hstore_to_jsonb(pl.tags), '{}'::jsonb)
          )
        )
      ),
      '[]'::json
    )
  )
  FROM playgrounds pl
  LEFT JOIN public.playground_stats s ON s.osm_id = pl.osm_id AND s.osm_type = pl.osm_type;
$$;

GRANT EXECUTE ON FUNCTION api.get_playgrounds(bigint) TO web_anon;

COMMENT ON FUNCTION api.get_playgrounds(bigint) IS
  'DEPRECATED: use api.get_playgrounds_bbox. Scheduled for removal in the release after next.';

-- =========================================================================
-- 1a. get_playground_clusters(z, bbox)
--     Pre-aggregated cluster buckets for the cluster tier (zoom ≤
--     clusterMaxZoom, default 13). Snaps each playground centroid to a
--     zoom-appropriate grid as the *grouping key* and counts playgrounds per
--     cell, broken down by completeness plus a separate restricted count.
--     The emitted `lon` / `lat` is the unweighted spatial mean of the
--     bucket's member centroids (`ST_Centroid(ST_Collect(centroid_3857))`),
--     not the grid anchor — so the dot tracks the geographic distribution
--     of its members rather than a lattice. The cell-size table is
--     hardcoded in metres at the equator and extends through z=13;
--     lat-dependent visual correction is the client's concern.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playground_clusters(int, float8, float8, float8, float8);
DROP FUNCTION IF EXISTS api.get_playground_clusters(int, float8, float8, float8, float8, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean);
DROP FUNCTION IF EXISTS api.get_playground_clusters(int, float8, float8, float8, float8, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION api.get_playground_clusters(
  z                   int,
  min_lon             float8,
  min_lat             float8,
  max_lon             float8,
  max_lat             float8,
  filter_private      boolean DEFAULT false,
  filter_water        boolean DEFAULT false,
  filter_baby         boolean DEFAULT false,
  filter_toddler      boolean DEFAULT false,
  filter_wheelchair   boolean DEFAULT false,
  filter_bench        boolean DEFAULT false,
  filter_picnic       boolean DEFAULT false,
  filter_shelter      boolean DEFAULT false,
  filter_table_tennis boolean DEFAULT false,
  filter_soccer       boolean DEFAULT false,
  filter_basketball   boolean DEFAULT false,
  filter_complete     boolean DEFAULT true,
  filter_partial      boolean DEFAULT true,
  filter_missing      boolean DEFAULT true
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  ),
  cell_size AS (
    -- Monotonic halving from 10 000 000 m at z=0. Extends through z=13 so
    -- the cluster tier can cover zoom ≤ 13 (two-tier client design).
    SELECT (CASE z
      WHEN 0  THEN 10000000
      WHEN 1  THEN  5000000
      WHEN 2  THEN  2500000
      WHEN 3  THEN  1250000
      WHEN 4  THEN   625000
      WHEN 5  THEN   312500
      WHEN 6  THEN   156250
      WHEN 7  THEN    78125
      WHEN 8  THEN    39062
      WHEN 9  THEN    19531
      WHEN 10 THEN     9766
      WHEN 11 THEN     4883
      WHEN 12 THEN     2441
      WHEN 13 THEN     1221
      ELSE              610
    END)::float8 AS m
  ),
  buckets AS (
    SELECT
      ST_SnapToGrid(ps.centroid_3857, cs.m) AS cell,
      ps.centroid_3857,
      ps.osm_id,
      ps.completeness,
      ps.access_restricted
    FROM public.playground_stats ps, bbox b, cell_size cs
    WHERE ST_Intersects(ps.centroid_3857, b.geom)
      AND (NOT filter_private     OR NOT ps.access_restricted)
      AND (NOT filter_water       OR ps.is_water)
      AND (NOT filter_baby        OR ps.for_baby)
      AND (NOT filter_toddler     OR ps.for_toddler)
      AND (NOT filter_wheelchair  OR ps.for_wheelchair)
      AND (NOT filter_bench       OR ps.bench_count > 0)
      AND (NOT filter_picnic      OR ps.picnic_count > 0)
      AND (NOT filter_shelter     OR ps.shelter_count > 0)
      AND (NOT filter_table_tennis OR ps.table_tennis_count > 0)
      AND (NOT filter_soccer      OR ps.has_soccer)
      AND (NOT filter_basketball  OR ps.has_basketball)
      AND (
        (ps.completeness = 'complete' AND filter_complete)
        OR (ps.completeness = 'partial'  AND filter_partial)
        OR (ps.completeness = 'missing'  AND filter_missing)
      )
  ),
  aggregated AS (
    -- Restricted playgrounds are counted separately from the three
    -- completeness buckets so the ring renderer can paint them as a
    -- hatched "not public" segment. Invariant:
    --   count = complete + partial + missing + restricted
    -- The ST_Collect() ORDER BY guarantees bit-stable centroid output
    -- across plan changes (parallel scans, etc.) — the spec contract
    -- "each bucket's lon/lat is identical between calls" depends on it.
    SELECT
      cell,
      ST_Centroid(ST_Collect(centroid_3857 ORDER BY osm_id))                                        AS bucket_centroid_3857,
      COUNT(*)::int                                                                                 AS count,
      SUM(CASE WHEN NOT access_restricted AND completeness = 'complete' THEN 1 ELSE 0 END)::int     AS complete,
      SUM(CASE WHEN NOT access_restricted AND completeness = 'partial'  THEN 1 ELSE 0 END)::int     AS partial,
      SUM(CASE WHEN NOT access_restricted AND completeness = 'missing'  THEN 1 ELSE 0 END)::int     AS missing,
      SUM(CASE WHEN access_restricted                                   THEN 1 ELSE 0 END)::int     AS restricted
    FROM buckets
    GROUP BY cell
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'lon',        ST_X(ST_Transform(bucket_centroid_3857, 4326)),
        'lat',        ST_Y(ST_Transform(bucket_centroid_3857, 4326)),
        'count',      count,
        'complete',   complete,
        'partial',    partial,
        'missing',    missing,
        'restricted', restricted
      )
    ),
    '[]'::json
  )
  FROM aggregated;
$$;

GRANT EXECUTE ON FUNCTION api.get_playground_clusters(int, float8, float8, float8, float8, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) TO web_anon;

-- =========================================================================
-- 1b. get_playground_centroids(bbox)
--     Lightweight per-feature rows: osm_id, centroid lon/lat, completeness,
--     plus a `filter_attrs` object with the client filter booleans. Shipped
--     server-side for federation and future re-clustering scenarios; the
--     standalone client doesn't consume it after the two-tier pivot
--     (cluster tier covers zoom ≤ clusterMaxZoom directly).
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playground_centroids(float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_playground_centroids(
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'osm_id',       abs(ps.osm_id),
        'lon',          ST_X(ST_Transform(ps.centroid_3857, 4326)),
        'lat',          ST_Y(ST_Transform(ps.centroid_3857, 4326)),
        'completeness', ps.completeness,
        'filter_attrs', json_build_object(
          'has_water',         ps.is_water,
          'for_baby',          ps.for_baby,
          'for_toddler',       ps.for_toddler,
          'for_wheelchair',    ps.for_wheelchair,
          'has_soccer',        ps.has_soccer,
          'has_basketball',    ps.has_basketball,
          'access_restricted', ps.access_restricted
        )
      )
    ),
    '[]'::json
  )
  FROM public.playground_stats ps, bbox b
  WHERE ST_Intersects(ps.centroid_3857, b.geom);
$$;

GRANT EXECUTE ON FUNCTION api.get_playground_centroids(float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- 1c. get_playgrounds_bbox(bbox)
--     Bbox-scoped counterpart of get_playgrounds. Same response shape as the
--     region-scoped version so the polygon-tier client (zoom > clusterMaxZoom)
--     can reuse its existing feature parser. Uses ST_Intersects so
--     playgrounds touching the viewport edge are still returned.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playgrounds_bbox(float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_playgrounds_bbox(
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  ),
  -- Collect all osm_ids with at least one ring intersecting the viewport.
  -- Using a separate CTE instead of filtering playgrounds directly ensures that
  -- multipolygon relations (one osm_id, multiple planet_osm_polygon rows) are
  -- returned in full even when only one of their rings touches the bbox edge.
  ids_in_view AS (
    SELECT DISTINCT p.osm_id
    FROM planet_osm_polygon p
    JOIN bbox b ON ST_Intersects(p.way, b.geom)
    WHERE p.leisure = 'playground'
  ),
  playgrounds AS (
    SELECT
      p.osm_id,
      CASE WHEN p.osm_id < 0 THEN 'R' ELSE 'W' END        AS osm_type,
      MAX(p.name)                                          AS name,
      MAX(p.leisure)                                       AS leisure,
      MAX(p.operator)                                      AS operator,
      MAX(p.access)                                        AS access,
      MAX(p.surface)                                       AS surface,
      SUM(p.way_area)::int                                 AS area,
      (array_agg(p.tags ORDER BY ST_Area(p.way) DESC))[1] AS tags,
      ST_Transform(ST_Union(p.way), 4326)                  AS geom
    FROM planet_osm_polygon p
    JOIN ids_in_view i ON i.osm_id = p.osm_id
    WHERE p.leisure = 'playground'
    GROUP BY p.osm_id
    UNION ALL
    SELECT
      n.osm_id,
      'N'::text                                            AS osm_type,
      n.name,
      n.leisure,
      n.operator,
      n.access,
      n.surface,
      0                                                    AS area,
      n.tags,
      ST_Buffer(ST_Transform(n.way, 4326)::geography, 5)::geometry AS geom
    FROM planet_osm_point n
    JOIN bbox b ON ST_Intersects(n.way, b.geom)
    WHERE n.leisure = 'playground'
  )
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(pl.geom)::json,
          'properties', (
            jsonb_build_object(
              'osm_id',             abs(pl.osm_id),
              'osm_type',           pl.osm_type,
              'name',               pl.name,
              'leisure',            pl.leisure,
              'operator',           pl.operator,
              'access',             pl.access,
              'surface',            pl.surface,
              'area',               pl.area,
              'tree_count',         COALESCE(s.tree_count, 0),
              'device_count',       COALESCE(s.device_count, 0),
              'bench_count',        COALESCE(s.bench_count, 0),
              'shelter_count',      COALESCE(s.shelter_count, 0),
              'picnic_count',       COALESCE(s.picnic_count, 0),
              'table_tennis_count', COALESCE(s.table_tennis_count, 0),
              'has_soccer',         COALESCE(s.has_soccer, false),
              'has_basketball',     COALESCE(s.has_basketball, false),
              'is_water',           COALESCE(s.is_water, false),
              'for_baby',           COALESCE(s.for_baby, false),
              'for_toddler',        COALESCE(s.for_toddler, false),
              'for_wheelchair',     COALESCE(s.for_wheelchair, false)
            ) || COALESCE(hstore_to_jsonb(pl.tags), '{}'::jsonb)
          )
        )
      ),
      '[]'::json
    )
  )
  FROM playgrounds pl
  LEFT JOIN public.playground_stats s ON s.osm_id = pl.osm_id AND s.osm_type = pl.osm_type;
$$;

GRANT EXECUTE ON FUNCTION api.get_playgrounds_bbox(float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- 1d. get_playground(osm_id)
--     Single-feature lookup used by deeplink hydration and the nearby-list
--     "select" handler when the polygon source isn't populated for the
--     current viewport (zoom ≤ clusterMaxZoom). Same per-feature shape as
--     a single feature inside get_playgrounds_bbox.features. Prefers a
--     relation row (osm_id < 0) over a way row of the same magnitude.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_playground(bigint);

CREATE OR REPLACE FUNCTION api.get_playground(osm_id bigint)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH candidates AS (
    -- polygon / relation playgrounds (prefer relation over way if same numeric id)
    SELECT
      x.osm_id,
      CASE WHEN x.osm_id < 0 THEN 'R' ELSE 'W' END AS osm_type,
      x.name,
      x.leisure,
      x.operator,
      x.access,
      x.surface,
      x.way_area::int AS area,
      x.tags,
      ST_Transform(x.way, 4326) AS geom,
      1 AS priority
    FROM planet_osm_polygon x
    WHERE x.leisure = 'playground'
      AND abs(x.osm_id) = abs($1)
    UNION ALL
    -- node playgrounds (fallback when no polygon exists for this id)
    SELECT
      n.osm_id,
      'N'::text AS osm_type,
      n.name,
      n.leisure,
      n.operator,
      n.access,
      n.surface,
      0 AS area,
      n.tags,
      ST_Buffer(ST_Transform(n.way, 4326)::geography, 5)::geometry AS geom,
      2 AS priority
    FROM planet_osm_point n
    WHERE n.leisure = 'playground'
      AND n.osm_id = abs($1)
  ),
  p AS (
    SELECT * FROM candidates
    ORDER BY priority ASC, (osm_id < 0) DESC
    LIMIT 1
  )
  SELECT json_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(p.geom)::json,
    'properties', (
      jsonb_build_object(
        'osm_id',             abs(p.osm_id),
        'osm_type',           p.osm_type,
        'name',               p.name,
        'leisure',            p.leisure,
        'operator',           p.operator,
        'access',             p.access,
        'surface',            p.surface,
        'area',               p.area,
        'tree_count',         COALESCE(s.tree_count, 0),
        'device_count',       COALESCE(s.device_count, 0),
        'bench_count',        COALESCE(s.bench_count, 0),
        'shelter_count',      COALESCE(s.shelter_count, 0),
        'picnic_count',       COALESCE(s.picnic_count, 0),
        'table_tennis_count', COALESCE(s.table_tennis_count, 0),
        'has_soccer',         COALESCE(s.has_soccer, false),
        'has_basketball',     COALESCE(s.has_basketball, false),
        'is_water',           COALESCE(s.is_water, false),
        'for_baby',           COALESCE(s.for_baby, false),
        'for_toddler',        COALESCE(s.for_toddler, false),
        'for_wheelchair',     COALESCE(s.for_wheelchair, false)
      ) || COALESCE(hstore_to_jsonb(p.tags), '{}'::jsonb)
    )
  )
  FROM p
  LEFT JOIN public.playground_stats s ON s.osm_id = p.osm_id AND s.osm_type = p.osm_type;
$$;

GRANT EXECUTE ON FUNCTION api.get_playground(bigint) TO web_anon;

-- =========================================================================
-- 2. get_equipment(min_lon, min_lat, max_lon, max_lat)
--    Returns playground equipment and amenities within a WGS84 bounding box
--    as a GeoJSON FeatureCollection.
--    Covers nodes and polygon ways (e.g. large pitches).
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_equipment(float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_equipment(
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  ),
  -- Nodes (playground devices, benches, shelters …)
  equip_nodes AS (
    SELECT
      p.osm_id,
      'N'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_point p, bbox b
    WHERE p.way && b.geom
      AND (
        p.tags ? 'playground'              -- playground=slide / swing / …
        OR p.amenity IN ('bench', 'shelter')
        OR p.leisure IN ('picnic_table', 'pitch', 'fitness_station')
      )
  ),
  -- Ways rendered as polygons (pitches, large shelters …)
  equip_ways AS (
    SELECT
      p.osm_id,
      'W'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_polygon p, bbox b
    WHERE p.way && b.geom
      AND (
        p.tags ? 'playground'
        OR p.amenity IN ('bench', 'shelter')
        OR p.leisure IN ('picnic_table', 'pitch', 'fitness_station')
      )
  ),
  -- Ways rendered as lines (zip wires, slides mapped as linear ways …).
  -- playground=structure closed ways land here (not in planet_osm_polygon)
  -- because osm2pgsql's classic schema does not treat that tag as an area.
  -- Emit them as Polygon so equipmentGrouping.js can use them as containers.
  equip_lines AS (
    SELECT
      p.osm_id,
      'W'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      CASE
        WHEN p.tags->'playground' = 'structure'
             AND ST_IsClosed(p.way)
             AND ST_NPoints(p.way) >= 4
        THEN ST_Transform(ST_MakePolygon(p.way), 4326)
        ELSE ST_Transform(p.way, 4326)
      END AS geom
    FROM planet_osm_line p, bbox b
    WHERE p.way && b.geom
      AND (
        p.tags ? 'playground'
        OR p.amenity IN ('bench', 'shelter')
        OR p.leisure IN ('picnic_table', 'pitch', 'fitness_station')
      )
  ),
  all_equip AS (
    SELECT * FROM equip_nodes
    UNION ALL
    SELECT * FROM equip_ways
    UNION ALL
    SELECT * FROM equip_lines
  )
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(geom)::json,
          'properties', (
            jsonb_build_object(
              'osm_id',   abs(osm_id),
              'osm_type', osm_type,
              'name',     name,
              'amenity',  amenity,
              'leisure',  leisure,
              'sport',    sport
            ) || COALESCE(hstore_to_jsonb(tags), '{}'::jsonb)
          )
        )
      ),
      '[]'::json
    )
  )
  FROM all_equip;
$$;

GRANT EXECUTE ON FUNCTION api.get_equipment(float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- 3. get_standalone_equipment(min_lon, min_lat, max_lon, max_lat)
--    Returns pitches, benches, shelters, picnic tables and fitness stations
--    (nodes and polygon ways) that do NOT lie within any
--    leisure=playground polygon.  The GeoJSON shape matches get_equipment
--    so the same frontend styles and tooltip can be reused.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_standalone_pitches(float8, float8, float8, float8);
DROP FUNCTION IF EXISTS api.get_standalone_equipment(float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_standalone_equipment(
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  ),
  -- Standalone pitch polygons in the bbox (not intersecting any playground)
  pitch_areas AS (
    SELECT p.way
    FROM planet_osm_polygon p, bbox b
    WHERE p.way && b.geom
      AND p.leisure = 'pitch'
      AND NOT EXISTS (
        SELECT 1 FROM planet_osm_polygon pg
        WHERE pg.leisure = 'playground'
          AND ST_Intersects(p.way, pg.way)
      )
  ),
  -- The pitch polygons themselves
  pitch_ways AS (
    SELECT
      p.osm_id,
      'W'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_polygon p, bbox b
    WHERE p.way && b.geom
      AND p.leisure = 'pitch'
      AND NOT EXISTS (
        SELECT 1 FROM planet_osm_polygon pg
        WHERE pg.leisure = 'playground'
          AND ST_Intersects(p.way, pg.way)
      )
  ),
  -- Standalone pitch nodes (not within any playground)
  pitch_nodes AS (
    SELECT
      p.osm_id,
      'N'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_point p, bbox b
    WHERE p.way && b.geom
      AND p.leisure = 'pitch'
      AND NOT EXISTS (
        SELECT 1 FROM planet_osm_polygon pg
        WHERE pg.leisure = 'playground'
          AND ST_Within(p.way, pg.way)
      )
  ),
  -- Equipment nodes (benches, shelters, etc.) within a standalone pitch polygon
  equip_nodes AS (
    SELECT
      p.osm_id,
      'N'::text AS osm_type,
      p.name,
      p.amenity,
      p.leisure,
      p.sport,
      p.tags,
      ST_Transform(p.way, 4326) AS geom
    FROM planet_osm_point p
    JOIN pitch_areas pa ON ST_Within(p.way, pa.way)
    WHERE
      p.amenity IN ('bench', 'shelter')
      OR p.leisure IN ('picnic_table', 'fitness_station')
  ),
  all_features AS (
    SELECT * FROM pitch_ways
    UNION ALL
    SELECT * FROM pitch_nodes
    UNION ALL
    SELECT * FROM equip_nodes
  )
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(geom)::json,
          'properties', (
            jsonb_build_object(
              'osm_id',   abs(osm_id),
              'osm_type', osm_type,
              'name',     name,
              'amenity',  amenity,
              'leisure',  leisure,
              'sport',    sport
            ) || COALESCE(hstore_to_jsonb(tags), '{}'::jsonb)
          )
        )
      ),
      '[]'::json
    )
  )
  FROM all_features;
$$;

GRANT EXECUTE ON FUNCTION api.get_standalone_equipment(float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- 4. get_pois(lat, lon, radius_m)
--    Returns nearby POIs within radius_m metres of the given point.
--    Return shape matches the existing frontend: array of
--      { lat, lon, osm_id, tags: { … } }
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_pois(float8, float8, integer);

CREATE OR REPLACE FUNCTION api.get_pois(
  lat      float8,
  lon      float8,
  radius_m integer DEFAULT 500
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH center AS (
    SELECT ST_Transform(
      ST_SetSRID(ST_MakePoint(lon, lat), 4326),
      3857
    ) AS geom
  ),
  pois_point AS (
    SELECT
      p.osm_id,
      p.name,
      p.amenity,
      p.shop,
      p.highway,
      p.tags,
      ST_Y(ST_Transform(p.way, 4326)) AS poi_lat,
      ST_X(ST_Transform(p.way, 4326)) AS poi_lon
    FROM planet_osm_point p, center c
    WHERE ST_DWithin(p.way, c.geom, radius_m)
      AND (
        p.amenity IN ('toilets', 'ice_cream')
        OR (p.amenity IN ('cafe', 'restaurant') AND p.tags->'cuisine' ~* 'ice_cream')
        OR (p.tags->'emergency' = 'yes'         AND p.amenity IN ('hospital', 'clinic', 'doctors'))
        OR p.tags->'healthcare:speciality' = 'emergency'
        OR p.highway = 'bus_stop'
        OR p.shop IN ('chemist', 'supermarket', 'convenience')
      )
  ),
  -- Shops/amenities mapped as polygons (e.g. supermarket buildings) — use centroid
  pois_polygon AS (
    SELECT
      p.osm_id,
      p.name,
      p.amenity,
      p.shop,
      NULL::text AS highway,
      p.tags,
      ST_Y(ST_Transform(ST_Centroid(p.way), 4326)) AS poi_lat,
      ST_X(ST_Transform(ST_Centroid(p.way), 4326)) AS poi_lon
    FROM planet_osm_polygon p, center c
    WHERE ST_DWithin(p.way, c.geom, radius_m)
      AND (
        p.amenity IN ('toilets', 'ice_cream')
        OR (p.amenity IN ('cafe', 'restaurant') AND p.tags->'cuisine' ~* 'ice_cream')
        OR p.shop IN ('chemist', 'supermarket', 'convenience')
        OR p.tags->'healthcare:speciality' = 'emergency'
      )
  ),
  pois AS (
    SELECT * FROM pois_point
    UNION ALL
    -- exclude polygons already represented by a node (same osm_id with opposite sign)
    SELECT pp.* FROM pois_polygon pp
    WHERE NOT EXISTS (
      SELECT 1 FROM pois_point pt WHERE pt.osm_id = -pp.osm_id
    )
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'lat',    poi_lat,
        'lon',    poi_lon,
        'osm_id', abs(osm_id),
        'tags', (
          jsonb_build_object(
            'name',    name,
            'amenity', amenity,
            'shop',    shop,
            'highway', highway
          ) || COALESCE(hstore_to_jsonb(tags), '{}'::jsonb)
        )
      )
    ),
    '[]'::json
  )
  FROM pois;
$$;

GRANT EXECUTE ON FUNCTION api.get_pois(float8, float8, integer) TO web_anon;

-- =========================================================================
-- 4. get_trees(min_lon, min_lat, max_lon, max_lat)
--    Returns natural=tree nodes and natural=tree_row lines within a WGS84
--    bounding box as GeoJSON. Each feature carries a `feature_type` property
--    ('tree' or 'tree_row'). Tree rows also carry `length_m` (rounded metres)
--    so the frontend can display row lengths without a fake tree-count estimate.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_trees(float8, float8, float8, float8);

CREATE OR REPLACE FUNCTION api.get_trees(
  min_lon float8,
  min_lat float8,
  max_lon float8,
  max_lat float8
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH bbox AS (
    SELECT ST_Transform(
      ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
      3857
    ) AS geom
  ),
  features AS (
    SELECT
      p.osm_id,
      p.name,
      p.way,
      'tree'::text    AS feature_type,
      NULL::int       AS length_m,
      hstore_to_jsonb(p.tags) AS tags
    FROM planet_osm_point p, bbox b
    WHERE p.way && b.geom
      AND p.natural = 'tree'
    UNION ALL
    SELECT
      l.osm_id,
      l.name,
      l.way,
      'tree_row'::text                            AS feature_type,
      round(ST_Length(ST_Transform(l.way, 4326)::geography))::int AS length_m,
      hstore_to_jsonb(l.tags)                     AS tags
    FROM planet_osm_line l, bbox b
    WHERE l.way && b.geom
      AND l.natural = 'tree_row'
  )
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(ST_Transform(f.way, 4326))::json,
          'properties', jsonb_build_object(
            'osm_id',       f.osm_id,
            'name',         f.name,
            'feature_type', f.feature_type,
            'length_m',     f.length_m
          ) || COALESCE(f.tags, '{}'::jsonb)
        )
      ),
      '[]'::json
    )
  )
  FROM features f;
$$;

GRANT EXECUTE ON FUNCTION api.get_trees(float8, float8, float8, float8) TO web_anon;

-- =========================================================================
-- import_status — singleton table persisting the last successful import time.
--   Written by import.sh after each successful osm2pgsql + api.sql run.
--   Read by get_meta to expose data freshness to the hub.
--   CHECK (id = 1) enforces singleton; UPSERT via ON CONFLICT (id) DO UPDATE.
-- =========================================================================
CREATE TABLE IF NOT EXISTS api.import_status (
  id                  int          PRIMARY KEY CHECK (id = 1),
  last_import_at      timestamptz  NOT NULL,
  -- osm_data_timestamp is the `osmosis_replication_timestamp` from the PBF
  -- header — i.e. when Geofabrik (or whoever produced the PBF) last
  -- snapshotted OSM. Distinct from `last_import_at` (when our importer
  -- ran): the importer can run hourly against a PBF that refreshes
  -- weekly. Surfaced to users as "OSM data is N days old"; surfaced to
  -- operators as `last_import_at` ("did the cron run").
  osm_data_timestamp  timestamptz,
  source_pbf_url      text,
  pbf_etag            text,
  -- Set to true by import.sh immediately before osm2pgsql runs;
  -- cleared unconditionally via EXIT trap (success, failure, or signal).
  importing           boolean      NOT NULL DEFAULT false
);

-- Idempotent ALTERs for upgrades from older deployments.
ALTER TABLE api.import_status
  ADD COLUMN IF NOT EXISTS osm_data_timestamp timestamptz;
ALTER TABLE api.import_status
  ADD COLUMN IF NOT EXISTS importing boolean NOT NULL DEFAULT false;

GRANT SELECT ON api.import_status TO web_anon;

-- =========================================================================
-- 5a. legal_content — stores generated Impressum / Datenschutz HTML for
--     data-node backends (no nginx webroot). Written by docker-entrypoint.sh
--     at container startup via psql. Read by get_legal().
-- =========================================================================
CREATE TABLE IF NOT EXISTS api.legal_content (
  type        text        PRIMARY KEY CHECK (type IN ('impressum', 'datenschutz')),
  content     text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON api.legal_content TO web_anon;

-- =========================================================================
-- 5. get_meta(relation_id)
--    Returns instance metadata for federation (Hub discovery).
--    Includes the OSM relation name, playground count, and bounding box.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_meta(bigint);

CREATE OR REPLACE FUNCTION api.get_meta(relation_id bigint DEFAULT ${OSM_RELATION_ID})
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH region AS (
    -- Prefer the polygon table (osm2pgsql assembles the state boundary relation
    -- into a polygon when all member ways form a closed ring). Fall back to
    -- planet_osm_line when the polygon is absent — this happens for states like
    -- Brandenburg whose boundary sub-relations can't be fully assembled from the
    -- osmium-filtered PBF (ring gaps), so osm2pgsql stores 33 open linestrings
    -- instead. COALESCE picks the polygon values when available; the line fallback
    -- gives a valid bbox (ST_Extent over linestring endpoints) and a convex-hull
    -- approximation for region_geom (sufficient for hub overlap detection).
    SELECT
      COALESCE(
        (SELECT max(name) FROM planet_osm_polygon WHERE osm_id = -relation_id),
        (SELECT max(name) FROM planet_osm_line    WHERE osm_id = -relation_id)
      ) AS name,
      COALESCE(
        ST_Transform(ST_SetSRID(
          (SELECT ST_Extent(way)::geometry FROM planet_osm_polygon WHERE osm_id = -relation_id),
          3857), 4326),
        ST_Transform(ST_SetSRID(
          (SELECT ST_Extent(way)::geometry FROM planet_osm_line WHERE osm_id = -relation_id),
          3857), 4326)
      ) AS bbox_geom,
      -- Simplified boundary polygon for hub overlap detection. Prefer the true
      -- polygon; fall back to a convex hull of the line segments (rough but
      -- non-NULL, good enough for containment checks).
      COALESCE(
        (SELECT ST_AsGeoJSON(
                    ST_SimplifyPreserveTopology(
                        ST_Transform(ST_Union(way), 4326), 0.05))::jsonb
         FROM planet_osm_polygon WHERE osm_id = -relation_id
         HAVING count(*) > 0),
        (SELECT ST_AsGeoJSON(
                    ST_ConvexHull(ST_Collect(ST_Transform(way, 4326))))::jsonb
         FROM planet_osm_line WHERE osm_id = -relation_id
         HAVING count(*) > 0)
      ) AS region_geom
  ),
  counts AS (
    -- playground_stats now includes all playgrounds in the DB without a region
    -- spatial filter (see playground_stats definition for why). Every row is
    -- within the configured region because each stack imports one region's PBF.
    SELECT
      COUNT(*)::int                                                        AS playground_count,
      SUM(CASE WHEN ps.completeness = 'complete' THEN 1 ELSE 0 END)::int   AS complete,
      SUM(CASE WHEN ps.completeness = 'partial'  THEN 1 ELSE 0 END)::int   AS partial,
      SUM(CASE WHEN ps.completeness = 'missing'  THEN 1 ELSE 0 END)::int   AS missing
    FROM public.playground_stats ps
  ),
  import_status AS (
    -- NULL when no import has run yet (table empty); callers must handle NULL.
    SELECT last_import_at, osm_data_timestamp, importing FROM api.import_status WHERE id = 1
  )
  SELECT json_build_object(
    'relation_id',           relation_id,
    'name',                  (SELECT name FROM region),
    'playground_count',      (SELECT playground_count FROM counts),
    'complete',              (SELECT complete         FROM counts),
    'partial',               (SELECT partial          FROM counts),
    'missing',               (SELECT missing          FROM counts),
    'bbox',                  ARRAY[
                               ST_XMin((SELECT bbox_geom FROM region)),
                               ST_YMin((SELECT bbox_geom FROM region)),
                               ST_XMax((SELECT bbox_geom FROM region)),
                               ST_YMax((SELECT bbox_geom FROM region))
                             ],
    'last_import_at',        (SELECT last_import_at FROM import_status),
    'data_age_seconds',      (SELECT EXTRACT(EPOCH FROM (now() - last_import_at))::int FROM import_status),
    -- `osm_data_timestamp` is the moment OSM last produced the data this
    -- backend serves (PBF replication timestamp); `osm_data_age_seconds`
    -- is the user-facing "how old is this data?" derived value.
    'osm_data_timestamp',    (SELECT osm_data_timestamp FROM import_status),
    'osm_data_age_seconds',  (SELECT EXTRACT(EPOCH FROM (now() - osm_data_timestamp))::int FROM import_status),
    'importing',             COALESCE((SELECT importing FROM import_status), false),
    'version',               '${SPIELI_VERSION}',
    -- Legal URLs: IMPRESSUM_URL / PRIVACY_URL take priority; fall back to SITE_URL+path.
    -- envsubst fills these placeholders at import time (same pipeline as OSM_RELATION_ID).
    -- NULL when neither override nor SITE_URL is configured.
    'impressum_url',         CASE
                               WHEN '${IMPRESSUM_URL}' <> '' THEN '${IMPRESSUM_URL}'
                               WHEN '${SITE_URL}' <> ''      THEN '${SITE_URL}' || '/impressum'
                               ELSE NULL
                             END,
    'privacy_url',           CASE
                               WHEN '${PRIVACY_URL}' <> '' THEN '${PRIVACY_URL}'
                               WHEN '${SITE_URL}' <> ''    THEN '${SITE_URL}' || '/datenschutz'
                               ELSE NULL
                             END,
    -- true when legal content is stored in api.legal_content (data-node path).
    -- Hub uses this to decide whether to show § / 🔒 icons even when impressum_url / privacy_url are null.
    -- to_regclass guard: returns false on older backends where the table doesn't exist yet.
    'has_legal',             CASE
                               WHEN to_regclass('api.legal_content') IS NOT NULL
                               THEN EXISTS(SELECT 1 FROM api.legal_content)
                               ELSE false
                             END,
    'region_geom',           (SELECT region_geom FROM region)
  );
$$;

GRANT EXECUTE ON FUNCTION api.get_meta(bigint) TO web_anon;

-- =========================================================================
-- 5b. get_legal(type)
--     Returns generated legal HTML for data-node backends. The hub calls
--     this when get_meta() returns null impressum_url / privacy_url.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_legal(text);

CREATE OR REPLACE FUNCTION api.get_legal(type text)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = api
AS $$
  SELECT CASE
    WHEN content IS NOT NULL THEN json_build_object('content', content)
    ELSE NULL
  END
  FROM api.legal_content lc
  WHERE lc.type = get_legal.type;
$$;

GRANT EXECUTE ON FUNCTION api.get_legal(text) TO web_anon;

CREATE INDEX IF NOT EXISTS idx_osm_point_natural ON planet_osm_point ("natural") WHERE "natural" IS NOT NULL;

-- Spatial indexes to speed up bbox and radius queries (idempotent)
-- =========================================================================
-- 6. get_nearest_playgrounds(lat, lon, relation_id, max_results)
--    Returns the nearest playgrounds to a given WGS84 point,
--    ordered by distance ascending.
-- =========================================================================
DROP FUNCTION IF EXISTS api.get_nearest_playgrounds(float8, float8, bigint, int);

CREATE OR REPLACE FUNCTION api.get_nearest_playgrounds(
  lat          float8,
  lon          float8,
  relation_id  bigint DEFAULT ${OSM_RELATION_ID},
  max_results  int    DEFAULT 5
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api
AS $$
  WITH center AS (
    SELECT
      ST_Transform(ST_SetSRID(ST_MakePoint(lon, lat), 4326), 3857)  AS geom_3857,
      ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography            AS geog_4326
  ),
  region AS (
    SELECT ST_Union(way) AS way FROM planet_osm_polygon WHERE osm_id = -relation_id
  ),
  pg_candidates AS (
    SELECT p.osm_id, p.name, p.operator, p.access, p.surface, p.tags, p.way
    FROM planet_osm_polygon p, region r
    WHERE p.leisure = 'playground'
      AND ST_Within(p.way, r.way)
    UNION ALL
    SELECT p.osm_id, p.name, p.operator, p.access, p.surface, p.tags, p.way
    FROM planet_osm_point p, region r
    WHERE p.leisure = 'playground'
      AND ST_Within(p.way, r.way)
  ),
  nearest AS (
    SELECT
      cand.osm_id,
      cand.name,
      cand.operator,
      cand.access,
      cand.surface,
      cand.tags,
      ST_Distance(ST_Transform(cand.way, 4326)::geography, c.geog_4326) AS distance_m,
      ST_Y(ST_Transform(ST_Centroid(cand.way), 4326))                   AS centroid_lat,
      ST_X(ST_Transform(ST_Centroid(cand.way), 4326))                   AS centroid_lon
    FROM pg_candidates cand, center c
    ORDER BY cand.way <-> c.geom_3857
    LIMIT max_results
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'osm_id',      abs(osm_id),
        'name',        name,
        'lat',         centroid_lat,
        'lon',         centroid_lon,
        'distance_m',  round(distance_m::numeric),
        'tags', (
          jsonb_build_object(
            'name',          name,
            'operator',      operator,
            'access',        access,
            'surface',       surface
          ) || COALESCE(hstore_to_jsonb(tags), '{}'::jsonb)
        )
      )
      ORDER BY distance_m
    ),
    '[]'::json
  )
  FROM nearest;
$$;

GRANT EXECUTE ON FUNCTION api.get_nearest_playgrounds(float8, float8, bigint, int) TO web_anon;

CREATE INDEX IF NOT EXISTS idx_osm_polygon_way  ON planet_osm_polygon USING GIST (way);
CREATE INDEX IF NOT EXISTS idx_osm_point_way    ON planet_osm_point   USING GIST (way);
CREATE INDEX IF NOT EXISTS idx_osm_polygon_lei  ON planet_osm_polygon (leisure) WHERE leisure IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_point_lei    ON planet_osm_point   (leisure) WHERE leisure IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_point_amenity ON planet_osm_point  (amenity) WHERE amenity IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_point_shop    ON planet_osm_point  (shop)    WHERE shop    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_point_highway ON planet_osm_point  (highway) WHERE highway IS NOT NULL;
