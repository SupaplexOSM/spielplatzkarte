#!/bin/sh
# Full re-import of OSM data into PostGIS.
# Run via: docker compose run --rm importer
#
# Environment variables:
#   PBF_URL                Geofabrik .osm.pbf download URL
#                          Default: Hessen extract (≈ 300 MB, covers Fulda)
#   OSM_RELATION_ID        OSM relation ID of the target region (used for Nominatim bbox lookup)
#   OSM_BBOX               Optional bbox override: west,south,east,north (skips Nominatim)
#   OSM_BBOX_PADDING       Degrees to pad bbox on each side (default: 0.15 ≈ 15 km)
#   OSM_PREFILTER_MIN_MB   Skip bbox pre-filter if source PBF is smaller than this (default: 20)
#   POSTGRES_HOST          Default: db
#   POSTGRES_PORT          Default: 5432
#   POSTGRES_DB            Default: osm
#   POSTGRES_USER          Default: osm
#   POSTGRES_PASSWORD      Required
#   OSM2PGSQL_THREADS      Default: 4
#   REIMPORT_INTERVAL_MIN_DAYS   Minimum days between automatic re-imports (daemon mode).
#                                Both MIN and MAX must be set to enable daemon mode.
#   REIMPORT_INTERVAL_MAX_DAYS   Maximum days between automatic re-imports (daemon mode).
#                                A uniformly random interval in [MIN, MAX] is chosen each cycle.
#   API_ONLY                     When non-empty, skip PBF download and osm2pgsql import.
#                                Only re-apply api.sql and reload PostgREST. Use to update
#                                API functions (e.g. after a version bump) without a full
#                                re-import: docker compose run --rm -e API_ONLY=true importer

# `-e` aborts on any unchecked non-zero exit. The script's shebang is
# `#!/bin/sh` and the importer image's /bin/sh is busybox / dash, neither of
# which supports `set -o pipefail` (bash extension). The `envsubst | psql`
# pipeline that applies api.sql is therefore restructured to write to a
# tempfile via `> "$TMP_API_SQL"` so `set -e` catches envsubst failures,
# and psql is invoked with `-f "$TMP_API_SQL" -v ON_ERROR_STOP=1` so a SQL
# error inside api.sql aborts before the api.import_status UPSERT runs —
# matching the scheduled-importer spec scenario "Failed run does not
# update timestamp" without depending on `pipefail`.
set -e

PBF_URL="${PBF_URL:-https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf}"
PBF_FILE="/data/$(basename "$PBF_URL")"
PBF_BASENAME=$(basename "$PBF_FILE" .pbf)

OSM_BBOX="${OSM_BBOX:-}"
OSM_BBOX_PADDING="${OSM_BBOX_PADDING:-0.15}"
OSM_PREFILTER_MIN_MB="${OSM_PREFILTER_MIN_MB:-20}"

POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-osm}"
POSTGRES_USER="${POSTGRES_USER:-osm}"
OSM2PGSQL_THREADS="${OSM2PGSQL_THREADS:-4}"

PG_MAX_PARALLEL_WORKERS="${PG_MAX_PARALLEL_WORKERS:-2}"
PG_MAX_PARALLEL_WORKERS_PER_GATHER="${PG_MAX_PARALLEL_WORKERS_PER_GATHER:-2}"
PG_MAX_PARALLEL_MAINTENANCE_WORKERS="${PG_MAX_PARALLEL_MAINTENANCE_WORKERS:-2}"
PG_MAINTENANCE_WORK_MEM="${PG_MAINTENANCE_WORK_MEM:-256MB}"
PG_WORK_MEM="${PG_WORK_MEM:-32MB}"

REIMPORT_INTERVAL_MIN_DAYS="${REIMPORT_INTERVAL_MIN_DAYS:-}"
REIMPORT_INTERVAL_MAX_DAYS="${REIMPORT_INTERVAL_MAX_DAYS:-}"
REIMPORT_STARTUP_JITTER_MAX_HOURS="${REIMPORT_STARTUP_JITTER_MAX_HOURS:-0}"
API_ONLY="${API_ONLY:-}"

# Validate PG_* before they reach envsubst → SQL. Strict regexes prevent
# both injection (the values flow into raw SQL via `SET … = '${VAR}';`) and
# silent kB-vs-MB confusion (PostgreSQL parses bare integers in memory GUCs
# as kilobytes — `PG_WORK_MEM=128` means 128 kB, not 128 MB).
for var in PG_MAX_PARALLEL_WORKERS PG_MAX_PARALLEL_WORKERS_PER_GATHER PG_MAX_PARALLEL_MAINTENANCE_WORKERS; do
    eval "value=\${$var}"
    case "$value" in
        ''|*[!0-9]*)
            echo "[importer] $var must be a positive integer (got: '$value')" >&2
            exit 1
            ;;
    esac
done
for var in PG_MAINTENANCE_WORK_MEM PG_WORK_MEM; do
    eval "value=\${$var}"
    case "$value" in
        *[0-9]kB|*[0-9]MB|*[0-9]GB|*[0-9]TB) ;;
        *)
            echo "[importer] $var must be a number followed by a unit (kB|MB|GB|TB) (got: '$value')" >&2
            exit 1
            ;;
    esac
done
if [ "$PG_MAX_PARALLEL_WORKERS_PER_GATHER" -gt "$PG_MAX_PARALLEL_WORKERS" ] \
    || [ "$PG_MAX_PARALLEL_MAINTENANCE_WORKERS" -gt "$PG_MAX_PARALLEL_WORKERS" ]; then
    echo "[importer] PG_MAX_PARALLEL_WORKERS_PER_GATHER and PG_MAX_PARALLEL_MAINTENANCE_WORKERS must each be ≤ PG_MAX_PARALLEL_WORKERS ($PG_MAX_PARALLEL_WORKERS); PostgreSQL silently caps the excess otherwise" >&2
    exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

# Helper: clear importing flag. Called from EXIT trap inside run_import and
# after the successful UPSERT. Ignores errors — the table may not exist on
# the very first import (created by schema-apply), or the DB may be
# temporarily unreachable on container shutdown.
_clear_importing() {
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "UPDATE api.import_status SET importing = false WHERE id = 1" \
        2>/dev/null || true
}

# Helper: pick a uniformly random integer in [MIN_DAYS, MAX_DAYS].
_random_days() {
    awk -v min="$REIMPORT_INTERVAL_MIN_DAYS" \
        -v max="$REIMPORT_INTERVAL_MAX_DAYS" \
        'BEGIN { srand(); print min + int(rand() * (max - min + 1)) }'
}

# =========================================================================== #
# run_import — full import pipeline in a subshell.
#
# Running in a subshell ( ) isolates the EXIT trap so TMP_API_SQL and the
# importing flag are always cleaned up on exit (success, failure, or signal)
# without interfering with the parent daemon loop's trap context.
# =========================================================================== #
run_import() (
    set -e

    # --------------------------------------------------------------------------- #
    # Wait for PostGIS to be ready
    # --------------------------------------------------------------------------- #
    echo "[importer] Waiting for PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
    until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q; do
        sleep 2
    done
    echo "[importer] PostgreSQL is ready."

    # --------------------------------------------------------------------------- #
    # Download PBF — re-download only if Geofabrik has a newer version.
    # wget -N sends If-Modified-Since using the local file's mtime; the server
    # returns 304 Not Modified when the extract hasn't changed, skipping the
    # download. When a newer extract is available wget updates the file and its
    # mtime, which automatically invalidates the bbox and tag-filter caches
    # below (they use -nt comparisons against the source PBF).
    # --------------------------------------------------------------------------- #
    if [ -f "$PBF_FILE" ]; then
        if ! osmium fileinfo "$PBF_FILE" > /dev/null 2>&1; then
            echo "[importer] Cached $PBF_FILE is corrupt or incomplete — re-downloading..."
            rm -f "$PBF_FILE"
            wget --progress=dot:giga -O "$PBF_FILE" "$PBF_URL"
        else
            echo "[importer] Checking for updated PBF at $PBF_URL ..."
            wget --progress=dot:giga -N -P /data/ "$PBF_URL"
        fi
    else
        echo "[importer] Downloading $PBF_URL ..."
        wget --progress=dot:giga -O "$PBF_FILE" "$PBF_URL"
    fi
    echo "[importer] PBF ready: $(du -sh "$PBF_FILE" | cut -f1)"

    # --------------------------------------------------------------------------- #
    # Step 1 — Bbox pre-filter: clip PBF to region bounding box
    # --------------------------------------------------------------------------- #
    SKIP_PREFILTER=0
    IMPORT_PBF="$PBF_FILE"

    # Skip for already-small source PBFs (city-level extracts, etc.)
    PBF_SIZE_MB=$(du -m "$PBF_FILE" | cut -f1)
    if [ "$PBF_SIZE_MB" -lt "$OSM_PREFILTER_MIN_MB" ]; then
        echo "[importer] Source PBF is small (${PBF_SIZE_MB} MB < ${OSM_PREFILTER_MIN_MB} MB), skipping bbox pre-filter"
        SKIP_PREFILTER=1
    fi

    if [ "$SKIP_PREFILTER" -eq 0 ]; then
        if [ -n "$OSM_BBOX" ]; then
            echo "[importer] Using OSM_BBOX override: $OSM_BBOX"
            RESOLVED_BBOX="$OSM_BBOX"
        else
            echo "[importer] Querying Nominatim for bbox of relation ${OSM_RELATION_ID}..."
            NOMINATIM_RESPONSE=$(curl -sf --max-time 15 \
                "https://nominatim.openstreetmap.org/lookup?osm_ids=R${OSM_RELATION_ID}&format=json" \
                -H "User-Agent: spielplatzkarte-importer/1.0" || true)

            RAW_BBOX=$(echo "$NOMINATIM_RESPONSE" | jq -r '.[0].boundingbox // empty' 2>/dev/null || true)

            if [ -z "$RAW_BBOX" ]; then
                echo "[importer] WARNING: bbox lookup failed, importing full PBF"
                SKIP_PREFILTER=1
            else
                # Nominatim returns [south, north, west, east]; reorder and pad to west,south,east,north
                SOUTH=$(echo "$RAW_BBOX" | jq -r '.[0]')
                NORTH=$(echo "$RAW_BBOX" | jq -r '.[1]')
                WEST=$(echo "$RAW_BBOX"  | jq -r '.[2]')
                EAST=$(echo "$RAW_BBOX"  | jq -r '.[3]')
                RESOLVED_BBOX=$(awk -v w="$WEST" -v s="$SOUTH" -v e="$EAST" -v n="$NORTH" \
                    -v pad="$OSM_BBOX_PADDING" \
                    'BEGIN { printf "%.6f,%.6f,%.6f,%.6f", w-pad, s-pad, e+pad, n+pad }')
                echo "[importer] Resolved bbox (padded ${OSM_BBOX_PADDING}°): $RESOLVED_BBOX"
            fi
        fi
    fi

    if [ "$SKIP_PREFILTER" -eq 0 ]; then
        BBOX_PBF="/data/${PBF_BASENAME}_${OSM_RELATION_ID}.pbf"

        BBOX_CACHE_OK=0
        if [ -f "$BBOX_PBF" ] && [ "$BBOX_PBF" -nt "$PBF_FILE" ]; then
            BBOX_SIZE=$(wc -c < "$BBOX_PBF")
            if [ "$BBOX_SIZE" -ge 10240 ]; then
                BBOX_CACHE_OK=1
                echo "[importer] Bbox cache hit: $BBOX_PBF is newer than source, skipping osmium extract"
            else
                echo "[importer] WARNING: bbox cache is suspiciously small (${BBOX_SIZE} bytes) — likely corrupt or empty. Invalidating and re-running osmium..."
                rm -f "$BBOX_PBF"
            fi
        fi
        if [ "$BBOX_CACHE_OK" -eq 0 ]; then
            echo "[importer] Running osmium extract (bbox=$RESOLVED_BBOX)..."
            BBOX_TMP=$(mktemp -p /data .bbox.XXXXXX.pbf)
            trap 'rm -f "$BBOX_TMP"' EXIT
            osmium extract \
                --overwrite \
                --bbox="$RESOLVED_BBOX" \
                --strategy=smart \
                -o "$BBOX_TMP" \
                "$PBF_FILE"
            mv "$BBOX_TMP" "$BBOX_PBF"
            trap - EXIT
            echo "[importer] Bbox extract complete: $(du -sh "$BBOX_PBF" | cut -f1)"
        fi

        IMPORT_PBF="$BBOX_PBF"
    fi

    # --------------------------------------------------------------------------- #
    # Step 2 — Tag filter: keep only objects the app actually queries
    # --------------------------------------------------------------------------- #
    TAGS_PBF="/data/${PBF_BASENAME}_${OSM_RELATION_ID}_tags.pbf"

    TAGS_CACHE_OK=0
    if [ -f "$TAGS_PBF" ] && [ "$TAGS_PBF" -nt "$IMPORT_PBF" ]; then
        TAGS_SIZE=$(wc -c < "$TAGS_PBF")
        if [ "$TAGS_SIZE" -ge 10240 ]; then
            TAGS_CACHE_OK=1
            echo "[importer] Tag-filter cache hit: $TAGS_PBF is newer than source, skipping osmium tags-filter"
        else
            echo "[importer] WARNING: tags cache is suspiciously small (${TAGS_SIZE} bytes) — likely corrupt or empty. Invalidating and re-running osmium..."
            rm -f "$TAGS_PBF"
        fi
    fi
    if [ "$TAGS_CACHE_OK" -eq 0 ]; then
        echo "[importer] Running osmium tags-filter..."
        TAGS_TMP=$(mktemp -p /data .tags.XXXXXX.pbf)
        trap 'rm -f "$TAGS_TMP"' EXIT
        osmium tags-filter \
            --overwrite \
            -o "$TAGS_TMP" \
            "$IMPORT_PBF" \
            n/natural=tree \
            w/natural=tree_row \
            n/leisure=playground \
            n/leisure=pitch \
            n/leisure=fitness_station \
            n/leisure=picnic_table \
            n/amenity=bench \
            n/amenity=shelter \
            n/amenity=toilets \
            n/amenity=ice_cream \
            n/amenity=cafe \
            n/amenity=restaurant \
            n/highway=bus_stop \
            n/shop=chemist \
            n/shop=supermarket \
            n/shop=convenience \
            n/emergency \
            n/playground \
            w/leisure=playground \
            w/leisure=pitch \
            w/leisure=fitness_station \
            w/leisure=picnic_table \
            w/amenity=bench \
            w/amenity=shelter \
            w/amenity=toilets \
            w/amenity=ice_cream \
            w/amenity=cafe \
            w/amenity=restaurant \
            w/shop=chemist \
            w/shop=supermarket \
            w/shop=convenience \
            w/playground \
            r/leisure=playground \
            r/leisure=pitch \
            r/type=multipolygon \
            r/boundary=administrative
        mv "$TAGS_TMP" "$TAGS_PBF"
        trap - EXIT
        echo "[importer] Tag-filter complete: $(du -sh "$TAGS_PBF" | cut -f1)"
    fi

    IMPORT_PBF="$TAGS_PBF"

    # --------------------------------------------------------------------------- #
    # Import with osm2pgsql
    # --------------------------------------------------------------------------- #
    # Signal hub that data is being rebuilt. The flag is cleared unconditionally
    # by the EXIT trap so a killed or failed importer never leaves it stuck true.
    # Uses `|| true` because api.import_status may not exist on the first-ever
    # import (the table is created by the schema-apply step below).
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "UPDATE api.import_status SET importing = true WHERE id = 1" \
        2>/dev/null || true
    # In POSIX sh, EXIT trap does not fire on SIGTERM/SIGINT — add explicit
    # signal handlers that call exit so the EXIT trap below runs on container stop.
    trap 'exit' TERM INT
    trap '_clear_importing' EXIT

    echo "[importer] Starting osm2pgsql import on $IMPORT_PBF..."
    osm2pgsql \
        --host     "$POSTGRES_HOST" \
        --port     "$POSTGRES_PORT" \
        --database "$POSTGRES_DB"   \
        --username "$POSTGRES_USER" \
        --slim     \
        --drop     \
        --hstore   \
        --number-processes "$OSM2PGSQL_THREADS" \
        "$IMPORT_PBF"

    echo "[importer] osm2pgsql finished."

    # Sanity check: any legitimate Bundesland import produces at least some
    # playground polygons. Zero means the PBF was empty or corrupt — the import
    # succeeded structurally but the database is now effectively empty.
    _PLAYGROUND_COUNT=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -t -c "SELECT count(*) FROM planet_osm_polygon WHERE leisure = 'playground'" \
        2>/dev/null | tr -d ' \n')
    if [ -z "$_PLAYGROUND_COUNT" ] || [ "$_PLAYGROUND_COUNT" -eq 0 ]; then
        fail "osm2pgsql imported 0 playground polygons — the PBF is likely empty or corrupt. Delete the cached PBF files and re-run: docker run --rm -v <pbf_cache_volume>:/data alpine sh -c 'rm -f /data/*_${OSM_RELATION_ID}*.pbf'"
    fi
    echo "[importer] Verified: ${_PLAYGROUND_COUNT} playground polygons imported."

    # --------------------------------------------------------------------------- #
    # Create PostgREST API schema (views / functions)
    # --------------------------------------------------------------------------- #
    echo "[importer] Applying API schema..."
    # Stage the env-substituted SQL in a tempfile, then run psql against it with
    # `-f` and `ON_ERROR_STOP=1`. POSIX sh has no `pipefail`, so a piped
    # `envsubst | psql` would silently succeed on an envsubst failure — staging
    # via a tempfile lets `set -e` abort us properly when envsubst fails, AND
    # `ON_ERROR_STOP=1` aborts on any SQL error inside api.sql. Together these
    # guarantee the api.import_status UPSERT below only runs on a fully-applied
    # schema (matches scheduled-importer spec "Failed run does not update
    # timestamp").
    TMP_API_SQL=$(mktemp)
    trap 'rm -f "$TMP_API_SQL"; _clear_importing' EXIT
    envsubst '$OSM_RELATION_ID $PG_MAX_PARALLEL_WORKERS $PG_MAX_PARALLEL_WORKERS_PER_GATHER $PG_MAX_PARALLEL_MAINTENANCE_WORKERS $PG_MAINTENANCE_WORK_MEM $PG_WORK_MEM $SPIELI_VERSION $IMPRESSUM_URL $PRIVACY_URL $SITE_URL' < /api.sql > "$TMP_API_SQL"
    psql -v ON_ERROR_STOP=1 \
        -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -f "$TMP_API_SQL"

    # --------------------------------------------------------------------------- #
    # Record successful import timestamp (read by get_meta / federation-status).
    # Two timestamps are persisted:
    #   - last_import_at: when this script ran (operator-facing; "is the cron
    #     healthy?")
    #   - osm_data_timestamp: the `osmosis_replication_timestamp` from the source
    #     PBF header (user-facing; "how old is the data I'm looking at?")
    # These diverge whenever the importer runs more often than Geofabrik
    # refreshes its extracts — `last_import_at` can be "5 min ago" while the
    # OSM data itself is up to a week old.
    # --------------------------------------------------------------------------- #

    # Extract the OSM replication timestamp from the original PBF (before our
    # bbox+tags filtering, which can drop the header on some osmium versions).
    # `osmium fileinfo --json` emits ISO-8601 already — pass straight to psql.
    # Fall back to NULL if the header is missing (some non-Geofabrik PBFs).
    OSM_DATA_TS=$(osmium fileinfo --json "$PBF_FILE" 2>/dev/null \
        | jq -r '.header.option.osmosis_replication_timestamp // empty' 2>/dev/null || true)

    if [ -n "$OSM_DATA_TS" ]; then
        echo "[importer] Source PBF replication timestamp: $OSM_DATA_TS"
        OSM_DATA_TS_SQL="'${OSM_DATA_TS}'::timestamptz"
    else
        echo "[importer] WARNING: source PBF lacks osmosis_replication_timestamp header — osm_data_timestamp will be NULL."
        OSM_DATA_TS_SQL="NULL"
    fi

    psql -v ON_ERROR_STOP=1 \
        -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "INSERT INTO api.import_status (id, last_import_at, osm_data_timestamp, importing)
            VALUES (1, now(), ${OSM_DATA_TS_SQL}, false)
            ON CONFLICT (id) DO UPDATE
            SET last_import_at      = EXCLUDED.last_import_at,
                osm_data_timestamp  = COALESCE(EXCLUDED.osm_data_timestamp, api.import_status.osm_data_timestamp),
                importing           = false;"

    # --------------------------------------------------------------------------- #
    # Write legal content to api.legal_content (data-node: no nginx webroot).
    # Skipped silently when IMPRESSUM_NAME / IMPRESSUM_ADDRESS are not set.
    # --------------------------------------------------------------------------- #
    if [ -n "${IMPRESSUM_NAME:-}" ] && [ -n "${IMPRESSUM_ADDRESS:-}" ]; then
        _html_escape() { printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g'; }
        _IMP_NAME=$(    _html_escape "${IMPRESSUM_NAME}")
        _IMP_ORG=$(     _html_escape "${IMPRESSUM_ORG:-}")
        _IMP_ADDRESS=$( _html_escape "${IMPRESSUM_ADDRESS}")
        _IMP_EMAIL=$(   _html_escape "${IMPRESSUM_EMAIL:-}")
        _IMP_PHONE=$(   _html_escape "${IMPRESSUM_PHONE:-}")

        IMPRESSUM_HTML=$(
            printf '<!DOCTYPE html>\n<html lang="de">\n<head>\n'
            printf '  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'
            printf '  <title>Impressum</title>\n'
            printf '  <style>body{font-family:sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#222}h1{font-size:1.6rem}a{color:#1a6b3a}</style>\n'
            printf '</head>\n<body>\n  <h1>Impressum</h1>\n'
            printf '  <p>%s</p>\n' "$_IMP_NAME"
            [ -n "$_IMP_ORG" ]     && printf '  <p>%s</p>\n' "$_IMP_ORG"
            printf '  <p>%s</p>\n' "$_IMP_ADDRESS"
            [ -n "$_IMP_EMAIL" ]   && printf '  <p>E-Mail: <a href="mailto:%s">%s</a></p>\n' "$_IMP_EMAIL" "$_IMP_EMAIL"
            [ -n "$_IMP_PHONE" ]   && printf '  <p>Tel: %s</p>\n' "$_IMP_PHONE"
            printf '</body>\n</html>\n'
        )
        _EMAIL_PART=""
        [ -n "$_IMP_EMAIL" ] && _EMAIL_PART="<br>E-Mail: <a href=\"mailto:${_IMP_EMAIL}\">${_IMP_EMAIL}</a>"
        DATENSCHUTZ_HTML=$(printf '%s' "<!DOCTYPE html>
<html lang=\"de\"><head><meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>Datenschutzerklärung</title>
<style>body{font-family:sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#222}h1{font-size:1.6rem}h2{font-size:1.2rem;margin-top:2rem}a{color:#1a6b3a}</style>
</head><body>
<h1>Datenschutzerklärung</h1>
<h2>Verantwortliche Person</h2>
<p>${_IMP_NAME}${_EMAIL_PART}</p>
<h2>Grundsatz</h2>
<p>Diese Anwendung erhebt keine Nutzerkonten, setzt keine Tracking-Cookies und führt keine Analyse des Nutzerverhaltens durch.</p>
<h2>Kartendaten</h2>
<p>Die Anwendung verwendet Geodaten aus <a href=\"https://www.openstreetmap.org/\">OpenStreetMap</a> (ODbL). Die Daten sind öffentlich zugänglich.</p>
<h2>Standortsuche (Nominatim)</h2>
<p>Für die Ortssuche wird die Nominatim-API abgefragt. Dabei wird der Suchbegriff übertragen.</p>
<h2>Fotos (Panoramax)</h2>
<p>Sofern Fotos verfügbar sind, werden diese von Panoramax geladen. Es gelten deren Datenschutzbestimmungen.</p>
<h2>Standortbestimmung</h2>
<p>Die Standortfunktion wird nur auf ausdrücklichen Wunsch aktiviert und nicht gespeichert.</p>
<h2>Serverprotokolle</h2>
<p>Der Betreiber ist für die Protokollierung durch die Hosting-Infrastruktur verantwortlich.</p>
<h2>Kontakt</h2>
<p>${_IMP_NAME}${_EMAIL_PART}</p>
</body></html>")

        # Escape single quotes for embedding in SQL literal (replace ' with '')
        IMP_SQL=$(printf '%s' "$IMPRESSUM_HTML"   | sed "s/'/''/g")
        DS_SQL=$(printf  '%s' "$DATENSCHUTZ_HTML" | sed "s/'/''/g")

        psql -v ON_ERROR_STOP=1 \
            -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
            -c "INSERT INTO api.legal_content (type, content, updated_at) VALUES
                  ('impressum',   '$IMP_SQL', now()),
                  ('datenschutz', '$DS_SQL',  now())
                ON CONFLICT (type) DO UPDATE
                  SET content = EXCLUDED.content, updated_at = now();"
        echo "[importer] Legal content written to api.legal_content."
    fi

    # --------------------------------------------------------------------------- #
    # Notify PostgREST to reload its schema cache
    # --------------------------------------------------------------------------- #
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "NOTIFY pgrst, 'reload schema';"

    echo "[importer] Done. PostgREST schema reloaded."
)

# =========================================================================== #
# run_api_apply — apply api.sql only, skip PBF/osm2pgsql (API_ONLY=true).
# =========================================================================== #
run_api_apply() (
    set -e

    echo "[importer] API_ONLY mode — skipping PBF download and osm2pgsql import."

    echo "[importer] Waiting for PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
    until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q; do
        sleep 2
    done
    echo "[importer] PostgreSQL is ready."

    echo "[importer] Applying API schema..."
    TMP_API_SQL=$(mktemp)
    trap 'rm -f "$TMP_API_SQL"' EXIT
    envsubst '$OSM_RELATION_ID $PG_MAX_PARALLEL_WORKERS $PG_MAX_PARALLEL_WORKERS_PER_GATHER $PG_MAX_PARALLEL_MAINTENANCE_WORKERS $PG_MAINTENANCE_WORK_MEM $PG_WORK_MEM $SPIELI_VERSION $IMPRESSUM_URL $PRIVACY_URL $SITE_URL' < /api.sql > "$TMP_API_SQL"
    psql -v ON_ERROR_STOP=1 \
        -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -f "$TMP_API_SQL"

    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "NOTIFY pgrst, 'reload schema';"

    echo "[importer] Done. PostgREST schema reloaded."
)

# =========================================================================== #
# Execution — one-shot or daemon mode
# =========================================================================== #

if [ -n "$API_ONLY" ]; then
    # ── API-only mode ────────────────────────────────────────────────────── #
    run_api_apply
elif [ -n "$REIMPORT_INTERVAL_MIN_DAYS" ] && [ -n "$REIMPORT_INTERVAL_MAX_DAYS" ]; then
    # ── Daemon mode ─────────────────────────────────────────────────────────── #
    echo "[importer] Daemon mode: interval ${REIMPORT_INTERVAL_MIN_DAYS}–${REIMPORT_INTERVAL_MAX_DAYS} days."

    # Clear any stuck importing flag left by a previously SIGKILL'd container.
    # POSIX sh EXIT traps don't fire on SIGKILL, so this startup reset is the
    # reliable fallback. Ignored if the DB isn't up yet (|| true).
    _clear_importing

    # Always apply api.sql on startup so schema changes from a new image take
    # effect immediately — even when the PBF reimport is deferred by the grace
    # check below. Without this, a Watchtower image update would leave the app
    # running against the old schema for up to REIMPORT_INTERVAL days.
    run_api_apply

    # Startup grace check: if a recent import is on record in the DB, sleep
    # until the next scheduled time rather than importing immediately. This
    # prevents an unplanned full re-import every time the container is
    # restarted (e.g. after a Watchtower image update).
    # Falls through immediately when:
    #   - api.import_status doesn't exist yet (fresh DB — first-ever import)
    #   - the DB is unreachable (psql fails — run_import will wait for it)
    #   - last_import_at is overdue (import is past due)
    LAST_TS=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A \
        -c "SELECT EXTRACT(EPOCH FROM last_import_at)::bigint \
            FROM api.import_status WHERE id = 1" \
        2>/dev/null || true)

    if [ -n "$LAST_TS" ]; then
        GRACE_DAYS=$(_random_days)
        NOW=$(date +%s)
        NEXT_RUN=$((LAST_TS + GRACE_DAYS * 86400))
        if [ "$NOW" -lt "$NEXT_RUN" ]; then
            SLEEP_SECS=$((NEXT_RUN - NOW))
            echo "[importer] Last import < ${GRACE_DAYS}d ago. Sleeping ${SLEEP_SECS}s until next scheduled run."
            sleep "$SLEEP_SECS"
        fi
    else
        # Fresh DB (no prior import_status record). On multi-backend deployments
        # all containers start simultaneously, causing a thundering herd of
        # concurrent osm2pgsql processes that exhausts host memory.
        # REIMPORT_STARTUP_JITTER_MAX_HOURS spreads first imports over time.
        if [ "$REIMPORT_STARTUP_JITTER_MAX_HOURS" -gt 0 ] 2>/dev/null; then
            JITTER_SECS=$(awk -v max="$REIMPORT_STARTUP_JITTER_MAX_HOURS" \
                'BEGIN { srand(); print int(rand() * max * 3600) }')
            echo "[importer] Fresh install — startup jitter: sleeping ${JITTER_SECS}s (max ${REIMPORT_STARTUP_JITTER_MAX_HOURS}h) to avoid thundering herd."
            sleep "$JITTER_SECS"
        fi
    fi

    # First run (and all subsequent runs in the loop)
    while true; do
        if run_import; then
            echo "[importer] Import completed successfully."
        else
            echo "[importer] Import failed. Retrying in 1 hour." >&2
            sleep 3600
            continue
        fi
        DAYS=$(_random_days)
        echo "[importer] Sleeping ${DAYS} days until next import."
        sleep $((DAYS * 86400))
    done
else
    # ── One-shot mode (default, backward-compatible) ─────────────────────── #
    # Clear any stuck importing flag from a previously crashed container.
    _clear_importing
    run_import
fi
