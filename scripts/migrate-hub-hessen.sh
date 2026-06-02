#!/usr/bin/env bash
# migrate-hub-hessen.sh — splits the combined hub+Hessen stack into
# a pure hub (~/spieli, DEPLOY_MODE=ui) and a dedicated Hessen
# data-node (~/spieli-hessen, port 8081).
#
# Phase 1 (default): creates ~/spieli-hessen and starts the import.
# Phase 2 (--convert): updates registry.json, converts hub to ui-only,
#   removes orphaned DB volumes. Run after verifying the Hessen import.
#
# Usage:
#   bash scripts/migrate-hub-hessen.sh           # phase 1
#   bash scripts/migrate-hub-hessen.sh --convert  # phase 2

set -euo pipefail

HESSEN_DIR="$HOME/spieli-hessen"
HUB_DIR="$HOME/spieli"
TRAEFIK_DIR="$HOME/spieli-traefik/dynamic"
HESSEN_PORT=8081
HESSEN_DOMAIN="hessen.spieli.osm-fulda.de"
CONVERT="${1:-}"

# ── Phase 1: Create ~/spieli-hessen ──────────────────────────────────────────
if [[ "$CONVERT" != "--convert" ]]; then

echo ""
echo "━━━ Phase 1: Create ~/spieli-hessen ━━━"

if [[ -d "$HESSEN_DIR" ]]; then
  echo "  $HESSEN_DIR already exists — skipping directory creation"
else
  mkdir -p "$HESSEN_DIR"
  cp "$HUB_DIR/compose.yml" "$HESSEN_DIR/compose.yml"
  cp -r "$HUB_DIR/db" "$HESSEN_DIR/db"
  echo "  Created $HESSEN_DIR"
fi

# Patch PGRST_DB_URI to key-value format (safe for any password)
if grep -q 'postgres://osm:' "$HESSEN_DIR/compose.yml"; then
  sed -i \
    's|PGRST_DB_URI:.*postgres://osm:.*@db:5432/osm|PGRST_DB_URI: "host=db port=5432 dbname=osm user=osm password=${POSTGRES_PASSWORD}"|' \
    "$HESSEN_DIR/compose.yml"
  echo "  Patched PGRST_DB_URI"
else
  echo "  PGRST_DB_URI already patched — skipping"
fi

# Patch POSTGRES_HOST_AUTH_METHOD (first occurrence only = db service)
if ! grep -q 'POSTGRES_HOST_AUTH_METHOD' "$HESSEN_DIR/compose.yml"; then
  PATCH_PY=$(mktemp /tmp/patch_XXXXXX.py)
  printf '%s\n' \
    'import sys' \
    'path = sys.argv[1]' \
    'text = open(path).read()' \
    'needle = "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-CHANGE_ME}\n"' \
    'replacement = needle + "      POSTGRES_HOST_AUTH_METHOD:  scram-sha-256\n"' \
    'open(path, "w").write(text.replace(needle, replacement, 1))' \
    > "$PATCH_PY"
  python3 "$PATCH_PY" "$HESSEN_DIR/compose.yml"
  rm "$PATCH_PY"
  echo "  Patched POSTGRES_HOST_AUTH_METHOD"
else
  echo "  POSTGRES_HOST_AUTH_METHOD already present — skipping"
fi

# Verify patch
if ! grep -q 'POSTGRES_HOST_AUTH_METHOD' "$HESSEN_DIR/compose.yml"; then
  echo "ERROR: patch failed — POSTGRES_HOST_AUTH_METHOD not found in compose.yml" >&2
  exit 1
fi

# Write .env (skip if already exists)
if [[ ! -f "$HESSEN_DIR/.env" ]]; then
  PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
  IMPRESSUM_NAME=$(grep   '^IMPRESSUM_NAME='    "$HUB_DIR/.env" | cut -d= -f2-)
  IMPRESSUM_ADDRESS=$(grep '^IMPRESSUM_ADDRESS=' "$HUB_DIR/.env" | cut -d= -f2-)
  IMPRESSUM_EMAIL=$(grep   '^IMPRESSUM_EMAIL='   "$HUB_DIR/.env" | cut -d= -f2-)
  printf '%s\n' \
    "COMPOSE_PROJECT_NAME=spieli-hessen" \
    "DEPLOY_MODE=data-node-ui" \
    "APP_PORT=$HESSEN_PORT" \
    "OSM_RELATION_ID=62650" \
    "PBF_URL=https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf" \
    "POSTGRES_PASSWORD=$PASSWORD" \
    "REIMPORT_INTERVAL_MIN_DAYS=1" \
    "REIMPORT_INTERVAL_MAX_DAYS=1" \
    "SITE_URL=https://$HESSEN_DOMAIN" \
    "IMPRESSUM_NAME=$IMPRESSUM_NAME" \
    "IMPRESSUM_ADDRESS=$IMPRESSUM_ADDRESS" \
    "IMPRESSUM_EMAIL=$IMPRESSUM_EMAIL" \
    > "$HESSEN_DIR/.env"
  echo "  Written .env"
else
  echo "  .env already exists — skipping"
fi

# Traefik dynamic config
if [[ ! -f "$TRAEFIK_DIR/hessen.yml" ]]; then
  printf '%s\n' \
    'http:' \
    '  routers:' \
    '    hessen:' \
    "      rule: \"Host(\`$HESSEN_DOMAIN\`)\"" \
    '      entryPoints:' \
    '        - websecure' \
    '      tls:' \
    '        certResolver: le' \
    '      service: hessen' \
    '      middlewares:' \
    '        - security-headers' \
    '  services:' \
    '    hessen:' \
    '      loadBalancer:' \
    '        servers:' \
    "          - url: \"http://host.docker.internal:$HESSEN_PORT\"" \
    > "$TRAEFIK_DIR/hessen.yml"
  echo "  Written Traefik config for $HESSEN_DOMAIN"
else
  echo "  Traefik config already exists — skipping"
fi

# Start db + app only — importer runs as one-shot below to avoid the
# jitter-on-empty-DB crash (API_ONLY fails when planet_osm_polygon doesn't exist yet).
cd "$HESSEN_DIR"
docker compose --profile data-node-ui up -d db postgrest app

echo "  Running first import (one-shot, no daemon/jitter)..."
echo "  This takes ~15 min for Hessen. Watch progress below."
echo ""
docker compose --profile data-node-ui run --rm \
  -e REIMPORT_INTERVAL_MIN_DAYS= \
  -e REIMPORT_INTERVAL_MAX_DAYS= \
  -e REIMPORT_STARTUP_JITTER_MAX_HOURS= \
  importer

# Add jitter now that data exists, then start daemon
echo "REIMPORT_STARTUP_JITTER_MAX_HOURS=12" >> "$HESSEN_DIR/.env"
docker compose --profile data-node-ui up -d importer
echo ""
echo "  Import complete. Daemon importer started with jitter."
echo ""
echo "  Verify:"
echo "    curl -s https://$HESSEN_DOMAIN/api/rpc/get_meta | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d.get('version'), d['playground_count'])\""
echo ""
echo "━━━ Phase 1 done. When verified, run:"
echo "      bash scripts/migrate-hub-hessen.sh --convert"
echo "━━━"

fi  # end phase 1

# ── Phase 2: Convert hub to pure ui ──────────────────────────────────────────
if [[ "$CONVERT" == "--convert" ]]; then

echo ""
echo "━━━ Phase 2: Convert ~/spieli to pure hub ━━━"

# Verify Hessen is up before proceeding
echo "  Checking Hessen backend..."
META=$(curl -sf "http://localhost:$HESSEN_PORT/api/rpc/get_meta" 2>/dev/null) || {
  echo "ERROR: Hessen backend not reachable on port $HESSEN_PORT. Verify import completed first." >&2
  exit 1
}
COUNT=$(printf '%s' "$META" | python3 -c "import sys,json; print(json.load(sys.stdin)['playground_count'])")
if [[ "$COUNT" -eq 0 ]]; then
  echo "ERROR: Hessen backend reachable but playground_count=0. Import may not be complete." >&2
  exit 1
fi
echo "  Hessen OK — playground_count=$COUNT"

# Update registry.json: swap spieli.eu/api → hessen domain
if grep -q 'spieli.eu/api' "$HUB_DIR/registry.json"; then
  sed -i "s|https://spieli.eu/api|https://$HESSEN_DOMAIN/api|g" "$HUB_DIR/registry.json"
  echo "  Updated registry.json — Hessen URL now $HESSEN_DOMAIN"
else
  echo "  registry.json already updated — skipping"
fi

# Confirm before destructive step
echo ""
echo "  Next: stop data-node containers in ~/spieli and restart as pure hub."

# Auto-confirm is not safe for a destructive step — require explicit flag
read -r -p "  Proceed? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "  Aborted. registry.json already updated — hub will pick it up within 300s."
  exit 0
fi

# Switch DEPLOY_MODE
sed -i 's/^DEPLOY_MODE=data-node-ui/DEPLOY_MODE=ui/' "$HUB_DIR/.env"
echo "  Set DEPLOY_MODE=ui in hub .env"

# Bring down data-node profile, bring up ui-only
cd "$HUB_DIR"
docker compose --profile data-node-ui --profile auto-update down
docker compose --profile ui --profile auto-update up -d
echo "  Hub restarted as pure ui + Watchtower"

# Clean up orphaned volumes
echo ""
echo "  Orphaned volumes from old Hessen DB:"
docker volume ls --filter name=spieli_pgdata --filter name=spieli_pbf_cache --format '  {{.Name}}'
read -r -p "  Remove them? [y/N] " RMVOL
if [[ "$RMVOL" == "y" || "$RMVOL" == "Y" ]]; then
  docker volume rm spieli_pgdata spieli_pbf_cache 2>/dev/null && echo "  Volumes removed" || echo "  Some volumes not found — skipped"
fi

echo ""
echo "  Verify hub: curl -si http://localhost:8080 | head -3"
echo "  Then open spieli.eu in browser — all backends should be green."
echo ""
echo "━━━ Migration complete ━━━"

fi  # end phase 2
