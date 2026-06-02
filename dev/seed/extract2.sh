#!/usr/bin/env bash
# Regenerate dev/seed/seed2.sql from the running Docker Compose DB2 (Neuhof).
# Run from the repo root: bash dev/seed/extract2.sh
# Requires a running 'db2' container (make up or docker compose up db2 -d).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT="$SCRIPT_DIR/seed2.sql"

cd "$REPO_ROOT"

# OSM IDs of the 5 sample playgrounds and the region relation
PLAYGROUND_IDS="78251865, 73650598, 1287820433, 83657338, 1354463505"
REGION_ID="-454881"
RELATION_ID="454881"

echo "Extracting dev seed data from running DB2 (Neuhof)..."

exec_psql() { docker compose exec -T db2 psql -U osm -d osm "$@"; }

{
cat << 'HEADER'
-- Dev fixture database seed for spieli — Neuhof (second backend)
-- Contains 5 sample playgrounds from Neuhof + the Neuhof region polygon.
-- Regenerate with: bash dev/seed/extract2.sh
-- Load with: make seed-load2
--
-- Playgrounds included:
--   78251865     Spielplatz Neuhof
--   73650598     Spielplatz Neuhof
-- 1287820433     Spielplatz Neuhof
--   83657338     Spielplatz Neuhof
-- 1354463505     Spielplatz Neuhof
-- Region:
--  -454881       Neuhof (OSM relation 454881)

\set ON_ERROR_STOP on

-- Extensions and schema setup (mirrors db/init.sql)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE SCHEMA IF NOT EXISTS api;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon NOLOGIN;
  END IF;
END
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.roleid
    JOIN pg_roles u ON u.oid = m.member
    WHERE r.rolname = 'web_anon' AND u.rolname = current_user
  ) THEN
    EXECUTE format('GRANT web_anon TO %I', current_user);
  END IF;
END
$$;
GRANT USAGE ON SCHEMA api TO web_anon;

HEADER

  # Table DDL
  docker compose exec -T db2 pg_dump -U osm osm --schema-only \
    -t planet_osm_polygon -t planet_osm_point -t planet_osm_line \
    2>/dev/null \
  | python3 -c "
import sys, re
content = sys.stdin.read()
tables = re.findall(r'(CREATE TABLE public\.planet_osm_\w+ \(.*?\);)', content, re.DOTALL)
indexes = re.findall(r'(CREATE INDEX \S+ ON public\.planet_osm_\w+ .*?;)', content)
print('-- Table definitions')
for t in tables:
    t = t.replace('CREATE TABLE public.', 'CREATE TABLE IF NOT EXISTS public.')
    print(t)
    print()
print('-- Indexes')
for idx in indexes:
    idx = idx.replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ', 1)
    print(idx)
print()
"

  echo "-- Truncate before loading so seed is idempotent on populated databases"
  echo "TRUNCATE TABLE planet_osm_polygon, planet_osm_point, planet_osm_line;"
  echo ""
  echo "-- Data"
  echo ""

  echo "COPY public.planet_osm_polygon FROM STDIN;"
  exec_psql -c "COPY (
    SELECT * FROM planet_osm_polygon
    WHERE osm_id IN ($PLAYGROUND_IDS, $REGION_ID)
  ) TO STDOUT WITH (FORMAT text)" 2>/dev/null
  echo "\."
  echo ""

  echo "COPY public.planet_osm_point FROM STDIN;"
  exec_psql -c "COPY (
    SELECT DISTINCT p.* FROM planet_osm_point p
    JOIN planet_osm_polygon pg ON ST_DWithin(p.way, pg.way, 100)
    WHERE pg.osm_id IN ($PLAYGROUND_IDS)
  ) TO STDOUT WITH (FORMAT text)" 2>/dev/null
  echo "\."
  echo ""

  echo "COPY public.planet_osm_line FROM STDIN;"
  exec_psql -c "COPY (
    SELECT DISTINCT l.* FROM planet_osm_line l
    JOIN planet_osm_polygon pg ON ST_DWithin(l.way, pg.way, 100)
    WHERE pg.osm_id IN ($PLAYGROUND_IDS)
  ) TO STDOUT WITH (FORMAT text)" 2>/dev/null
  echo "\."
  echo ""

  echo "-- API functions (from importer/api.sql with OSM_RELATION_ID=$RELATION_ID)"
  sed "s/\${OSM_RELATION_ID}/$RELATION_ID/g" importer/api.sql

} > "$OUT"

echo "Written: $OUT ($(wc -l < "$OUT") lines)"
