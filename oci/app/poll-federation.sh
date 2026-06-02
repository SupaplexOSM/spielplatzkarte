#!/bin/sh
# Hub federation health poll — runs every 60 s via crond.
# Reads /usr/share/nginx/html/registry.json, fetches get_meta from each
# backend, writes /usr/share/nginx/html/federation-status.json and
# /usr/share/nginx/html/metrics atomically (tmp on the SAME filesystem
# as the webroot → rename within fs).
set -e

# Locale-independent decimals (curl's %{time_total} honours LC_NUMERIC;
# a non-C locale produces "0,043" which breaks both JSON and Prometheus
# parsers).
LC_ALL=C
export LC_ALL

WEBROOT="/usr/share/nginx/html"
REGISTRY="$WEBROOT/registry.json"
STATUS_OUT="$WEBROOT/federation-status.json"
METRICS_OUT="$WEBROOT/metrics"
LOCKFILE="/var/run/poll-federation.lock"
POLL_INTERVAL=60

# Single-instance guard. flock prevents concurrent runs from racing on
# the mv calls when one cron tick takes longer than the next interval
# (e.g. a hung backend). `-n` returns immediately if held; we exit
# silently because the previous tick is still in progress.
if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCKFILE"
    flock -n 9 || exit 0
fi

# tmp dir on the SAME filesystem as the webroot so `mv` is a true atomic
# rename rather than a cross-fs copy+unlink (which readers can observe
# mid-stream as a partial file).
TMP=$(mktemp -d -p "$WEBROOT" .poll.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

# Previous status for preserving last_success on transient failures.
PREV_STATUS=""
[ -f "$STATUS_OUT" ] && PREV_STATUS=$(cat "$STATUS_OUT")

# No registry → write an empty-but-valid status and exit
if [ ! -f "$REGISTRY" ]; then
    GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    printf '{"generated_at":"%s","poll_interval_seconds":%d,"backends":{}}\n' \
        "$GENERATED_AT" "$POLL_INTERVAL" > "$TMP/status.json"
    printf '# HELP spielplatz_poll_generated_timestamp Unix timestamp when this scrape was generated.\n' > "$TMP/metrics"
    printf '# TYPE spielplatz_poll_generated_timestamp gauge\n' >> "$TMP/metrics"
    printf 'spielplatz_poll_generated_timestamp %s\n' "$(date -u +%s)" >> "$TMP/metrics"
    mv "$TMP/status.json" "$STATUS_OUT"
    mv "$TMP/metrics"     "$METRICS_OUT"
    exit 0
fi

GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GENERATED_TS=$(date -u +%s)

# Build JSON and Prometheus output per backend
BACKENDS_JSON=""
METRICS_LINES=""

# jq outputs: slug<TAB>url per line. Registry can be either
# `{ "instances": [...] }` (canonical, matches `app/src/hub/registry.js:131`)
# or a bare top-level array; `(.instances // .)[]` handles both.
jq -r '(.instances // .)[] | (.slug // (.url | gsub("[^a-z0-9]"; "_"))) + "\t" + .url' \
    "$REGISTRY" > "$TMP/backends.tsv" 2>/dev/null || true

while IFS="	" read -r SLUG URL; do
    [ -z "$URL" ] && continue

    META_TMP="$TMP/meta_${SLUG}.json"
    LATENCY="0"
    UP=0

    # curl: silent, fail on HTTP error, capture timing, 3 s timeout.
    # Relative URLs in registry.json (e.g. "/api") are resolved against the
    # hub's own origin via http://localhost — needed for the dev/local
    # stack where the hub proxies /api to a co-located data-node.
    CURL_URL="$URL"
    case "$URL" in
        /*) CURL_URL="http://localhost${URL}" ;;
    esac
    if curl -sf --max-time 3 \
            -w '%{time_total}' \
            -o "$META_TMP" \
            "${CURL_URL}/rpc/get_meta" > "$TMP/curl_time_${SLUG}.txt" 2>/dev/null; then
        LATENCY=$(cat "$TMP/curl_time_${SLUG}.txt")
        UP=1
    fi

    LAST_IMPORT_AT_JSON="null"
    DATA_AGE_SECONDS="null"
    OSM_DATA_TIMESTAMP_JSON="null"
    OSM_DATA_AGE_SECONDS="null"
    IMPORTING="false"
    IMPRESSUM_URL_VAL="null"
    PRIVACY_URL_VAL="null"
    HAS_LEGAL_VAL="false"
    VERSION_VAL="null"
    PLAYGROUND_COUNT_VAL="null"
    COMPLETE_VAL="null"
    PARTIAL_VAL="null"
    MISSING_VAL="null"
    if [ "$UP" = "1" ] && [ -f "$META_TMP" ]; then
        RAW=$(cat "$META_TMP")
        # api.get_meta returns a JSON object directly (PostgREST scalar-RPC),
        # not a single-element array. Read fields without `.[0]` indexing.
        # ISO-string fields MUST be re-quoted on the way into our
        # concatenated JSON; bare ISO strings interpolate as invalid JSON
        # (`"last_import_at":2026-04-25T03:00:00Z` — unquoted).
        LAST_IMPORT_AT=$(printf '%s' "$RAW" | jq -r '.last_import_at // empty' 2>/dev/null)
        DATA_AGE_SECONDS_RAW=$(printf '%s' "$RAW" | jq -r '.data_age_seconds // empty' 2>/dev/null)
        OSM_DATA_TS=$(printf '%s' "$RAW" | jq -r '.osm_data_timestamp // empty' 2>/dev/null)
        OSM_DATA_AGE_RAW=$(printf '%s' "$RAW" | jq -r '.osm_data_age_seconds // empty' 2>/dev/null)
        # `// false` defaults absent/null field to false (pre-importing-flag backends).
        IMPORTING=$(printf '%s' "$RAW" | jq '.importing // false' 2>/dev/null || echo false)
        # `// null` defaults absent legal URL fields to null (older backends).
        IMPRESSUM_URL_VAL=$(printf '%s' "$RAW" | jq '.impressum_url // null' 2>/dev/null || echo null)
        PRIVACY_URL_VAL=$(printf '%s' "$RAW" | jq '.privacy_url // null' 2>/dev/null || echo null)
        HAS_LEGAL_VAL=$(printf '%s' "$RAW" | jq '.has_legal // false' 2>/dev/null || echo false)
        VERSION_VAL=$(printf '%s' "$RAW" | jq '.version // null' 2>/dev/null || echo null)
        if [ -n "$LAST_IMPORT_AT" ]; then
            LAST_IMPORT_AT_JSON=$(printf '%s' "$LAST_IMPORT_AT" | jq -Rs .)
        fi
        if [ -n "$DATA_AGE_SECONDS_RAW" ]; then
            DATA_AGE_SECONDS="$DATA_AGE_SECONDS_RAW"
        fi
        if [ -n "$OSM_DATA_TS" ]; then
            OSM_DATA_TIMESTAMP_JSON=$(printf '%s' "$OSM_DATA_TS" | jq -Rs .)
        fi
        if [ -n "$OSM_DATA_AGE_RAW" ]; then
            OSM_DATA_AGE_SECONDS="$OSM_DATA_AGE_RAW"
        fi
        # Completeness counts — absent on pre-P1 backends; emit null in that case
        # so consumers can distinguish "unknown" from "zero".
        PLAYGROUND_COUNT_RAW=$(printf '%s' "$RAW" | jq -r '.playground_count // empty' 2>/dev/null)
        COMPLETE_RAW=$(printf '%s' "$RAW" | jq -r '.complete // empty' 2>/dev/null)
        PARTIAL_RAW=$(printf '%s' "$RAW" | jq -r '.partial // empty' 2>/dev/null)
        MISSING_RAW=$(printf '%s' "$RAW" | jq -r '.missing // empty' 2>/dev/null)
        [ -n "$PLAYGROUND_COUNT_RAW" ] && PLAYGROUND_COUNT_VAL="$PLAYGROUND_COUNT_RAW"
        [ -n "$COMPLETE_RAW" ]         && COMPLETE_VAL="$COMPLETE_RAW"
        [ -n "$PARTIAL_RAW" ]          && PARTIAL_VAL="$PARTIAL_RAW"
        [ -n "$MISSING_RAW" ]          && MISSING_VAL="$MISSING_RAW"
    fi

    # Preserve last_success from previous run if backend is currently down.
    LAST_SUCCESS_JSON="null"
    if [ -n "$PREV_STATUS" ]; then
        PREV_LAST=$(printf '%s' "$PREV_STATUS" \
            | jq -r --arg slug "$SLUG" '.backends[$slug].last_success // empty' 2>/dev/null)
        [ -n "$PREV_LAST" ] && LAST_SUCCESS_JSON=$(printf '%s' "$PREV_LAST" | jq -Rs .)
    fi
    [ "$UP" = "1" ] && LAST_SUCCESS_JSON=$(printf '%s' "$GENERATED_AT" | jq -Rs .)

    # JSON-escape SLUG and URL (operator-controlled but cheap defence; a `"`
    # anywhere in either string would otherwise produce malformed output).
    SLUG_JSON=$(printf '%s' "$SLUG" | jq -Rs .)
    URL_JSON=$(printf '%s' "$URL"  | jq -Rs .)

    # Append to backends JSON object
    if [ -n "$BACKENDS_JSON" ]; then BACKENDS_JSON="${BACKENDS_JSON},"; fi
    BACKENDS_JSON="${BACKENDS_JSON}${SLUG_JSON}:{"
    BACKENDS_JSON="${BACKENDS_JSON}\"url\":${URL_JSON},"
    BACKENDS_JSON="${BACKENDS_JSON}\"up\":$([ "$UP" = "1" ] && echo true || echo false),"
    BACKENDS_JSON="${BACKENDS_JSON}\"latency_seconds\":${LATENCY},"
    BACKENDS_JSON="${BACKENDS_JSON}\"last_success\":${LAST_SUCCESS_JSON},"
    BACKENDS_JSON="${BACKENDS_JSON}\"last_import_at\":${LAST_IMPORT_AT_JSON},"
    BACKENDS_JSON="${BACKENDS_JSON}\"data_age_seconds\":${DATA_AGE_SECONDS},"
    BACKENDS_JSON="${BACKENDS_JSON}\"osm_data_timestamp\":${OSM_DATA_TIMESTAMP_JSON},"
    BACKENDS_JSON="${BACKENDS_JSON}\"osm_data_age_seconds\":${OSM_DATA_AGE_SECONDS},"
    BACKENDS_JSON="${BACKENDS_JSON}\"importing\":${IMPORTING},"
    BACKENDS_JSON="${BACKENDS_JSON}\"impressum_url\":${IMPRESSUM_URL_VAL},"
    BACKENDS_JSON="${BACKENDS_JSON}\"privacy_url\":${PRIVACY_URL_VAL},"
    BACKENDS_JSON="${BACKENDS_JSON}\"has_legal\":${HAS_LEGAL_VAL},"
    BACKENDS_JSON="${BACKENDS_JSON}\"version\":${VERSION_VAL},"
    BACKENDS_JSON="${BACKENDS_JSON}\"playground_count\":${PLAYGROUND_COUNT_VAL},"
    BACKENDS_JSON="${BACKENDS_JSON}\"complete\":${COMPLETE_VAL},"
    BACKENDS_JSON="${BACKENDS_JSON}\"partial\":${PARTIAL_VAL},"
    BACKENDS_JSON="${BACKENDS_JSON}\"missing\":${MISSING_VAL}"
    BACKENDS_JSON="${BACKENDS_JSON}}"

    # Append Prometheus metrics. Prometheus disallows `"` and `\` inside
    # label values; treat URL and SLUG as already-canonical (registry
    # operator's responsibility) and skip strings containing them.
    case "$SLUG$URL" in
        *\"*|*\\*) ;;  # skip — would break exposition format
        *)
            LABEL="backend=\"${SLUG}\",url=\"${URL}\""
            IMPORTING_INT=$([ "$IMPORTING" = "true" ] && echo 1 || echo 0)
            METRICS_LINES="${METRICS_LINES}spielplatz_backend_up{${LABEL}} ${UP}\n"
            METRICS_LINES="${METRICS_LINES}spielplatz_backend_importing{${LABEL}} ${IMPORTING_INT}\n"
            METRICS_LINES="${METRICS_LINES}spielplatz_backend_latency_seconds{${LABEL}} ${LATENCY}\n"
            if [ "$DATA_AGE_SECONDS" != "null" ] && [ -n "$DATA_AGE_SECONDS" ]; then
                METRICS_LINES="${METRICS_LINES}spielplatz_backend_data_age_seconds{${LABEL}} ${DATA_AGE_SECONDS}\n"
            fi
            if [ "$OSM_DATA_AGE_SECONDS" != "null" ] && [ -n "$OSM_DATA_AGE_SECONDS" ]; then
                METRICS_LINES="${METRICS_LINES}spielplatz_backend_osm_data_age_seconds{${LABEL}} ${OSM_DATA_AGE_SECONDS}\n"
            fi
            if [ "$PLAYGROUND_COUNT_VAL" != "null" ] && [ -n "$PLAYGROUND_COUNT_VAL" ]; then
                METRICS_LINES="${METRICS_LINES}spielplatz_backend_playgrounds_total{${LABEL}} ${PLAYGROUND_COUNT_VAL}\n"
            fi
            if [ "$COMPLETE_VAL" != "null" ] && [ -n "$COMPLETE_VAL" ]; then
                METRICS_LINES="${METRICS_LINES}spielplatz_backend_playgrounds_complete{${LABEL}} ${COMPLETE_VAL}\n"
            fi
            if [ "$PARTIAL_VAL" != "null" ] && [ -n "$PARTIAL_VAL" ]; then
                METRICS_LINES="${METRICS_LINES}spielplatz_backend_playgrounds_partial{${LABEL}} ${PARTIAL_VAL}\n"
            fi
            if [ "$MISSING_VAL" != "null" ] && [ -n "$MISSING_VAL" ]; then
                METRICS_LINES="${METRICS_LINES}spielplatz_backend_playgrounds_missing{${LABEL}} ${MISSING_VAL}\n"
            fi
            ;;
    esac
done < "$TMP/backends.tsv"

# Write status.json
printf '{"generated_at":"%s","poll_interval_seconds":%d,"backends":{%s}}\n' \
    "$GENERATED_AT" "$POLL_INTERVAL" "$BACKENDS_JSON" > "$TMP/status.json"

# Write Prometheus metrics
{
    printf '# HELP spielplatz_backend_up 1 if the backend responded to get_meta, 0 otherwise.\n'
    printf '# TYPE spielplatz_backend_up gauge\n'
    printf '# HELP spielplatz_backend_importing 1 while osm2pgsql is actively running on this backend, 0 otherwise.\n'
    printf '# TYPE spielplatz_backend_importing gauge\n'
    printf '# HELP spielplatz_backend_latency_seconds Round-trip time for the last get_meta call.\n'
    printf '# TYPE spielplatz_backend_latency_seconds gauge\n'
    printf '# HELP spielplatz_backend_data_age_seconds Seconds since the backend last imported data.\n'
    printf '# TYPE spielplatz_backend_data_age_seconds gauge\n'
    printf '# HELP spielplatz_backend_osm_data_age_seconds Seconds since the OSM source data the backend serves was snapshotted (PBF replication timestamp).\n'
    printf '# TYPE spielplatz_backend_osm_data_age_seconds gauge\n'
    printf '# HELP spielplatz_backend_playgrounds_total Total number of playgrounds in the region.\n'
    printf '# TYPE spielplatz_backend_playgrounds_total gauge\n'
    printf '# HELP spielplatz_backend_playgrounds_complete Playgrounds with complete equipment data.\n'
    printf '# TYPE spielplatz_backend_playgrounds_complete gauge\n'
    printf '# HELP spielplatz_backend_playgrounds_partial Playgrounds with partial equipment data.\n'
    printf '# TYPE spielplatz_backend_playgrounds_partial gauge\n'
    printf '# HELP spielplatz_backend_playgrounds_missing Playgrounds with no equipment data.\n'
    printf '# TYPE spielplatz_backend_playgrounds_missing gauge\n'
    printf '# HELP spielplatz_poll_generated_timestamp Unix timestamp when this scrape was generated.\n'
    printf '# TYPE spielplatz_poll_generated_timestamp gauge\n'
    printf '%b' "$METRICS_LINES"
    printf 'spielplatz_poll_generated_timestamp %s\n' "$GENERATED_TS"
} > "$TMP/metrics"

# Atomic rename within the same filesystem (mktemp -d -p "$WEBROOT" above).
mv "$TMP/status.json" "$STATUS_OUT"
mv "$TMP/metrics"     "$METRICS_OUT"
