#!/usr/bin/env bash
# spieli — Traefik + Let's Encrypt installer
# Sets up a TLS-terminating reverse proxy in front of the spieli stack.
# Traefik issues and renews the certificate automatically — no manual
# cert dance required.
#
# Usage (download first so stdin stays attached to the terminal):
#   curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/deploy/traefik/install-traefik.sh -o install-traefik.sh
#   bash install-traefik.sh

set -euo pipefail

# ── Helpers ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { printf "${CYAN}==>${RESET} %s\n" "$*"; }
success() { printf "${GREEN}✓${RESET}  %s\n" "$*"; }
warn()    { printf "${YELLOW}!${RESET}  %s\n" "$*"; }
die()     { printf "${RED}error:${RESET} %s\n" "$*" >&2; exit 1; }

ask() {
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


choose_mode() {
    while true; do
        printf "\n${BOLD}── Deployment mode ─────────────────────────────────────────────${RESET}\n"
        printf "  ${BOLD}1)${RESET} data-node-ui  — full stack with UI (proxies to app on port 8080)\n"
        printf "  ${BOLD}2)${RESET} data-node     — API only (proxies PostgREST on port 3000, adds CORS)\n\n"
        printf "${BOLD}Select mode${RESET} [1-2]: "
        read -r choice
        case "$choice" in
            1) TRAEFIK_MODE="data-node-ui"; break ;;
            2) TRAEFIK_MODE="data-node";    break ;;
            *) warn "Please enter 1 or 2." ;;
        esac
    done
    success "Mode: ${TRAEFIK_MODE}"
}

# ── Dependency check ───────────────────────────────────────────────────────────

for cmd in docker; do
    command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is required but not found in PATH."
done
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is not available."
docker info >/dev/null 2>&1            || die "Docker daemon is not running (or permission denied — try: sudo usermod -aG docker \$USER)."

# ── Header ─────────────────────────────────────────────────────────────────────

printf "\n"
printf "${BOLD}spieli — Traefik + Let's Encrypt installer${RESET}\n"
printf "Sets up a TLS-terminating reverse proxy in front of the spieli stack.\n\n"

# ── Configuration ──────────────────────────────────────────────────────────────

ask DEPLOY_DIR "Installation directory" "./spieli-traefik"
ask DOMAIN     "Domain name pointing to this server (e.g. spieli.example.com)"
ask EMAIL      "Email address for Let's Encrypt renewal notices"
choose_mode

# ── Write Compose file ─────────────────────────────────────────────────────────

mkdir -p "$DEPLOY_DIR/dynamic"

info "Writing Compose file..."
cat > "$DEPLOY_DIR/docker-compose.yml" <<'COMPOSEOF'
services:
  traefik:
    image: traefik:v3
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
      - ./dynamic:/etc/traefik/dynamic:ro
      - letsencrypt:/letsencrypt
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped

volumes:
  letsencrypt:
COMPOSEOF
success "Files written to $DEPLOY_DIR."

# ── Generate Traefik static config ─────────────────────────────────────────────

info "Writing Traefik config..."
cat > "$DEPLOY_DIR/traefik.yml" <<EOF
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  le:
    acme:
      email: $EMAIL
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web

providers:
  file:
    directory: /etc/traefik/dynamic
    watch: true
EOF

# ── Generate dynamic routing config ───────────────────────────────────────────

if [[ "$TRAEFIK_MODE" == "data-node-ui" ]]; then
    cat > "$DEPLOY_DIR/dynamic/app.yml" <<EOF
http:
  routers:
    spieli:
      rule: "Host(\`$DOMAIN\`)"
      entryPoints:
        - websecure
      tls:
        certResolver: le
      service: spieli
      middlewares:
        - security-headers

  middlewares:
    security-headers:
      headers:
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        contentTypeNosniff: true
        frameDeny: true
        referrerPolicy: strict-origin-when-cross-origin

  services:
    spieli:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:8080"
EOF
else
    cat > "$DEPLOY_DIR/dynamic/app.yml" <<EOF
http:
  routers:
    spieli-api:
      rule: "Host(\`$DOMAIN\`) && PathPrefix(\`/api/\`)"
      entryPoints:
        - websecure
      tls:
        certResolver: le
      service: postgrest
      middlewares:
        - strip-api
        - cors
        - security-headers

  middlewares:
    strip-api:
      stripPrefix:
        prefixes:
          - "/api"
    cors:
      headers:
        accessControlAllowOriginList:
          - "*"
        accessControlAllowMethods:
          - "GET"
          - "POST"
          - "OPTIONS"
        accessControlAllowHeaders:
          - "Authorization"
          - "Content-Type"
          - "Prefer"
    security-headers:
      headers:
        stsSeconds: 31536000
        contentTypeNosniff: true

  services:
    postgrest:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:3000"
EOF
fi

success "Config written."

# ── Start Traefik ──────────────────────────────────────────────────────────────

info "Starting Traefik..."
docker compose -f "$DEPLOY_DIR/docker-compose.yml" up -d
success "Traefik started."

printf "\n"
warn "Traefik will issue the TLS certificate on the first HTTPS request."
warn "This takes a few seconds. If the browser shows a cert error immediately"
warn "after starting, wait 10–15 seconds and reload."

# ── Done ───────────────────────────────────────────────────────────────────────

printf "\n${GREEN}${BOLD}Done!${RESET}\n\n"
printf "  HTTPS: ${CYAN}https://$DOMAIN${RESET}\n"
printf "  Dir:   ${CYAN}$(cd "$DEPLOY_DIR" && pwd)${RESET}\n\n"
printf "Useful commands (run from ${CYAN}$(cd "$DEPLOY_DIR" && pwd)${RESET}):\n"
printf "  docker compose up -d          # start\n"
printf "  docker compose down           # stop\n"
printf "  docker compose logs -f        # watch logs\n\n"
if [[ "$TRAEFIK_MODE" == "data-node-ui" ]]; then
    printf "${BOLD}Next step — install spieli:${RESET}\n"
    printf "  curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/install.sh -o install.sh\n"
    printf "  bash install.sh\n\n"
    printf "${YELLOW}Tip:${RESET} when the installer asks for the public URL, enter ${BOLD}https://$DOMAIN${RESET}\n"
else
    printf "${BOLD}Next step — install spieli (data-node mode):${RESET}\n"
    printf "  curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/install.sh -o install.sh\n"
    printf "  bash install.sh\n\n"
    printf "${YELLOW}Tip:${RESET} choose ${BOLD}data-node${RESET} mode in the installer.\n"
    printf "Your API will be available at ${CYAN}https://$DOMAIN/api/${RESET}\n"
fi
