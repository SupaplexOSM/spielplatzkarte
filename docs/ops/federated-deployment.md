# Federated Deployment (Hub + data-nodes)

A **federated** deployment consists of one **Hub UI** (no local database) aggregating two or more regional **data-nodes** into a single map. Users browse at the Hub's URL; their browser talks directly to each data-node's PostgREST `/api/`, merging the results client-side.

This walkthrough stands up the topology end-to-end. For a single-region deployment, see [Manual Deploy](manual-deploy.md) instead.

## Topology

```
                ┌──────────────────────────────────────────────┐
                │                                              │
                │    Hub UI (DEPLOY_MODE=ui, APP_MODE=hub)     │
  Browser ────► │    • serves the app bundle                   │
                │    • serves registry.json                    │
                │    • NO database, NO /api                    │
                │                                              │
                └──────────┬─────────────────┬─────────────────┘
                           │                 │
                           │ CORS            │ CORS
                           ▼                 ▼
      ┌───────────────────────────┐ ┌───────────────────────────┐
      │ Data-node A               │ │ Data-node B               │
      │ DEPLOY_MODE=data-node-ui  │ │ DEPLOY_MODE=data-node-ui  │
      │ • PostGIS + PostgREST     │ │ • PostGIS + PostgREST     │
      │ • nginx serves /api/+CORS │ │ • nginx serves /api/+CORS │
      └───────────────────────────┘ └───────────────────────────┘
```

Each data-node runs the full `data-node-ui` profile so the shipped nginx config serves `/api/` with the CORS headers the Hub's browser clients need. The Hub is the same frontend image flipped to `APP_MODE=hub` with a `registry.json` listing the data-node API URLs, and no database of its own.

!!! note "Pure `DEPLOY_MODE=data-node` (advanced)"
    The `data-node` profile (invoked with `--profile data-node`) ships db + PostgREST only — no HTTP server, no port publish, no CORS handling. You can use it if you run your own reverse proxy in front of the PostgREST container and add the right `Access-Control-Allow-*` headers to `/api/` responses. For the happy path, prefer `data-node-ui` — it's what this walkthrough assumes. In `data-node-ui` mode only `/api/` needs to be reachable from the Hub's origin; front the `APP_PORT` with a reverse proxy that blocks paths other than `/api/` if you don't want the secondary standalone UI publicly reachable.

## Prerequisites

- One host (or cluster) per node — the Hub and each data-node can run on the same machine or on separate ones. Each must reach the others over HTTP/HTTPS.
- Docker with the Compose plugin on every host.
- One OSM relation ID and one Geofabrik PBF URL per data-node ([how to find them](manual-deploy.md#step-1-find-your-regions-osm-relation-id)).
- HTTPS-terminating reverse proxy in front of each data-node in production — the browser must be able to fetch the data-node's `/api/` over HTTPS when the Hub itself is served over HTTPS.
- When co-locating nodes on one host, give each its own `APP_PORT` (e.g. `8080`, `8081`, `8082`) and its own `COMPOSE_PROJECT_NAME` (e.g. `spieli-fulda`, `spieli-neuhof`, `spieli-hub`) so port bindings and Docker resource names don't collide.
- **Data-node version**: each data-node must run a release that ships the tiered playground API (`get_playground_clusters`, `get_playgrounds_bbox`, `get_playground`) and the completeness fields on `get_meta` (`complete`, `partial`, `missing`). These landed in the same release that introduced this walkthrough; an older data-node still joins successfully but degrades to a legacy fallback path — see the [federation reference's Federation endpoints table](../reference/federation.md#federation-endpoints) for the degradation matrix. If you can, upgrade every data-node before pointing a current Hub at it.

## Step 1 — Stand up each data-node

Repeat on every data-node host. For this walkthrough the two backends are "Fulda" and "Neuhof".

### Data-node `.env`

Replace `<strong-random-password>` with an actual generated secret (`openssl rand -base64 24` is fine) — the angle brackets are a placeholder, not a literal value.

```env
DEPLOY_MODE=data-node-ui
OSM_RELATION_ID=454863
PBF_URL=https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf
POSTGRES_PASSWORD=<strong-random-password>
```

No `APP_MODE`, no `REGISTRY_URL` — the frontend on a data-node runs in its default standalone mode purely so nginx can serve `/api/` with CORS. `API_BASE_URL` stays at its default `/api`.

### Start the backend and import

```bash
docker compose --profile data-node-ui up -d
docker compose --profile data-node-ui run --rm importer
```

The first command starts `db`, `postgrest`, and the `app` container (which hosts nginx in front of PostgREST). The second runs the importer once — see [Manual Deploy § Step 4](manual-deploy.md#step-4-start-the-stack-and-import-data) for what the import does and how long it takes.

### Expose `/api/` to the Hub

Because the Hub's browser clients hit `/api/` cross-origin, each data-node must be reachable at a stable URL (e.g. `https://fulda.example.com/api`) and respond with CORS headers. The shipped nginx config in `data-node-ui` mode adds `Access-Control-Allow-Origin: *` and the right methods on `/api/` automatically — no extra configuration needed. In production, front `APP_PORT` with an HTTPS-terminating reverse proxy.

Verify from a machine that is **not** the data-node itself:

```bash
curl -i https://fulda.example.com/api/rpc/get_meta
# expect 200 OK, JSON body with { relation_id, name, playground_count, bbox }
# response should also include: Access-Control-Allow-Origin: *
```

## Step 2 — Prepare `registry.json`

The Hub discovers its data-nodes by fetching a `registry.json` from its own origin. Create the file you'll deploy with the Hub:

```json
{
  "instances": [
    {
      "slug": "fulda",
      "url":  "https://fulda.example.com/api",
      "name": "Fulda"
    },
    {
      "slug": "neuhof",
      "url":  "https://neuhof.example.com/api",
      "name": "Neuhof"
    }
  ]
}
```

**Field rules** — see the [`registry.json` reference](../reference/registry-json.md) for the full schema. The short version:

| Field | Required | Notes |
|---|---|---|
| `url`  | yes | Absolute URL of the data-node's PostgREST base — no trailing slash |
| `name` | recommended | Human-readable label shown in the instance drawer. Falls back to the `url` if omitted, which gives ugly labels — always set it in practice |
| `slug` | no  | Stable lowercase-ASCII identifier used in shareable deep-links |

Do **not** add `version` or `region` fields — the Hub populates those at runtime from each backend's `/api/rpc/get_meta` response. Anything you put in `registry.json` for those keys is ignored.

The file is served from the **Hub's own origin** under `/registry.json` (the default value of `REGISTRY_URL`). It is *not* fetched from one of the data-nodes. CORS is not needed for the registry file itself, only for the data-node APIs it points at (handled in Step 1).

## Step 3 — Stand up the Hub

### Hub `.env`

```env
DEPLOY_MODE=ui
APP_MODE=hub
REGISTRY_URL=/registry.json
HUB_POLL_INTERVAL=300
APP_PORT=8080
```

Notes:

- `REGISTRY_URL=/registry.json` is the default and means "same origin as the Hub". Set a different value only if you host the registry elsewhere. The value is sanitized by the container entrypoint — only `A-Z a-z 0-9 : / . + _ % ~ -` survive, so query strings (`?v=2`) and fragments (`#anchor`) are silently dropped. Use a clean path.
- `HUB_POLL_INTERVAL` is seconds as a bare integer (e.g. `300`, not `300s`). Default 300 re-fetches playground data from every data-node every 5 minutes.
- **`API_BASE_URL` is deliberately absent** on a Hub. The Hub speaks to multiple data-nodes over CORS and reads their URLs from `registry.json`; a single `API_BASE_URL` would be meaningless.
- `OSM_RELATION_ID`, `PBF_URL`, `POSTGRES_PASSWORD` are **not** set on the Hub — it has no database.

### Replace the bundled `registry.json` (required)

The Hub's shipped image bundles a default `registry.json` pointing at `/api` (the local backend). That path has no upstream in the `ui` profile, so a Hub started without this step will load with every backend marked red. Pick one of the following — **neither is optional**:

**Option A — bind-mount via `compose.override.yml` (recommended, no rebuild)**

Create `compose.override.yml` alongside `compose.yml`:

```yaml
services:
  app:
    volumes:
      - ./registry.json:/usr/share/nginx/html/registry.json:ro
```

Docker Compose merges this file automatically — no extra `-f` flags needed, and it survives future `compose.yml` upgrades.

**Option B — custom image**

Build your own image from source with your `registry.json` placed at `app/public/registry.json` before building. No override file needed in this case. (Source clone required — skip if using pre-built images.)

### Start the Hub

```bash
docker compose --profile ui up -d
```

No rebuild required; nginx serves the file immediately.

The Hub has no importer, no database, no `run --rm importer` step.

## Step 4 — Verify

1. Open the Hub URL in a browser (e.g. `https://hub.example.com`).
2. You should see the map render, fit to the union of all configured regions, with the instance pill in the bottom-left showing the aggregated region + playground counts (localized German: e.g. `2 Regionen · <count> Spielplätze` with a globe icon).
3. Open DevTools → Network and reload. You should see:
   - One `GET /registry.json` from the Hub's origin.
   - One `GET /rpc/get_meta` per data-node, cross-origin, returning 200 with `playground_count` + `bbox` + completeness fields.
   - On the first moveend, either `GET /rpc/get_playground_clusters?...` (cluster tier, zoom ≤ 13) or `GET /rpc/get_playgrounds_bbox?...` (polygon tier, zoom ≥ 14) per data-node whose bbox intersects the viewport. A data-node whose bbox sits entirely outside the viewport receives no request — that's the bbox router (see the federation reference's [Scale and clustering](../reference/federation.md#scale-and-clustering) section) doing its job, not a bug.
   - At zoom ≤ 5 (continental view) you should see no per-playground requests at all — the country-level macro view renders entirely from the cached `get_meta` response. One ring per data-node.
4. Click the instance pill — the drawer lists both backends with their playground count. (A version badge renders only when a backend's `get_meta` exposes a `version` field, which the SQL function doesn't today, so the badge slot stays empty in current releases.)
5. Click a playground in each region — the selection panel opens with that region's data.

If any data-node request fails in DevTools, the instance drawer marks that backend red with the error message. Check the data-node's CORS headers (Step 1 verification) and that its URL in `registry.json` is reachable from the browser, not only from the Hub host.

## Running Hub and backend on the same host

You can co-locate the Hub frontend and one or more data-nodes on a single machine. The Hub serves the map UI and `registry.json`; each data-node runs its own db + PostgREST stack. Typical use-case: a single operator hosting their own region while also aggregating it in a Hub.

### Topology

```
Same host, one Docker engine
├── spieli-hub        (DEPLOY_MODE=ui, APP_MODE=hub, APP_PORT=8080)
│     └── app  →  serves registry.json listing the data-node below
└── spieli-fulda      (DEPLOY_MODE=data-node-ui, APP_PORT=8081)
      ├── db
      ├── postgrest
      └── app  →  nginx at :8081, exposes /api/ with CORS
```

Each stack is a separate Compose project (`COMPOSE_PROJECT_NAME`) so port bindings and Docker resource names don't collide.

### Step 1 — Stand up the data-node

Follow [Step 1](#step-1--stand-up-each-data-node) from the main walkthrough. Give it a distinct port and project name:

```env
# .env for the data-node stack
COMPOSE_PROJECT_NAME=spieli-fulda
DEPLOY_MODE=data-node-ui
APP_PORT=8081
OSM_RELATION_ID=454863
PBF_URL=https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf
POSTGRES_PASSWORD=<strong-random-password>
```

```bash
docker compose --profile data-node-ui up -d
docker compose --profile data-node-ui run --rm importer
```

### Step 2 — Prepare `registry.json` for the Hub

The data-node's `/api/` is only reachable within the Docker host at `http://localhost:8081/api`. From a browser over HTTPS the Hub must refer to the public URL:

```json
{
  "instances": [
    {
      "slug": "fulda",
      "url":  "https://your-domain.example.com/fulda/api",
      "name": "Fulda"
    }
  ]
}
```

Route `/fulda/api` to `localhost:8081/api` with your reverse proxy (Traefik or nginx). The data-node's nginx already adds CORS headers, so no extra proxy config is needed for those.

If the Hub itself is at the same domain, a relative URL in `registry.json` also works:

```json
{ "instances": [{ "slug": "fulda", "url": "/fulda/api", "name": "Fulda" }] }
```

### Step 3 — Stand up the Hub

```env
# .env for the Hub stack
COMPOSE_PROJECT_NAME=spieli-hub
DEPLOY_MODE=ui
APP_MODE=hub
REGISTRY_URL=/registry.json
APP_PORT=8080
```

Create `compose.override.yml` with the bind-mount (see [Replace the bundled registry.json](#replace-the-bundled-registryjson-required)), place your `registry.json` next to `compose.yml`, then start:

```bash
docker compose --profile ui up -d
```

To update `registry.json` later (add/remove a data-node), edit the file and restart only the app container — no rebuild needed:

```bash
docker compose --profile ui restart app
```

### Port layout example

| Stack | `APP_PORT` | Public URL (via reverse proxy) |
|---|---|---|
| Hub | 8080 | `https://your-domain.example.com/` |
| Fulda data-node | 8081 | `https://your-domain.example.com/fulda/api` |

## See also

- [`registry.json` reference](../reference/registry-json.md) — full schema, slug rules, derived behaviours.
- [Federation](../reference/federation.md) — conceptual overview of Hub mode and federation endpoints.
- [Configuration](configuration.md) — full variables table including `REGISTRY_URL` and `HUB_POLL_INTERVAL`.
- [Architecture](../reference/architecture.md) — the `DEPLOY_MODE` × `APP_MODE` matrix that makes the legal combinations explicit.
