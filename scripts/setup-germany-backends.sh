#!/usr/bin/env bash
# Sets up Bundesland data-node backends on a host that already runs
# the spieli hub + Hessen data-node (~/spieli).
#
# All 15 non-Hessen Bundesländer are listed. Hessen is omitted — it is
# integrated into the hub stack (~/spieli). Add slugs you want to skip
# (already running, hosted elsewhere, not yet ready) to SKIP_SLUGS.
#
# Run from your home directory: bash setup-germany-backends.sh
#
# What it does per backend:
#   1. Creates ~/spieli-<slug>/ with compose.yml + db/init.sql
#   2. Patches compose.yml (PGRST_DB_URI key-value, POSTGRES_HOST_AUTH_METHOD)
#   3. Writes .env
#   4. Creates Traefik dynamic config
#
# After this script: start each stack and run the importer.
# See docs/ops/single-host-federation.md for the full walkthrough.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
TRAEFIK_DYNAMIC_DIR="${HOME}/spieli-traefik/dynamic"
SOURCE_DIR="${HOME}/spieli"
DOMAIN_SUFFIX="spieli.example.com"   # change to your domain

# Slugs to skip — already running, hosted elsewhere, or not yet ready.
# Example: SKIP_SLUGS=("berlin" "bawue")
SKIP_SLUGS=()
# ─────────────────────────────────────────────────────────────────────────────

# Format: "slug:relation_id:geofabrik_path:port:display_name"
# Hessen is absent — it is part of the hub stack (~/spieli, port 8080).
# Ports 8082–8096 are reserved for these 15 backends.
BACKENDS=(
  "bawue:62350:europe/germany/baden-wuerttemberg-latest.osm.pbf:8095:Baden-Württemberg"
  "bayern:2145268:europe/germany/bayern-latest.osm.pbf:8083:Bayern"
  "berlin:62422:europe/germany/berlin-latest.osm.pbf:8082:Berlin"
  "brandenburg:62504:europe/germany/brandenburg-latest.osm.pbf:8084:Brandenburg"
  "bremen:62559:europe/germany/bremen-latest.osm.pbf:8085:Bremen"
  "hamburg:62782:europe/germany/hamburg-latest.osm.pbf:8086:Hamburg"
  "mv:62937:europe/germany/mecklenburg-vorpommern-latest.osm.pbf:8087:Mecklenburg-Vorpommern"
  "niedersachsen:62701:europe/germany/niedersachsen-latest.osm.pbf:8096:Niedersachsen"
  "nrw:62761:europe/germany/nordrhein-westfalen-latest.osm.pbf:8088:Nordrhein-Westfalen"
  "rlp:62341:europe/germany/rheinland-pfalz-latest.osm.pbf:8089:Rheinland-Pfalz"
  "saarland:62372:europe/germany/saarland-latest.osm.pbf:8090:Saarland"
  "sachsen:62467:europe/germany/sachsen-latest.osm.pbf:8091:Sachsen"
  "sachsen-anhalt:62606:europe/germany/sachsen-anhalt-latest.osm.pbf:8092:Sachsen-Anhalt"
  "sh:51482:europe/germany/schleswig-holstein-latest.osm.pbf:8093:Schleswig-Holstein"
  "thueringen:62366:europe/germany/thueringen-latest.osm.pbf:8094:Thüringen"
)

skip_slug() {
  local slug="$1"
  for s in "${SKIP_SLUGS[@]:-}"; do [[ "$s" == "$slug" ]] && return 0; done
  return 1
}

echo "==> Setting up Bundesland backends (skipping: ${SKIP_SLUGS[*]:-none})"
echo ""

for entry in "${BACKENDS[@]}"; do
  IFS=: read -r slug relation pbf port name <<< "$entry"

  if skip_slug "$slug"; then
    echo "--- ${name} (skipped) ---"
    echo ""
    continue
  fi

  deploy_dir="${HOME}/spieli-${slug}"
  domain="${slug}.${DOMAIN_SUFFIX}"
  password=$(openssl rand -base64 24 | tr -d '/+=')

  echo "--- ${name} (port ${port}) ---"

  # 1. Create deploy dir
  mkdir -p "${deploy_dir}"
  cp "${SOURCE_DIR}/compose.yml" "${deploy_dir}/compose.yml"
  cp -r "${SOURCE_DIR}/db" "${deploy_dir}/db"

  # 2. Patch PGRST_DB_URI to key-value format (safe for any password)
  sed -i \
    's|PGRST_DB_URI:.*postgres://osm:.*@db:5432/osm|PGRST_DB_URI: "host=db port=5432 dbname=osm user=osm password=${POSTGRES_PASSWORD}"|' \
    "${deploy_dir}/compose.yml"

  # 3. Add POSTGRES_HOST_AUTH_METHOD under the db service only (not importer)
  python3 - "${deploy_dir}/compose.yml" << 'PYEOF'
import sys, re
path = sys.argv[1]
text = open(path).read()
patched = text.replace(
    "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-CHANGE_ME}\n",
    "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-CHANGE_ME}\n      POSTGRES_HOST_AUTH_METHOD:  scram-sha-256\n",
    1  # first occurrence only — db service, not importer
)
open(path, 'w').write(patched)
PYEOF

  # 4. Write .env
  cat > "${deploy_dir}/.env" << EOF
COMPOSE_PROJECT_NAME=spieli-${slug}
DEPLOY_MODE=data-node-ui
APP_PORT=${port}
OSM_RELATION_ID=${relation}
PBF_URL=https://download.geofabrik.de/${pbf}
POSTGRES_PASSWORD=${password}
REIMPORT_INTERVAL_MIN_DAYS=1
REIMPORT_INTERVAL_MAX_DAYS=1
EOF

  # 5. Create Traefik dynamic config
  mkdir -p "${TRAEFIK_DYNAMIC_DIR}"
  cat > "${TRAEFIK_DYNAMIC_DIR}/${slug}.yml" << EOF
http:
  routers:
    ${slug}:
      rule: "Host(\`${domain}\`)"
      entryPoints:
        - websecure
      tls:
        certResolver: le
      service: ${slug}
      middlewares:
        - security-headers

  services:
    ${slug}:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:${port}"
EOF

  echo "    dir:    ${deploy_dir}"
  echo "    domain: https://${domain}/api"
  echo "    done"
  echo ""
done

# 6. Print updated registry.json snippet
echo "==> Add these entries to ~/spieli/registry.json:"
echo ""
echo '{'
echo '  "instances": ['
echo '    { "slug": "hessen", "url": "https://spieli.example.com/api", "name": "Hessen" },'
for entry in "${BACKENDS[@]}"; do
  IFS=: read -r slug relation pbf port name <<< "$entry"
  if skip_slug "$slug"; then continue; fi
  domain="${slug}.${DOMAIN_SUFFIX}"
  echo "    { \"slug\": \"${slug}\", \"url\": \"https://${domain}/api\", \"name\": \"${name}\" },"
done
echo '  ]'
echo '}'

echo ""
echo "==> Done. Next steps:"
echo "    1. Add DNS A records for all new subdomains → this server's IP"
echo "    2. Start small backends first — check free RAM before large ones (Bayern, NRW, Niedersachsen, BaWü)"
echo "    3. For each backend, run a one-shot import first (avoids jitter-on-empty-DB crash):"
echo "         cd ~/spieli-<slug>"
echo "         docker compose --profile data-node-ui up -d db postgrest app"
echo "         docker compose --profile data-node-ui run --rm \\"
echo "           -e REIMPORT_INTERVAL_MIN_DAYS= -e REIMPORT_INTERVAL_MAX_DAYS= importer"
echo "    4. After import succeeds, add jitter and start daemon:"
echo "         echo 'REIMPORT_STARTUP_JITTER_MAX_HOURS=12' >> .env"
echo "         docker compose --profile data-node-ui up -d importer"
echo "    5. Monitor import: docker logs -f spieli-<slug>-importer-1"
echo "    5. Update ~/spieli/registry.json with the entries printed above"
echo "    6. Restart hub app:"
echo "         cd ~/spieli && docker compose --profile data-node-ui --profile auto-update up -d app"
