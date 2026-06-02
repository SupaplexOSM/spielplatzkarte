# Architecture

## Standalone mode (default)

One region, one database. `APP_MODE=standalone` (the default).

```
                  ┌─────────────────────────────────────────────────────┐
                  │                   Production                        │
                  │                                                     │
  Browser ──────► | nginx ──────► PostgREST ──────► PostgreSQL/PostGIS  │
  (your phone     | (serves        (turns SQL          (holds all the   │
   or laptop)     | the app,       functions into      OSM playground   │
                  | proxies API    HTTP endpoints)     data)            │
                  | requests)                                           │
                  └─────────────────────────────────────────────────────┘
```

Your browser loads the app from nginx. When it needs playground data, it calls `/api/`, which nginx forwards to PostgREST. PostgREST runs a SQL function in PostgreSQL and returns the results as JSON — no custom server code needed. The database was pre-loaded with OpenStreetMap data by the osm2pgsql importer (a one-time step you re-run whenever you want fresh data).

## Hub mode

Multiple regional instances aggregated onto one shared map. `APP_MODE=hub`.

```
                  ┌─ PostgREST A ──► PostgreSQL (region A) ─┐
  Browser ──► nginx                                          │ merged in browser
                  └─ PostgREST B ──► PostgreSQL (region B) ─┘
```

The Hub fetches playground data from every backend listed in `registry.json` and renders them on a shared map. The compose file ships a second backend (`db2` / `postgrest2`) at `/api2/` for local development. See [Federation](federation.md) for setup instructions.

## Local development

```
  Browser ──────► Vite dev server ──────► (hot-reload JS/CSS)
                                          ↓
                                   apiBaseUrl empty?
                                   ┌─────┴──────┐
                                  yes            no
                                   ↓              ↓
                               Overpass      PostgREST
                               (live OSM     (Docker stack
                                queries)      via make up)
```

During local development, the Vite dev server serves the JavaScript with instant hot-reload. By default (`apiBaseUrl` empty in `public/config.js`), the frontend fetches playground data directly from Overpass — no local database required. To test against the full PostgREST backend, start `make up` and set `apiBaseUrl` in `public/config.js`.

To test hub mode locally, see [Federation — Local hub development](federation.md#local-hub-development).

## Deployment modes

The compose file supports three profiles, selected at install time via `DEPLOY_MODE`:

| Mode | Services started | Use case |
|---|---|---|
| `data-node` | db, PostgREST, importer | Shared backend for multiple UI instances |
| `ui` | app (nginx) | Frontend connecting to a remote data node |
| `data-node-ui` | All of the above | Self-contained single-region deployment |

### `DEPLOY_MODE` × `APP_MODE` — legal combinations

`DEPLOY_MODE` picks which containers run. `APP_MODE` picks how the frontend behaves. They are orthogonal: one chooses *where* the code runs, the other chooses *what* the code does.

|                           | `APP_MODE=standalone`                                                                                 | `APP_MODE=hub`                                                                                                  |
|---------------------------|-------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `DEPLOY_MODE=data-node`   | N/A — no frontend, `APP_MODE` is ignored                                                              | N/A — no frontend                                                                                               |
| `DEPLOY_MODE=ui`          | Remote-frontend for one region (`API_BASE_URL` points at a remote `/api/` — that backend must enable [CORS](../ops/federated-deployment.md#expose-api-to-the-hub)) | **Hub only** — aggregates multiple remote data-nodes via `registry.json`                                    |
| `DEPLOY_MODE=data-node-ui`| **Standalone** — default single-region deployment. Add `PARENT_ORIGIN` to also register this instance as a backend in an external hub (**standalone + federated**). | **Hub + local backend** — hub UI co-located with a local data-node; `registry.json` lists `/api` plus any additional remote backends |

The installer guides all five scenarios. See [Federated Deployment](../ops/federated-deployment.md) for the hub topologies.

## Tiered playground delivery

The standalone client switches between two zoom-scoped layers at `clusterMaxZoom` (default 13). Below the boundary it calls `get_playground_clusters(z, bbox)` for pre-aggregated count buckets; above it, `get_playgrounds_bbox(bbox)` for full polygons. The cluster RPC keeps two concerns deliberately separate: **grouping** is grid-based — each playground centroid is snapped to a zoom-dependent cell that decides which features share a bucket — while **position** is the unweighted spatial mean of the bucket's member centroids, so the rendered dot tracks the geography of its members rather than the lattice.

In hub mode (see [Federation](federation.md)) the per-backend buckets are reduced client-side by Supercluster, which builds a kd-tree on the points' `(lon, lat)` and merges within a zoom-dependent radius — the merge target is **proximity**, not the grouping cell. Pre-2026, two backends contributing to the same cell shipped identical grid-anchor coordinates and Supercluster collapsed them trivially. With member-centroid positioning, two backends contributing to the same cell ship near-but-distinct points; whether they collapse depends on Supercluster's radius at the active zoom. The known interim consequence is that toggling a backend can shift the dot for a shared cell between the two backends' centroids — a residual jitter the user sees as movement, not as wrong data, since both positions sit inside the cluster's footprint. A follow-up to compute count-weighted means across backends in the hub merger is tracked but out of scope for the position-clusters change.

See [API reference — `get_playground_clusters`](api.md#get_playground_clustersz-bbox) for the response shape.

## See also

- [API reference](api.md) — request/response shapes for the tiered playground RPCs that drive the standalone map.

## Key source directories

| Path | Role |
|---|---|
| `app/src/` | Svelte 5 frontend components and modules |
| `importer/` | osm2pgsql Lua rules and PostgREST API SQL (`api.sql`) |
| `db/` | PostgreSQL schema initialisation |
| `oci/` | Docker build contexts |
| `processing/` | OSM data pipeline scripts used during import |
