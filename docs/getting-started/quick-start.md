# Quick Start

The easiest way to deploy spieli is with the interactive installer. It downloads everything it needs, walks you through configuration, and optionally runs the first import.

## Requirements

- Docker with the Compose plugin
- `bash`
- `openssl`
- `sha256sum` (Linux) or `shasum` (macOS — use `shasum -a 256 --check` instead)

## Install

```bash
TAG=v0.5.3  # check https://github.com/mfuhrmann/spieli/releases for the latest tag
curl -fsSL "https://github.com/mfuhrmann/spieli/releases/download/${TAG}/install.sh" -o install.sh
curl -fsSL "https://github.com/mfuhrmann/spieli/releases/download/${TAG}/install.sh.sha256" -o install.sh.sha256
sha256sum --check install.sh.sha256 && bash install.sh
```

## What the installer does

1. Asks for a deployment directory (default: `./spieli`)
2. Asks for your **deployment mode** (`data-node`, `ui`, or `data-node-ui`) — which services to run
3. Asks for your **app mode** (`standalone` or `hub`) — how the frontend behaves (skipped for `data-node`)
4. Asks for your OSM relation ID and Geofabrik PBF URL (for data-node and data-node-ui modes)
5. Prompts for optional settings (port, UI links, zoom levels, hub registry URL)
6. Generates a secure database password automatically
7. Downloads `compose.yml` and `db/init.sql` into the deployment directory
8. Generates `registry.json` for hub mode and enables its bind-mount in `compose.yml`
9. Offers to pull images, start the stack, and run the first import

!!! tip "Finding your OSM relation ID"
    Search for your city, Kreis, or district on [Nominatim](https://nominatim.openstreetmap.org). The relation ID appears in the URL — e.g. `openstreetmap.org/relation/62700` → ID is `62700`.

!!! tip "Finding a PBF extract"
    Browse [download.geofabrik.de](https://download.geofabrik.de) for an extract covering your region. The PBF only needs to *contain* your region — a Bundesland extract works fine for a single Kreis.

## Installation scenarios

The installer guides you through five supported scenarios. Two variables combine to define your setup: `DEPLOY_MODE` (which services run) and `APP_MODE` (how the frontend behaves).

| Scenario | `DEPLOY_MODE` | `APP_MODE` | What starts | Use when |
|---|---|---|---|---|
| **Standalone** | `data-node-ui` | `standalone` | DB + PostgREST + app | Single self-contained regional map (default) |
| **Standalone + federated** | `data-node-ui` | `standalone` | DB + PostgREST + app | Own regional map that also appears as a backend in an external hub |
| **Hub only** | `ui` | `hub` | App only | Aggregate multiple remote backends into one map |
| **Hub + local backend** | `data-node-ui` | `hub` | DB + PostgREST + app | Hub UI with a local data backend on the same host |
| **Backend only** | `data-node` | — | DB + PostgREST | Provide data to an external hub, no local UI |

For standalone + federated: the installer asks for `PARENT_ORIGIN` (the hub's origin) to enable cross-origin embedding.

For hub scenarios: the installer asks for `REGISTRY_URL` and generates a starter `registry.json`. Edit it after setup to list your backends.

## Managing the stack

After setup, manage the stack from your deployment directory:

```bash
cd spieli

# Start the stack
docker compose --profile data-node-ui up -d

# Re-import OSM data (clips to your region with osmium, then runs osm2pgsql)
docker compose --profile data-node run --rm importer

# Stop the stack
docker compose --profile data-node-ui down
```

Replace `data-node-ui` with whichever mode you chose at install time (`DEPLOY_MODE` in your `.env`).

## Going public with HTTPS

The stack runs on plain HTTP (port 8080) by default. For a public deployment, set up a TLS-terminating reverse proxy.

spieli ships a ready-made Docker Compose stack with Traefik and Let's Encrypt. Install spieli first, then add the proxy:

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/deploy/traefik/install-traefik.sh -o install-traefik.sh
bash install-traefik.sh
```

Traefik handles certificate issuance and renewal automatically — no manual cert steps. See [HTTPS setup](../ops/https-setup.md) for the full walkthrough and firewall rules.

---

## Contributing your region to a Hub

If someone is running a spieli Hub and you want your region to appear on it, stand up a data-node and send them your API URL. The hub operator then adds you to their `registry.json`.

**1. Run the installer**

```bash
TAG=v0.5.3  # check https://github.com/mfuhrmann/spieli/releases for the latest tag
curl -fsSL "https://github.com/mfuhrmann/spieli/releases/download/${TAG}/install.sh" -o install.sh
curl -fsSL "https://github.com/mfuhrmann/spieli/releases/download/${TAG}/install.sh.sha256" -o install.sh.sha256
sha256sum --check install.sh.sha256 && bash install.sh
```

When prompted for deployment mode, choose `data-node` or `data-node-ui`. Run the import when asked.

**2. Expose `/api/` over HTTPS**

Run the Traefik installer (see above) and select **data-node** mode. This sets up HTTPS and adds the required CORS headers so the Hub's browsers can fetch your API cross-origin.

**3. Verify**

From a different machine:

```bash
curl -i https://your-city.example.com/api/rpc/get_meta
# expect: 200 OK, JSON body, Access-Control-Allow-Origin: * header
```

**4. Send the hub operator your API URL**: `https://your-city.example.com/api`

---

## Running a Hub

If you operate a spieli Hub and want to add a new backend region, add it to your `registry.json`:

```json
{
  "instances": [
    { "slug": "existing-region", "url": "https://existing.example.com/api", "name": "Existing Region" },
    { "slug": "new-city",        "url": "https://your-city.example.com/api", "name": "New City" }
  ]
}
```

The Hub re-reads `registry.json` every 5 minutes — no restart needed.

!!! tip "Choosing a slug"
    The `slug` is optional but recommended — it makes deep-links shareable and stable (e.g. `https://hub.example.com/#new-city/W123456`). Use lowercase ASCII letters, digits, and hyphens only.

For the full federation walkthrough including topology diagrams and verification steps, see [Federated Deployment](../ops/federated-deployment.md).

---

## Next steps

- [HTTPS setup](../ops/https-setup.md) — Traefik + Let's Encrypt reverse proxy
- [Configuration reference](../ops/configuration.md) — all available environment variables
- [Troubleshooting](../ops/troubleshooting.md) — common problems and fixes
- [Uninstall](../ops/uninstall.md) — remove the stack completely
