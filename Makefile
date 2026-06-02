.PHONY: install dev build serve test test-unit \
        up down import docker-build db-apply db-shell \
        seed-load seed-load2 seed-extract seed-extract2 import2 \
        require-npm require-docker installer lan-url \
        docs-install docs-serve docs-build docs-clean \
        help

# Bail with a clear message when a required tool is missing.
define require
@command -v $(1) >/dev/null 2>&1 || \
  { printf '\033[31merror:\033[0m %s is required but not found in PATH\n' '$(1)' >&2; exit 1; }
endef

require-npm:
	$(call require,node)
	$(call require,npm)

require-docker:
	$(call require,docker)
	@docker compose version >/dev/null 2>&1 || \
	  { printf '\033[31merror:\033[0m docker compose plugin is not available\n' >&2; exit 1; }
	@docker info >/dev/null 2>&1 || \
	  { printf '\033[31merror:\033[0m docker daemon is not running\n' >&2; exit 1; }

## ── Frontend (Svelte app in app/) ─────────────────────────────────────────────

install: require-npm      ## Install Node dependencies (Svelte app + E2E test runner)
	npm ci
	npm --prefix app ci

dev: require-npm          ## Start Vite dev server (localhost:5173, hot-reload)
	npm run dev --prefix app

build: require-npm        ## Production build → app/dist/
	npm run build --prefix app

serve: require-npm        ## Preview production build locally
	npm run serve --prefix app

test: require-npm test-unit  ## Run unit tests + Playwright E2E tests
	npm test

test-unit: require-npm    ## Run unit tests in app/src/lib/*.test.js
	npm --prefix app run test:unit

## ── Docker Compose stack ──────────────────────────────────────────────────────

up: require-docker        ## Start stack; run import automatically on first launch
	docker compose up -d --wait --timeout 300
	@if ! docker compose exec -T db psql -U osm -d osm -tc \
	    "SELECT 1 FROM information_schema.tables WHERE table_schema='api' LIMIT 1" \
	    2>/dev/null | grep -q 1; then \
	  printf '\033[36minfo:\033[0m first launch detected — importing OSM data…\n'; \
	  $(MAKE) import; \
	fi

down: require-docker      ## Stop and remove containers
	docker compose down

import: require-docker    ## Download PBF and import OSM data into PostGIS (run once or to refresh)
	SPIELI_VERSION=$$(node -e "process.stdout.write(require('./app/package.json').version)") \
	docker compose --profile data-node run --rm --build importer

docker-build: require-docker  ## Rebuild and restart the Svelte app container (Dockerfile.app)
	docker compose up -d --build app

## ── Database ──────────────────────────────────────────────────────────────────

db-apply: require-docker  ## Apply importer/api.sql to the running database and reload PostgREST schema
	set -a && . ./.env && \
	PG_MAX_PARALLEL_WORKERS=$${PG_MAX_PARALLEL_WORKERS:-2} \
	PG_MAX_PARALLEL_WORKERS_PER_GATHER=$${PG_MAX_PARALLEL_WORKERS_PER_GATHER:-2} \
	PG_MAX_PARALLEL_MAINTENANCE_WORKERS=$${PG_MAX_PARALLEL_MAINTENANCE_WORKERS:-2} \
	PG_MAINTENANCE_WORK_MEM=$${PG_MAINTENANCE_WORK_MEM:-256MB} \
	PG_WORK_MEM=$${PG_WORK_MEM:-32MB} \
	SPIELI_VERSION=$$(node -e "process.stdout.write(require('./app/package.json').version)") && \
	set +a && \
	for v in PG_MAX_PARALLEL_WORKERS PG_MAX_PARALLEL_WORKERS_PER_GATHER PG_MAX_PARALLEL_MAINTENANCE_WORKERS; do \
	    eval "val=\$$$$v"; \
	    case "$$val" in ''|*[!0-9]*) echo "$$v must be a positive integer (got: '$$val')" >&2; exit 1 ;; esac; \
	done && \
	for v in PG_MAINTENANCE_WORK_MEM PG_WORK_MEM; do \
	    eval "val=\$$$$v"; \
	    case "$$val" in *[0-9]kB|*[0-9]MB|*[0-9]GB|*[0-9]TB) ;; *) echo "$$v must be a number followed by kB|MB|GB|TB (got: '$$val')" >&2; exit 1 ;; esac; \
	done && \
	if [ "$$PG_MAX_PARALLEL_WORKERS_PER_GATHER" -gt "$$PG_MAX_PARALLEL_WORKERS" ] || [ "$$PG_MAX_PARALLEL_MAINTENANCE_WORKERS" -gt "$$PG_MAX_PARALLEL_WORKERS" ]; then \
	    echo "PG_MAX_PARALLEL_WORKERS_PER_GATHER and PG_MAX_PARALLEL_MAINTENANCE_WORKERS must each be ≤ PG_MAX_PARALLEL_WORKERS ($$PG_MAX_PARALLEL_WORKERS)" >&2; exit 1; \
	fi && \
	envsubst '$$OSM_RELATION_ID $$PG_MAX_PARALLEL_WORKERS $$PG_MAX_PARALLEL_WORKERS_PER_GATHER $$PG_MAX_PARALLEL_MAINTENANCE_WORKERS $$PG_MAINTENANCE_WORK_MEM $$PG_WORK_MEM $$SPIELI_VERSION $$IMPRESSUM_URL $$PRIVACY_URL $$SITE_URL' \
	< importer/api.sql | grep -E '^ALTER SYSTEM' | \
	docker compose exec -T db psql -U osm -d osm && \
	envsubst '$$OSM_RELATION_ID $$PG_MAX_PARALLEL_WORKERS $$PG_MAX_PARALLEL_WORKERS_PER_GATHER $$PG_MAX_PARALLEL_MAINTENANCE_WORKERS $$PG_MAINTENANCE_WORK_MEM $$PG_WORK_MEM $$SPIELI_VERSION $$IMPRESSUM_URL $$PRIVACY_URL $$SITE_URL' \
	< importer/api.sql | grep -v '^ALTER SYSTEM' | \
	docker compose exec -T db psql -U osm -d osm --single-transaction
	docker compose exec db psql -U osm -d osm -c "NOTIFY pgrst, 'reload schema';"

db-shell: require-docker  ## Open a psql shell in the running database container
	docker compose exec db psql -U osm -d osm

seed-load: require-docker ## Load dev fixture DB (4 sample Fulda playgrounds) — skips full OSM import
	docker compose up -d --wait db
	docker compose exec -T db psql -U osm -d osm < dev/seed/seed.sql
	docker compose exec db psql -U osm -d osm -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true

import2: require-docker ## Import Hessen PBF into second backend (Neuhof, relation 454881)
	SPIELI_VERSION=$$(node -e "process.stdout.write(require('./app/package.json').version)") \
	docker compose run --rm --build importer2

seed-load2: require-docker ## Load dev fixture DB2 (5 sample Neuhof playgrounds) — skips full OSM import
	docker compose up -d --wait db2
	docker compose exec -T db2 psql -U osm -d osm < dev/seed/seed2.sql
	docker compose exec db2 psql -U osm -d osm -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true

seed-extract: require-docker ## Regenerate dev/seed/seed.sql from the running DB (maintainers only)
	bash dev/seed/extract.sh

seed-extract2: require-docker ## Regenerate dev/seed/seed2.sql from the running DB2 (maintainers only)
	bash dev/seed/extract2.sh

## ── Production install ────────────────────────────────────────────────────────

installer: require-docker ## Run the interactive production installer (no git clone required)
	bash install.sh

## ── Local / mobile testing ────────────────────────────────────────────────────

lan-url:                  ## Print the LAN URLs to open the app on a phone (same WiFi)
	@LAN_IP=$$(hostname -I 2>/dev/null | awk '{print $$1}'); \
	  [ -z "$$LAN_IP" ] && LAN_IP=$$(ip route get 1 2>/dev/null | awk '{print $$7; exit}'); \
	  APP_PORT=$${APP_PORT:-8080} && \
	  if [ -z "$$LAN_IP" ]; then \
	    printf '\n  \033[33mCould not detect LAN IP.\033[0m Run: ip route get 1 | awk '"'"'{print $$7; exit}'"'"'\n\n'; \
	  else \
	    printf '\n  \033[36mLAN IP:\033[0m            %s\n' "$$LAN_IP" && \
	    printf '  \033[36mVite dev server:\033[0m   http://%s:5173\n' "$$LAN_IP" && \
	    printf '  \033[36mDocker stack:\033[0m      http://%s:%s\n\n' "$$LAN_IP" "$$APP_PORT"; \
	  fi

## ── Documentation ────────────────────────────────────────────────────────────

docs-install:             ## Set up Python venv and install MkDocs dependencies
	python3 -m venv .venv
	.venv/bin/pip install --quiet -r docs/requirements.txt

docs-serve:               ## Start MkDocs live-reload server at http://localhost:8000
	.venv/bin/mkdocs serve

docs-build:               ## Build static docs site into site/
	.venv/bin/mkdocs build --strict

docs-clean:               ## Remove site/ and .venv
	rm -rf site/ .venv

## ── Help ──────────────────────────────────────────────────────────────────────

help:                     ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
