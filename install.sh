#!/usr/bin/env bash
# spieli installer
# Downloads the production compose file and db schema, then walks through
# configuration interactively.
#
# Usage (download first so stdin stays attached to the terminal):
#   curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/install.sh -o install.sh
#   bash install.sh

set -euo pipefail

# ── Helpers ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { printf "${CYAN}==>${RESET} %s\n" "$*"; }
success() { printf "${GREEN}✓${RESET}  %s\n" "$*"; }
warn()    { printf "${YELLOW}!${RESET}  %s\n" "$*"; }
die()     { printf "${RED}error:${RESET} %s\n" "$*" >&2; exit 1; }

ask() {
    # ask <variable> <prompt> [default]
    local var="$1" prompt="$2" default="${3:-}"
    if [[ -n "$default" ]]; then
        printf "${BOLD}%s${RESET} [%s]: " "$prompt" "$default"
    else
        printf "${BOLD}%s${RESET}: " "$prompt"
    fi
    read -r input
    if [[ -z "$input" && -n "$default" ]]; then
        printf -v "$var" '%s' "$default"
    elif [[ -n "$input" ]]; then
        printf -v "$var" '%s' "$input"
    else
        die "$prompt is required."
    fi
}

ask_optional() {
    # ask_optional <variable> <prompt>
    local var="$1" prompt="$2"
    printf "${BOLD}%s${RESET} (leave empty to skip): " "$prompt"
    read -r input
    printf -v "$var" '%s' "${input:-}"
}

confirm() {
    # confirm <prompt> — returns 0 for yes, 1 for no
    printf "${BOLD}%s${RESET} [Y/n]: " "$1"
    read -r ans
    [[ "${ans:-y}" =~ ^[Yy]$ ]]
}

fetch() {
    # fetch <url> <dest>
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$2" "$1"
    else
        die "Neither curl nor wget found. Please install one and retry."
    fi
}

choose_mode() {
    while true; do
        printf "\n${BOLD}── Deployment mode ─────────────────────────────────────────────${RESET}\n"
        printf "  ${BOLD}1)${RESET} data-node     — database + PostgREST only (no UI)\n"
        printf "               suitable as a backend for an external hub\n"
        printf "  ${BOLD}2)${RESET} ui            — frontend only (no local database)\n"
        printf "               standalone: connects to one remote backend\n"
        printf "               hub: aggregates multiple backends into one map\n"
        printf "  ${BOLD}3)${RESET} data-node-ui  — full stack: database + PostgREST + UI\n"
        printf "               standalone regional map, or hub with local backend\n\n"
        printf "${BOLD}Select deployment mode${RESET} [1-3]: "
        read -r choice
        case "$choice" in
            1) DEPLOY_MODE="data-node";    break ;;
            2) DEPLOY_MODE="ui";           break ;;
            3) DEPLOY_MODE="data-node-ui"; break ;;
            *) warn "Invalid choice — please enter 1, 2, or 3." ;;
        esac
    done
    printf "${GREEN}✓${RESET}  Deployment mode: ${BOLD}%s${RESET}\n" "$DEPLOY_MODE"
}

choose_app_mode() {
    while true; do
        printf "\n${BOLD}── App mode ─────────────────────────────────────────────────────${RESET}\n"
        printf "  ${BOLD}1)${RESET} standalone — serve a single-region playground map\n"
        printf "  ${BOLD}2)${RESET} hub        — aggregate multiple backends into one map\n\n"
        printf "${BOLD}Select app mode${RESET} [1-2]: "
        read -r choice
        case "$choice" in
            1) APP_MODE="standalone"; break ;;
            2) APP_MODE="hub";        break ;;
            *) warn "Invalid choice — please enter 1 or 2." ;;
        esac
    done
    printf "${GREEN}✓${RESET}  App mode: ${BOLD}%s${RESET}\n" "$APP_MODE"
}

# ── Dependency check ───────────────────────────────────────────────────────────

for cmd in docker openssl; do
    command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is required but not found in PATH."
done
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is not available."
docker info >/dev/null 2>&1           || die "Docker daemon is not running."

# ── Header ─────────────────────────────────────────────────────────────────────

printf "\n"
printf "${BOLD}spieli — Production Installer${RESET}\n"
printf "Playground map powered by OpenStreetMap\n"
printf "https://github.com/mfuhrmann/spieli\n\n"

# ── Deployment directory ───────────────────────────────────────────────────────

ask DEPLOY_DIR "Deployment directory" "./spieli"
mkdir -p "$DEPLOY_DIR/db"

EXISTING_PASSWORD=""
DEPLOY_MODE=""
APP_MODE=""
EXISTING_ENV=false
if [[ -f "$DEPLOY_DIR/.env" ]]; then
    EXISTING_ENV=true
    warn ".env already exists in $DEPLOY_DIR"
    EXISTING_PASSWORD="$(grep '^POSTGRES_PASSWORD=' "$DEPLOY_DIR/.env" 2>/dev/null | cut -d= -f2 || true)"
    DEPLOY_MODE="$(grep '^DEPLOY_MODE=' "$DEPLOY_DIR/.env" 2>/dev/null | cut -d= -f2 || true)"
    APP_MODE="$(grep '^APP_MODE=' "$DEPLOY_DIR/.env" 2>/dev/null | cut -d= -f2 || true)"
    confirm "Overwrite it?" || die "Aborted."
fi

# ── Deployment mode selection ──────────────────────────────────────────────────

if [[ -n "$DEPLOY_MODE" ]]; then
    case "$DEPLOY_MODE" in
        data-node|ui|data-node-ui) ;;
        *) die "DEPLOY_MODE='$DEPLOY_MODE' in existing .env is not valid. Edit it to one of: data-node, ui, data-node-ui." ;;
    esac
    warn "Existing DEPLOY_MODE=${DEPLOY_MODE} detected — keeping it. (Re-run to change.)"
elif [[ "$EXISTING_ENV" == "true" ]]; then
    # Old .env without DEPLOY_MODE — assume full stack for backward compatibility
    DEPLOY_MODE="data-node-ui"
    warn "No DEPLOY_MODE in existing .env — defaulting to data-node-ui for backward compatibility."
else
    choose_mode
fi

# ── App mode selection (ui and data-node-ui only) ─────────────────────────────

if [[ "$DEPLOY_MODE" != "data-node" ]]; then
    if [[ -n "$APP_MODE" && ("$APP_MODE" == "standalone" || "$APP_MODE" == "hub") ]]; then
        warn "Existing APP_MODE=${APP_MODE} detected — keeping it. (Re-run to change.)"
    else
        choose_app_mode
    fi
else
    APP_MODE=""
fi

# ── Region configuration (data-node and data-node-ui only) ────────────────────

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    printf "\n${BOLD}── Region ──────────────────────────────────────────────────────${RESET}\n"
    printf "Find the OSM relation ID: https://nominatim.openstreetmap.org\n"
    printf "Find a PBF extract:       https://download.geofabrik.de\n\n"

    ask OSM_RELATION_ID "OSM relation ID of your region (e.g. 62700 = Landkreis Fulda)"
    ask PBF_URL         "Geofabrik PBF URL covering your region" \
        "https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf"
else
    OSM_RELATION_ID=""
    PBF_URL=""
fi

# ── Remote API URL (standalone ui mode only) ──────────────────────────────────

if [[ "$DEPLOY_MODE" == "ui" && "$APP_MODE" == "standalone" ]]; then
    printf "\n${BOLD}── Remote data node ────────────────────────────────────────────${RESET}\n"
    printf "Enter the base URL of the PostgREST API on your data node.\n\n"

    while true; do
        printf "${BOLD}Remote API base URL${RESET} (e.g. https://data.example.com/api): "
        read -r API_BASE_URL
        [[ -n "$API_BASE_URL" ]] && break
        warn "Remote API base URL is required for standalone UI mode."
    done
elif [[ "$DEPLOY_MODE" == "data-node-ui" ]]; then
    API_BASE_URL="/api"
else
    # hub mode — API_BASE_URL not used; hub reads from registry.json
    API_BASE_URL=""
fi

# ── Hub registry (hub mode only) ──────────────────────────────────────────────

REGISTRY_URL=""
HUB_POLL_INTERVAL=""
if [[ "$APP_MODE" == "hub" ]]; then
    printf "\n${BOLD}── Hub registry ────────────────────────────────────────────────${RESET}\n"

    if [[ "$DEPLOY_MODE" == "data-node-ui" ]]; then
        printf "This instance serves both a hub UI and a local data backend.\n"
        printf "A registry.json pointing to the local backend will be generated.\n\n"
    else
        printf "The hub aggregates backends listed in a registry.json file.\n"
        printf "A placeholder registry.json will be generated — edit it to add your backends.\n\n"
    fi

    ask REGISTRY_URL "Registry URL" "/registry.json"
    ask_optional HUB_POLL_INTERVAL "Hub poll interval in seconds (leave empty for default: 300)"
fi

# ── Hub federation — register with external hub (standalone only) ──────────────

PARENT_ORIGIN=""
if [[ "$APP_MODE" == "standalone" && "$DEPLOY_MODE" != "data-node" ]]; then
    printf "\n${BOLD}── Hub federation (optional) ────────────────────────────────────${RESET}\n"
    printf "If this instance will appear as a backend in an external hub,\n"
    printf "set the hub's full origin to enable cross-origin embedding.\n\n"
    ask_optional PARENT_ORIGIN "External hub origin (e.g. https://hub.example.com)"
    [[ -n "$PARENT_ORIGIN" ]] && success "PARENT_ORIGIN set — this instance will accept embedding from ${BOLD}${PARENT_ORIGIN}${RESET}."
fi

# ── Optional UI links (standalone mode only) ───────────────────────────────────

REGION_PLAYGROUND_WIKI_URL=""
REGION_CHAT_URL=""
if [[ "$DEPLOY_MODE" != "data-node" && "$APP_MODE" != "hub" ]]; then
    printf "\n${BOLD}── Optional: UI links ──────────────────────────────────────────${RESET}\n"
    ask_optional REGION_PLAYGROUND_WIKI_URL "Wiki page for 'Contribute data' modal"
    ask_optional REGION_CHAT_URL           "Community chat URL shown in 'Contribute data' modal"
fi

# ── Optional: map display (ui and data-node-ui only) ──────────────────────────

if [[ "$DEPLOY_MODE" != "data-node" ]]; then
    printf "\n${BOLD}── Optional: map display ───────────────────────────────────────${RESET}\n"
    if [[ "$APP_MODE" == "hub" ]]; then
        ask MAP_ZOOM      "Initial map zoom level (hub shows overview — lower is wider)" "6"
        ask MAP_MIN_ZOOM  "Minimum zoom level"                                           "4"
    else
        ask MAP_ZOOM      "Initial map zoom level"                                       "12"
        ask MAP_MIN_ZOOM  "Minimum zoom level"                                           "7"
    fi
    ask POI_RADIUS_M  "Nearby POI search radius (metres)" "5000"
else
    MAP_ZOOM="12"
    MAP_MIN_ZOOM="7"
    POI_RADIUS_M="5000"
fi

# ── Optional: infrastructure ──────────────────────────────────────────────────

APP_PORT=""
OSM2PGSQL_THREADS=""
AUTO_UPDATE=false

printf "\n${BOLD}── Optional: infrastructure ────────────────────────────────────${RESET}\n"

if [[ "$DEPLOY_MODE" != "data-node" ]]; then
    ask APP_PORT "Host port to expose the app on" "8080"
fi

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    ask OSM2PGSQL_THREADS "CPU threads for the OSM import" "4"
fi

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    printf "\n"
    printf "Automatic updates keep OSM data and software fresh without manual work.\n"
    printf "The importer will re-run every 2–10 days (randomised) and container\n"
    printf "images will be updated daily via Watchtower.\n\n"
    if confirm "Automatically keep data and software up to date? (recommended)"; then
        AUTO_UPDATE=true
        success "Auto-update enabled."
    else
        warn "Auto-update disabled. See instructions at the end of this setup."
    fi
fi

# ── Legal pages (Impressum / Datenschutzerklärung) ────────────────────────────
# Applicable to all deployment modes:
#   data-node     — importer writes contact details to api.legal_content
#   ui            — docker-entrypoint generates impressum.html + datenschutz.html
#   data-node-ui  — both of the above

IMPRESSUM_NAME=""
IMPRESSUM_ORG=""
IMPRESSUM_ADDRESS=""
IMPRESSUM_EMAIL=""
IMPRESSUM_PHONE=""
IMPRESSUM_URL=""
PRIVACY_URL=""
SITE_URL=""
LEGAL_CHOICE=""

printf "\n${BOLD}── Legal pages (Impressum / Datenschutzerklärung) ──────────────${RESET}\n"
printf "German law (TMG §5) and GDPR require an Impressum and privacy statement.\n"
printf "spieli can generate them from contact details, or link to pages you already host.\n\n"

if confirm "Configure legal pages now?"; then
    printf "\n"
    printf "  ${BOLD}1)${RESET} Generate pages from contact details (recommended)\n"
    printf "  ${BOLD}2)${RESET} Link to existing pages I already host\n"
    printf "  ${BOLD}3)${RESET} Skip — I will configure this manually in .env later\n\n"
    while true; do
        printf "${BOLD}Legal pages option${RESET} [1-3]: "
        read -r LEGAL_CHOICE
        case "$LEGAL_CHOICE" in
            1|2|3) break ;;
            *) warn "Please enter 1, 2, or 3." ;;
        esac
    done

    case "$LEGAL_CHOICE" in
        1)
            printf "\nContact details for the responsible person (TMG §5):\n\n"
            ask          IMPRESSUM_NAME    "Full name of responsible person (e.g. Max Mustermann)"
            ask_optional IMPRESSUM_ORG     "Organisation / association name (optional)"
            ask          IMPRESSUM_ADDRESS "Street address (e.g. Musterstraße 1, 36037 Fulda)"
            ask          IMPRESSUM_EMAIL   "Contact email address"
            ask_optional IMPRESSUM_PHONE   "Contact phone number (optional)"
            ask_optional SITE_URL          "Public URL of this instance (e.g. https://spieli.example.com)"
            success "Legal contact details set — pages will be generated at startup."
            ;;
        2)
            printf "\nURLs of your existing legal pages:\n\n"
            ask_optional IMPRESSUM_URL "Impressum URL (e.g. https://example.com/impressum)"
            ask_optional PRIVACY_URL   "Datenschutzerklärung URL (e.g. https://example.com/datenschutz)"
            ask_optional SITE_URL      "Public URL of this instance (e.g. https://spieli.example.com)"
            success "Legal override URLs set."
            ;;
        3)
            warn "Skipping legal configuration — add IMPRESSUM_* vars to .env to enable later."
            ;;
    esac
else
    warn "Skipping legal configuration — add IMPRESSUM_* vars to .env to enable later."
fi

# ── Generate password (data-node and data-node-ui only) ───────────────────────

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    if [[ -n "$EXISTING_PASSWORD" ]]; then
        POSTGRES_PASSWORD="$EXISTING_PASSWORD"
        success "Reusing existing database password (database volume already initialised)."
    else
        POSTGRES_PASSWORD="$(openssl rand -hex 32)"
        success "Generated secure database password."
    fi
else
    POSTGRES_PASSWORD=""
fi

# ── Download files ─────────────────────────────────────────────────────────────

BASE_URL="https://raw.githubusercontent.com/mfuhrmann/spieli/main"

printf "\n"
info "Downloading compose.yml..."
fetch "$BASE_URL/compose.prod.yml" "$DEPLOY_DIR/compose.yml"

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    info "Downloading db/init.sql..."
    fetch "$BASE_URL/db/init.sql" "$DEPLOY_DIR/db/init.sql"
fi

# Enable registry.json bind-mount in compose.yml for hub mode
if [[ "$APP_MODE" == "hub" && "$REGISTRY_URL" == "/registry.json" ]]; then
    sed -i \
        -e 's/^    # volumes:$/    volumes:/' \
        -e 's|^    #   - \./registry\.json:/usr/share/nginx/html/registry\.json:ro$|      - ./registry.json:/usr/share/nginx/html/registry.json:ro|' \
        "$DEPLOY_DIR/compose.yml"
fi

success "Files downloaded."

# ── Generate registry.json for hub mode ───────────────────────────────────────

if [[ "$APP_MODE" == "hub" && "$REGISTRY_URL" == "/registry.json" ]]; then
    if [[ "$DEPLOY_MODE" == "data-node-ui" ]]; then
        printf '{"instances":[{"slug":"local","url":"/api","name":"Local backend"}]}\n' \
            > "$DEPLOY_DIR/registry.json"
        success "Generated registry.json with local backend entry."
        info "Edit $DEPLOY_DIR/registry.json to add more backends."
    else
        printf '{"instances":[{"slug":"backend-1","url":"https://data1.example.com/api","name":"Region 1"}]}\n' \
            > "$DEPLOY_DIR/registry.json"
        success "Generated placeholder registry.json."
        info "Edit $DEPLOY_DIR/registry.json and replace the example entry with your real backends."
    fi
fi

# ── Write .env ─────────────────────────────────────────────────────────────────

{
    printf "# Generated by install.sh — %s\n\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf "# ── Deployment mode ─────────────────────────────────────────────\n"
    printf "DEPLOY_MODE=%s\n" "$DEPLOY_MODE"
    if [[ -n "$APP_MODE" ]]; then
        printf "APP_MODE=%s\n" "$APP_MODE"
    fi
    printf "\n"

    if [[ "$DEPLOY_MODE" != "ui" ]]; then
        printf "# ── Required: region ────────────────────────────────────────────\n"
        printf "OSM_RELATION_ID=%s\n" "$OSM_RELATION_ID"
        printf "PBF_URL=%s\n\n" "$PBF_URL"
    fi

    if [[ "$APP_MODE" == "standalone" && "$DEPLOY_MODE" == "ui" ]]; then
        printf "# ── API base URL ─────────────────────────────────────────────────\n"
        printf "API_BASE_URL=%s\n\n" "$API_BASE_URL"
    fi

    if [[ "$APP_MODE" == "hub" ]]; then
        printf "# ── Hub registry ─────────────────────────────────────────────────\n"
        printf "REGISTRY_URL=%s\n" "$REGISTRY_URL"
        if [[ -n "$HUB_POLL_INTERVAL" ]]; then
            printf "HUB_POLL_INTERVAL=%s\n" "$HUB_POLL_INTERVAL"
        fi
        printf "\n"
    fi

    if [[ "$APP_MODE" == "standalone" && "$DEPLOY_MODE" != "data-node" ]]; then
        if [[ -n "$PARENT_ORIGIN" ]]; then
            printf "# ── Hub federation ──────────────────────────────────────────────\n"
            printf "# This instance is registered as a backend in an external hub.\n"
            printf "PARENT_ORIGIN=%s\n\n" "$PARENT_ORIGIN"
        else
            printf "# ── Hub federation (optional) ───────────────────────────────────\n"
            printf "# Set to the hub's full origin if this instance is registered in an external hub.\n"
            printf "# PARENT_ORIGIN=\n\n"
        fi
    fi

    if [[ "$DEPLOY_MODE" != "data-node" && "$APP_MODE" != "hub" ]]; then
        printf "# ── Optional: UI links ──────────────────────────────────────────\n"
        printf "REGION_PLAYGROUND_WIKI_URL=%s\n" "$REGION_PLAYGROUND_WIKI_URL"
        printf "REGION_CHAT_URL=%s\n\n" "$REGION_CHAT_URL"
    fi

    if [[ "$DEPLOY_MODE" != "data-node" ]]; then
        printf "# ── Optional: map display ───────────────────────────────────────\n"
        printf "MAP_ZOOM=%s\n" "$MAP_ZOOM"
        printf "MAP_MIN_ZOOM=%s\n" "$MAP_MIN_ZOOM"
        printf "POI_RADIUS_M=%s\n\n" "$POI_RADIUS_M"
    fi

    printf "# ── Legal pages (Impressum / Datenschutzerklärung) ─────────────\n"
    printf "# SITE_URL: public base URL — used to build impressum_url/privacy_url in get_meta().\n"
    printf "SITE_URL=%s\n" "$SITE_URL"
    if [[ -n "$IMPRESSUM_URL" || -n "$PRIVACY_URL" ]]; then
        printf "# Override: link to existing external legal pages.\n"
        printf 'IMPRESSUM_URL="%s"\n' "$IMPRESSUM_URL"
        printf 'PRIVACY_URL="%s"\n\n' "$PRIVACY_URL"
    else
        printf "# Contact details for generated Impressum and Datenschutz pages.\n"
        printf 'IMPRESSUM_NAME="%s"\n'    "$IMPRESSUM_NAME"
        printf 'IMPRESSUM_ORG="%s"\n'     "$IMPRESSUM_ORG"
        printf 'IMPRESSUM_ADDRESS="%s"\n' "$IMPRESSUM_ADDRESS"
        printf 'IMPRESSUM_EMAIL="%s"\n'   "$IMPRESSUM_EMAIL"
        printf 'IMPRESSUM_PHONE="%s"\n\n' "$IMPRESSUM_PHONE"
    fi

    if [[ "$DEPLOY_MODE" != "data-node" ]]; then
        printf "# ── Optional: infrastructure ────────────────────────────────────\n"
        printf "APP_PORT=%s\n" "$APP_PORT"
    fi

    if [[ "$DEPLOY_MODE" != "ui" ]]; then
        printf "OSM2PGSQL_THREADS=%s\n\n" "$OSM2PGSQL_THREADS"

        if [[ "$AUTO_UPDATE" == "true" ]]; then
            printf "# ── Auto-update: re-import interval ─────────────────────────────\n"
            printf "# The importer will re-run every 2–10 days (randomised) using its built-in daemon scheduling.\n"
            printf "# Watchtower pulls updated images daily (requires --profile auto-update).\n"
            printf "REIMPORT_INTERVAL_MIN_DAYS=2\n"
            printf "REIMPORT_INTERVAL_MAX_DAYS=10\n\n"
        fi

        printf "# ── Database (auto-generated — do not edit) ─────────────────────\n"
        printf "POSTGRES_PASSWORD=%s\n" "$POSTGRES_PASSWORD"
    fi
} > "$DEPLOY_DIR/.env"

success "Configuration written to $DEPLOY_DIR/.env"

# ── Pull images ────────────────────────────────────────────────────────────────

printf "\n"
if confirm "Pull Docker images now? (recommended, ~500 MB)"; then
    info "Pulling images..."
    docker compose -f "$DEPLOY_DIR/compose.yml" --env-file "$DEPLOY_DIR/.env" \
        --profile "$DEPLOY_MODE" pull
    success "Images pulled."
fi

# ── Start stack ────────────────────────────────────────────────────────────────

printf "\n"
if confirm "Start the stack now?"; then
    if [[ "$DEPLOY_MODE" != "ui" ]]; then
        # ── Check for stale pgdata volume ──────────────────────────────────────
        PROJECT_NAME="$(basename "$(cd "$DEPLOY_DIR" && pwd)")"
        VOLUME_NAME="${PROJECT_NAME}_pgdata"
        if docker volume ls --format '{{.Name}}' | grep -q "^${VOLUME_NAME}$"; then
            warn "A database volume '${VOLUME_NAME}' already exists."
            warn "This often means a previous install or a dev stack with the same"
            warn "directory name already initialised the database with a different password."
            warn "Starting without removing it will cause authentication failures."
            printf "\n"
            if confirm "Delete the existing volume and start fresh? (existing data will be lost)"; then
                docker volume rm "$VOLUME_NAME" >/dev/null
                success "Volume removed. Database will be initialised with the new password."
            else
                warn "Proceeding without removing the volume — authentication may fail."
            fi
            printf "\n"
        fi
    fi

    case "$DEPLOY_MODE" in
        data-node)    info "Starting db and PostgREST..." ;;
        ui)           info "Starting app..." ;;
        data-node-ui) info "Starting db, PostgREST, and app..." ;;
    esac

    COMPOSE_PROFILES="$DEPLOY_MODE"
    [[ "$AUTO_UPDATE" == "true" ]] && COMPOSE_PROFILES="${COMPOSE_PROFILES},auto-update"

    PROFILE_ARGS=()
    IFS=',' read -ra _profiles <<< "$COMPOSE_PROFILES"
    for _p in "${_profiles[@]}"; do PROFILE_ARGS+=(--profile "$_p"); done

    docker compose -f "$DEPLOY_DIR/compose.yml" --env-file "$DEPLOY_DIR/.env" \
        "${PROFILE_ARGS[@]}" up -d
    success "Stack started."

    # ── Run import (data-node and data-node-ui only) ───────────────────────────
    if [[ "$DEPLOY_MODE" != "ui" ]]; then
        printf "\n"
        if [[ "$AUTO_UPDATE" == "true" ]]; then
            success "The importer is running with daemon scheduling and will begin the first import automatically."
            printf "  Monitor progress with: ${CYAN}docker compose -f %s/compose.yml logs -f importer${RESET}\n" \
                "$DEPLOY_DIR"
        else
            warn "The map will be empty until you import OSM data."
            if confirm "Run the OSM import now? (downloads the PBF and may take several minutes)"; then
                info "Starting importer..."
                docker compose -f "$DEPLOY_DIR/compose.yml" --env-file "$DEPLOY_DIR/.env" \
                    --profile "$DEPLOY_MODE" run --rm importer
                success "Import complete."
            else
                printf "\nRun the import later with:\n"
                printf "  ${CYAN}docker compose -f %s/compose.yml --profile %s run --rm importer${RESET}\n" \
                    "$DEPLOY_DIR" "$DEPLOY_MODE"
            fi
        fi
    fi
fi

# ── Done ───────────────────────────────────────────────────────────────────────

printf "\n${GREEN}${BOLD}Done!${RESET}\n\n"

if [[ "$DEPLOY_MODE" != "data-node" ]]; then
    printf "  App:    ${CYAN}http://localhost:${APP_PORT}${RESET}\n"
fi
printf "  Dir:    ${CYAN}%s${RESET}\n\n" "$(cd "$DEPLOY_DIR" && pwd)"

if [[ "$APP_MODE" == "hub" ]]; then
    printf "${YELLOW}Next step:${RESET} edit ${CYAN}%s/registry.json${RESET} to list your backends.\n\n" \
        "$(cd "$DEPLOY_DIR" && pwd)"
fi

printf "Useful commands (run from ${CYAN}%s${RESET}):\n" "$(cd "$DEPLOY_DIR" && pwd)"
printf "  docker compose --profile %s up -d        # start the stack\n" "$DEPLOY_MODE"
printf "  docker compose --profile %s down         # stop the stack\n" "$DEPLOY_MODE"

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    if [[ "$AUTO_UPDATE" == "true" ]]; then
        printf "  docker compose restart importer             # trigger an early re-import\n"
    else
        printf "  docker compose --profile %s run --rm importer  # re-import OSM data\n" "$DEPLOY_MODE"
        printf "\n"
        printf "${YELLOW}Manual update reminders:${RESET}\n"
        printf "  • Re-run the importer periodically to refresh OSM data.\n"
        printf "  • Pull updated images with: ${CYAN}docker compose pull${RESET}\n"
        printf "  • Systemd timer units for scheduled imports: ${CYAN}%s/deploy/${RESET}\n" \
            "$(cd "$DEPLOY_DIR" && pwd)"
    fi
fi

if [[ "$DEPLOY_MODE" != "data-node" ]]; then
    printf "  docker compose logs -f app              # watch app logs\n"
fi

if [[ "$DEPLOY_MODE" != "ui" ]]; then
    printf "  docker compose logs -f postgrest        # watch PostgREST logs\n"
fi
