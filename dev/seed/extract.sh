#!/usr/bin/env bash
# Regenerate dev/seed/seed.sql from the running Docker Compose DB.
# Run from the repo root: bash dev/seed/extract.sh
# Requires a running 'db' container (make up or docker compose up db -d).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT="$SCRIPT_DIR/seed.sql"

cd "$REPO_ROOT"

# OSM IDs of the 4 sample playgrounds and the region relation
PLAYGROUND_IDS="37808214, 165956764, 818585707, 26796507"
REGION_ID="-62700"
RELATION_ID="62700"

echo "Extracting dev seed data from running DB..."

exec_psql() { docker compose exec -T db psql -U osm -d osm "$@"; }

{
cat << 'HEADER'
-- Dev fixture database seed for spieli
-- Contains 4 sample playgrounds from Fulda/Hessen + the Hessen region polygon.
-- Regenerate with: bash dev/seed/extract.sh
-- Load with: make seed-load
--
-- Playgrounds included:
--   37808214   Grezzbachpark
--  165956764   Bewegungspark Fuldaaue
--  818585707   Spielplatz Carl-Schurz-Straße II
--   26796507   (unnamed playground)
-- Region:
--  -62700      Hessen (OSM relation 62700)

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
  docker compose exec -T db pg_dump -U osm osm --schema-only \
    -t planet_osm_polygon -t planet_osm_point -t planet_osm_line \
    2>/dev/null \
  | grep -E '^(CREATE TABLE|    [a-z"]|^    "[a-z]|\);$)' \
  | sed '/^ALTER/d'

  # Extract tables properly via pg_dump filtered output
  docker compose exec -T db pg_dump -U osm osm --schema-only \
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
