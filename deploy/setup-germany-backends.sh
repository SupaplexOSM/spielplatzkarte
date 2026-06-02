#!/usr/bin/env bash
# Sets up 12 Bundesland data-node backends on a host that already runs
# the spieli hub + Hessen data-node (~/spieli) and Berlin (~/spieli-berlin).
#
# Run from your home directory: bash setup-germany-backends.sh
#
# What it does per backend:
#   1. Creates ~/spieli-<slug>/ with compose.yml + db/init.sql
#   2. Patches compose.yml (PGRST_DB_URI key-value, POSTGRES_HOST_AUTH_METHOD)
#   3. Writes .env
#   4. Creates Traefik dynamic config
#
# After this script: start each stack and run the importer manually.
# See docs/ops/add-data-node.md for details.

set -euo pipefail

TRAEFIK_DYNAMIC_DIR="${HOME}/spieli-traefik/dynamic"
SOURCE_DIR="${HOME}/spieli"
DOMAIN_SUFFIX="spieli.osm-fulda.de"

BACKENDS=(
  "bayern:2145268:europe/germany/bayern-latest.osm.pbf:8083:Bayern"
  "brandenburg:62504:europe/germany/brandenburg-latest.osm.pbf:8084:Brandenburg"
  "bremen:62559:europe/germany/bremen-latest.osm.pbf:8085:Bremen"
  "hamburg:62782:europe/germany/hamburg-latest.osm.pbf:8086:Hamburg"
  "mv:28322:europe/germany/mecklenburg-vorpommern-latest.osm.pbf:8087:Mecklenburg-Vorpommern"
  "nrw:62761:europe/germany/nordrhein-westfalen-latest.osm.pbf:8088:Nordrhein-Westfalen"
  "rlp:62341:europe/germany/rheinland-pfalz-latest.osm.pbf:8089:Rheinland-Pfalz"
  "saarland:62372:europe/germany/saarland-latest.osm.pbf:8090:Saarland"
  "sachsen:62467:europe/germany/sachsen-latest.osm.pbf:8091:Sachsen"
  "sachsen-anhalt:62607:europe/germany/sachsen-anhalt-latest.osm.pbf:8092:Sachsen-Anhalt"
  "sh:51529:europe/germany/schleswig-holstein-latest.osm.pbf:8093:Schleswig-Holstein"
  "thueringen:62366:europe/germany/thueringen-latest.osm.pbf:8094:Thueringen"
)

echo "==> Setting up ${#BACKENDS[@]} Bundesland backends"
echo ""

for entry in "${BACKENDS[@]}"; do
  IFS=: read -r slug relation pbf port name <<< "$entry"
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
# Insert after the first occurrence only (db service block)
patched = text.replace(
    "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-CHANGE_ME}\n",
    "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-CHANGE_ME}\n      POSTGRES_HOST_AUTH_METHOD:  scram-sha-256\n",
    1  # replace first occurrence only
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
REIMPORT_INTERVAL_MAX_DAYS=2
REIMPORT_STARTUP_JITTER_MAX_HOURS=6
EOF

  # 5. Create Traefik dynamic config
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
echo '    { "slug": "hessen", "url": "https://spieli.eu/api", "name": "Hessen" },'
echo '    { "slug": "bawue",  "url": "https://bawue.spieli.eu/api", "name": "Baden-Württemberg" },'
echo '    { "slug": "berlin", "url": "https://berlin.spieli.osm-fulda.de/api", "name": "Berlin" },'
for entry in "${BACKENDS[@]}"; do
  IFS=: read -r slug relation pbf port name <<< "$entry"
  domain="${slug}.${DOMAIN_SUFFIX}"
  echo "    { \"slug\": \"${slug}\", \"url\": \"https://${domain}/api\", \"name\": \"${name}\" },"
done
echo '  ]'
echo '}'

echo ""
echo "==> Done. Next steps:"
echo "    1. Add DNS A records for all new subdomains → this server's IP"
echo "    2. For each backend, cd ~/spieli-<slug> && docker compose --profile data-node-ui up -d"
echo "    3. Run importer: docker compose --profile data-node-ui run --rm importer"
echo "    4. Update ~/spieli/registry.json with the entries above"
echo "    5. Restart hub: cd ~/spieli && docker compose --profile ui restart app"
echo "    Start with small ones (bremen, hamburg, saarland) and check memory before tackling nrw/bayern."
