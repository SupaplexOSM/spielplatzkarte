# Single-host Federation

A single-host federation runs a **pure hub** (no database) and multiple regional **data-nodes** on one VPS. It is a valid alternative to the [distributed topology](federated-deployment.md) and suits operators who want full-country coverage without coordinating multiple machines.

## Topology

```
                 spieli (hub)
                 DEPLOY_MODE=ui
                 port 8080
                      │
      ┌───────────────┼───────────────┐
      ▼               ▼               ▼
spieli-hessen    spieli-berlin    spieli-nrw  …
DEPLOY_MODE=     DEPLOY_MODE=     DEPLOY_MODE=
data-node-ui     data-node-ui     data-node-ui
port 8081        port 8082        port 8088
```

The hub serves the frontend and `registry.json`. Browsers fetch playground data cross-origin from each data-node's `/api/`. The hub itself has no database and no importer.

## When to use this topology

- One operator wants to cover a large region (e.g. all of Germany) without a multi-hour single import.
- You want a live test bed for hub federation features.
- You don't (yet) have other operators to host regional backends.

## Prerequisites

### Hardware

| Resource | Minimum | Recommended |
|---|---|---|
| RAM | 6 GiB | 8 GiB |
| Swap | **4 GiB** | 4 GiB |
| Disk | 20 GiB | 40 GiB+ |

**Swap is required.** Without swap, the Linux OOM killer fires when multiple importers run near-simultaneously, killing whichever process is largest at that moment. Even if each individual import fits in RAM, two medium-sized backends starting at the same time can exhaust available memory. 4 GiB of swap gives the kernel room to page out idle data and survive the overlap.

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Per-backend RAM and disk estimates

| Size class | Examples | pgdata | RAM (steady-state) |
|---|---|---|---|
| Small | Bremen, Hamburg, Saarland, Berlin | ~200–300 MB | ~50–150 MiB |
| Medium | Hessen, Thüringen, Sachsen-Anhalt, Brandenburg, MV | ~500 MB–1 GB | ~150–250 MiB |
| Large | Bayern, NRW, Niedersachsen, BaWü, Sachsen, RLP, SH | ~1–3 GB | ~300–600 MiB |

Check free RAM before adding large backends:

```bash
free -h
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" | sort -k2 -h
```

## Port allocation

| Stack | Port | Profile(s) |
|---|---|---|
| Hub | 8080 | `ui auto-update` |
| First data-node (e.g. Hessen) | 8081 | `data-node-ui` |
| Second data-node (e.g. Berlin) | 8082 | `data-node-ui` |
| … | 8083–8096 | `data-node-ui` |

Use consecutive ports and unique `COMPOSE_PROJECT_NAME` per stack.

## Setup

### Hub

The hub runs `DEPLOY_MODE=ui` with no database. Its `.env` contains no `OSM_RELATION_ID`, `PBF_URL`, or `POSTGRES_PASSWORD`:

```env
COMPOSE_PROJECT_NAME=spieli
DEPLOY_MODE=ui
APP_MODE=hub
APP_PORT=8080
REGISTRY_URL=/registry.json
HUB_POLL_INTERVAL=300
SITE_URL=https://hub.example.com
IMPRESSUM_NAME=...
IMPRESSUM_ADDRESS=...
IMPRESSUM_EMAIL=...
```

Bind-mount `registry.json` via `compose.override.yml` so you can update it without rebuilding:

```yaml
services:
  app:
    volumes:
      - ./registry.json:/usr/share/nginx/html/registry.json:ro
```

Start with `--profile ui --profile auto-update` (Watchtower lives here and covers all containers on the host):

```bash
docker compose --profile ui --profile auto-update up -d
```

### Data-nodes

Use `scripts/setup-germany-backends.sh` as a starting point for bulk setup. Edit the `SKIP_SLUGS` array for backends hosted elsewhere or not yet ready, and set `DOMAIN_SUFFIX` and `TRAEFIK_DYNAMIC_DIR` to match your environment.

For each backend the script creates the directory, patches `compose.yml`, writes `.env`, and drops a Traefik dynamic config. It does **not** start imports — do those manually after checking RAM.

### First import — one-shot before daemon

**Do not start the importer in daemon mode on a fresh database.** The daemon applies `api.sql` on startup before checking whether a reimport is needed. On an empty DB this fails because `planet_osm_polygon` does not exist yet, causing a crash-restart loop.

Instead, run the first import as a one-shot (no daemon env vars), then start the daemon:

```bash
cd ~/spieli-<slug>

# 1. Start db, postgrest, app — but not importer
docker compose --profile data-node-ui up -d db postgrest app

# 2. Run one-shot import (overrides daemon env vars from .env)
docker compose --profile data-node-ui run --rm \
  -e REIMPORT_INTERVAL_MIN_DAYS= \
  -e REIMPORT_INTERVAL_MAX_DAYS= \
  -e REIMPORT_STARTUP_JITTER_MAX_HOURS= \
  importer

# 3. After success, start daemon
docker compose --profile data-node-ui up -d importer
```

Import large backends one at a time. Check `free -h` before each large one.

### Startup jitter

`REIMPORT_STARTUP_JITTER_MAX_HOURS` delays the **first import on a fresh DB** by a random amount. This prevents all backends started at the same time from importing in parallel during initial setup.

!!! warning "Jitter does not affect ongoing daily reimports"
    Once a backend has data, the next reimport fires at `last_import_time + interval`. Jitter has no effect on this schedule. The spread between daily reimports comes from the natural difference in when each backend's first import completed. This is why swap is important — even with good timing, two backends may occasionally overlap.

Add jitter to `.env` after the first import completes:

```bash
echo "REIMPORT_STARTUP_JITTER_MAX_HOURS=12" >> ~/spieli-<slug>/.env
```

## Upgrading

See [Upgrading — Single-host federation](upgrade.md#single-host-federation-multiple-stacks-on-one-vps) for the full procedure. The short version: use `scripts/upgrade-stacks.sh`, which upgrades all stacks sequentially (data-nodes first, hub last) and handles the `API_ONLY=1` ordering automatically.

Standard releases with Watchtower active require no manual action — the daemon importer applies `api.sql` on every restart. Only [breaking-label releases](upgrade.md#breaking-label-procedures) need manual steps.

## Watchtower

Only the hub stack runs `--profile auto-update`. Adding a second Watchtower to any data-node stack causes both instances to fight over the same containers.

The single Watchtower instance in the hub stack watches all containers on the Docker host automatically — data-node containers are restarted even though their stacks don't include `auto-update`.

## See also

- [Federated Deployment](federated-deployment.md) — distributed (multi-host) topology
- [Add a Data-node](add-data-node.md) — adding one backend at a time
- [Upgrading](upgrade.md) — full upgrade guide for all deployment types
- [Configuration reference](configuration.md) — all env vars
