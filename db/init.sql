-- Runs once when the PostGIS container is first initialised (empty data dir).
-- Sets up extensions, the api schema, and the web_anon role used by PostgREST.
-- The actual API functions are created by the importer after osm2pgsql finishes.

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

-- PostgREST connects as the main DB user and switches to web_anon for requests.
-- The main user (set via POSTGRES_USER in the compose file) must be granted this role.
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
