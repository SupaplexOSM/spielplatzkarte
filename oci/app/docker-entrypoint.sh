#!/bin/sh
set -e

# App entrypoint — generates /usr/share/nginx/html/config.js from env vars,
# then starts nginx. Supports APP_MODE=standalone (default) and APP_MODE=hub.

APP_MODE="${APP_MODE:-standalone}"
WEBROOT="/usr/share/nginx/html"

# Sanitize string values interpolated into JS string literals.
# Strip anything that isn't safe for the expected value type to prevent
# single-quote breakout / code injection.
SAFE_API_BASE_URL=$(printf '%s'    "${API_BASE_URL:-}"    | tr -cd 'A-Za-z0-9:/.+_%~-')
SAFE_PARENT_ORIGIN=$(printf '%s'   "${PARENT_ORIGIN:-}"   | tr -cd 'A-Za-z0-9:/.+-')
SAFE_REGISTRY_URL=$(printf '%s'    "${REGISTRY_URL:-}"    | tr -cd 'A-Za-z0-9:/.+_%~-')
SAFE_WIKI_URL=$(printf '%s'        "${REGION_PLAYGROUND_WIKI_URL:-}" | tr -cd 'A-Za-z0-9:/.+_%~-')
SAFE_CHAT_URL=$(printf '%s'        "${REGION_CHAT_URL:-}" | tr -cd 'A-Za-z0-9:/.+_%~-')

# Legal URLs — IMPRESSUM_URL / PRIVACY_URL override env vars take priority.
# If unset, construct from SITE_URL + path (assuming nginx serves the
# generated files at /impressum and /datenschutz).
SAFE_SITE_URL=$(printf '%s' "${SITE_URL:-}" | tr -cd 'A-Za-z0-9:/.+_%~-')
if [ -n "${IMPRESSUM_URL:-}" ]; then
    SAFE_IMPRESSUM_URL=$(printf '%s' "${IMPRESSUM_URL}" | tr -cd 'A-Za-z0-9:/.+_%~-')
elif [ -n "$SAFE_SITE_URL" ]; then
    SAFE_IMPRESSUM_URL="${SAFE_SITE_URL}/impressum"
else
    SAFE_IMPRESSUM_URL="/impressum"
fi
if [ -n "${PRIVACY_URL:-}" ]; then
    SAFE_PRIVACY_URL=$(printf '%s' "${PRIVACY_URL}" | tr -cd 'A-Za-z0-9:/.+_%~-')
elif [ -n "$SAFE_SITE_URL" ]; then
    SAFE_PRIVACY_URL="${SAFE_SITE_URL}/datenschutz"
else
    SAFE_PRIVACY_URL="/datenschutz"
fi

# js_or_null <value> — emits a JS string literal or null.
js_or_null() { [ -n "$1" ] && printf "'%s'" "$1" || printf 'null'; }

if [ "$APP_MODE" = "hub" ]; then
    cat > "$WEBROOT/config.js" << JSEOF
window.APP_CONFIG = {
  appMode:           'hub',
  registryUrl:       '${SAFE_REGISTRY_URL}',
  hubPollInterval:   ${HUB_POLL_INTERVAL:-300},
  mapZoom:           ${MAP_ZOOM:-6},
  mapMinZoom:        ${MAP_MIN_ZOOM:-4},
  clusterMaxZoom:    ${CLUSTER_MAX_ZOOM:-13},
  macroMaxZoom:      ${MACRO_MAX_ZOOM:-7},
  parentOrigin:      '${SAFE_PARENT_ORIGIN}',
  impressumUrl:      $(js_or_null "$SAFE_IMPRESSUM_URL"),
  privacyUrl:        $(js_or_null "$SAFE_PRIVACY_URL")
};
JSEOF
else
    cat > "$WEBROOT/config.js" << JSEOF
window.APP_CONFIG = {
  appMode:                    'standalone',
  osmRelationId:              ${OSM_RELATION_ID:-62700},
  regionPlaygroundWikiUrl:    '${SAFE_WIKI_URL:-https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground}',
  regionChatUrl:              '${SAFE_CHAT_URL}' || null,
  mapZoom:                    ${MAP_ZOOM:-12},
  mapMinZoom:                 ${MAP_MIN_ZOOM:-7},
  poiRadiusM:                 ${POI_RADIUS_M:-5000},
  apiBaseUrl:                 '${SAFE_API_BASE_URL}',
  clusterMaxZoom:             ${CLUSTER_MAX_ZOOM:-13},
  parentOrigin:               '${SAFE_PARENT_ORIGIN}',
  impressumUrl:               $(js_or_null "$SAFE_IMPRESSUM_URL"),
  privacyUrl:                 $(js_or_null "$SAFE_PRIVACY_URL")
};
JSEOF
fi

# ── Generate legal pages ───────────────────────────────────────────────────────
# Sanitize legal contact vars for HTML interpolation (escape < > & ").
html_escape() { printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g'; }

SAFE_IMP_NAME=$(html_escape "${IMPRESSUM_NAME:-}")
SAFE_IMP_ORG=$(html_escape "${IMPRESSUM_ORG:-}")
SAFE_IMP_ADDRESS=$(html_escape "${IMPRESSUM_ADDRESS:-}")
SAFE_IMP_EMAIL=$(html_escape "${IMPRESSUM_EMAIL:-}")
SAFE_IMP_PHONE=$(html_escape "${IMPRESSUM_PHONE:-}")

if [ -z "${IMPRESSUM_URL:-}" ]; then
    if [ -n "$SAFE_IMP_NAME" ] && [ -n "$SAFE_IMP_ADDRESS" ]; then
        {
            printf '<!DOCTYPE html>\n<html lang="de">\n<head>\n'
            printf '  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
            printf '  <title>Impressum</title>\n'
            printf '  <style>body{font-family:sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#222}h1{font-size:1.6rem}a{color:#1a6b3a}</style>\n'
            printf '</head>\n<body>\n  <h1>Impressum</h1>\n'
            printf '  <p>%s</p>\n' "$SAFE_IMP_NAME"
            [ -n "$SAFE_IMP_ORG" ]     && printf '  <p>%s</p>\n' "$SAFE_IMP_ORG"
            printf '  <p>%s</p>\n' "$SAFE_IMP_ADDRESS"
            [ -n "$SAFE_IMP_EMAIL" ]   && printf '  <p>E-Mail: <a href="mailto:%s">%s</a></p>\n' "$SAFE_IMP_EMAIL" "$SAFE_IMP_EMAIL"
            [ -n "$SAFE_IMP_PHONE" ]   && printf '  <p>Tel: %s</p>\n' "$SAFE_IMP_PHONE"
            printf '</body>\n</html>\n'
        } > "$WEBROOT/impressum.html"
    else
        {
            printf '<!DOCTYPE html>\n<html lang="de">\n<head>\n'
            printf '  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
            printf '  <title>Impressum</title>\n'
            printf '  <style>body{font-family:sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#222}h1{font-size:1.6rem}</style>\n'
            printf '</head>\n<body>\n  <h1>Impressum</h1>\n'
            printf '  <p>Kontaktdaten des Betreibers wurden noch nicht konfiguriert.</p>\n'
            printf '</body>\n</html>\n'
        } > "$WEBROOT/impressum.html"
    fi
fi

if [ -z "${PRIVACY_URL:-}" ]; then
    if [ -n "$SAFE_IMP_NAME" ] && [ -n "$SAFE_IMP_EMAIL" ] && [ -f /datenschutz.template.html ]; then
        # Build hub privacy section into a temp file; awk inlines it at
        # {{HUB_PRIVACY_SECTION}} — avoids sed multiline / & escaping issues.
        HUB_SECTION_FILE=$(mktemp)
        if [ "$APP_MODE" = "hub" ]; then
            cat > "$HUB_SECTION_FILE" <<'HUB_HTML'
  <h2>Hub-Modus: Mehrere Instanzen</h2>
  <p>Diese Instanz betreibt einen Hub, der Daten von mehreren unabhängigen Backends lädt. Die jeweiligen Betreiber der eingebundenen Instanzen sowie die Dienste <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap</a> und <a href="https://panoramax.xyz/" target="_blank" rel="noopener">Panoramax</a> können dabei Zugriffsdaten protokollieren. Die Datenschutzerklärungen der jeweiligen Betreiber sind maßgeblich.</p>

HUB_HTML
        fi
        # Escape & and / so they are literal in the sed replacement position.
        SAFE_IMP_NAME_FOR_SED=$(printf '%s'  "$SAFE_IMP_NAME"  | sed 's/[\/&]/\\&/g')
        SAFE_IMP_EMAIL_FOR_SED=$(printf '%s' "$SAFE_IMP_EMAIL" | sed 's/[\/&]/\\&/g')
        sed \
            -e "s/{{IMPRESSUM_NAME}}/$SAFE_IMP_NAME_FOR_SED/g" \
            -e "s/{{IMPRESSUM_EMAIL}}/$SAFE_IMP_EMAIL_FOR_SED/g" \
            /datenschutz.template.html | \
        awk -v hubfile="$HUB_SECTION_FILE" '
            /\{\{HUB_PRIVACY_SECTION\}\}/ {
                while ((getline line < hubfile) > 0) print line
                close(hubfile)
                next
            }
            { print }
        ' > "$WEBROOT/datenschutz.html"
        rm -f "$HUB_SECTION_FILE"
    else
        {
            printf '<!DOCTYPE html>\n<html lang="de">\n<head>\n'
            printf '  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
            printf '  <title>Datenschutzerkl\303\244rung</title>\n'
            printf '  <style>body{font-family:sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#222}h1{font-size:1.6rem}</style>\n'
            printf '</head>\n<body>\n'
            printf '  <h1>Datenschutzerkl\303\244rung</h1>\n'
            printf '  <p>Die Datenschutzerkl\303\244rung des Betreibers wurde noch nicht konfiguriert.</p>\n'
            printf '</body>\n</html>\n'
        } > "$WEBROOT/datenschutz.html"
    fi
fi

# Write placeholder federation-status.json and metrics so nginx can serve
# the endpoints immediately before the first cron tick (60 s).
#
# The placeholder /metrics MUST emit a valid `spielplatz_poll_generated_timestamp`
# gauge — operators alerting on `time() - spielplatz_poll_generated_timestamp > N`
# need a real value during the boot window, otherwise a crashed cron during
# startup cannot be distinguished from a healthy hub before its first tick.
INIT_TS_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
INIT_TS_UNIX=$(date -u +%s)
if [ ! -f "$WEBROOT/federation-status.json" ]; then
    printf '{"generated_at":"%s","poll_interval_seconds":60,"backends":{}}\n' \
        "$INIT_TS_ISO" > "$WEBROOT/federation-status.json"
fi
if [ ! -f "$WEBROOT/metrics" ]; then
    {
        printf '# HELP spielplatz_poll_generated_timestamp Unix timestamp when this scrape was generated.\n'
        printf '# TYPE spielplatz_poll_generated_timestamp gauge\n'
        printf 'spielplatz_poll_generated_timestamp %s\n' "$INIT_TS_UNIX"
    } > "$WEBROOT/metrics"
fi

# Start crond in background, but only when the hub is actually polling (in
# standalone mode there's nothing to poll and the placeholder above stands
# in as a "polling not configured" sentinel — the placeholder's
# `spielplatz_poll_generated_timestamp` will quickly age past any sensible
# stale-observation threshold, which is the right signal for an operator
# scraping a non-hub container by mistake). Logs go to stderr so Docker
# picks them up; foreground supervision is not used (single-process
# container with a daemonised cron is the established pattern here).
if [ "$APP_MODE" = "hub" ]; then
    crond -b -L /dev/stderr
fi

exec nginx -g 'daemon off;'
