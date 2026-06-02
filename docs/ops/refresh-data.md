# Refreshing OSM Data On Demand

Geofabrik publishes updated OSM extracts daily. The importer pulls the latest extract, filters it to your region, and loads it into the database. This page explains how to trigger that process right now, outside of any automated schedule.

For setting up automatic re-imports, see [Scheduled Import](scheduled-import.md).

## Before you start: know your setup

Check which import mode the installer configured. Run from your deployment directory (where `compose.yml` and `.env` live):

```bash
grep REIMPORT_INTERVAL .env
```

| Result | Mode |
|---|---|
| Both vars absent or empty | **One-shot** — importer runs once and exits |
| Both vars set (e.g. `MIN=2`, `MAX=10`) | **Daemon** — importer loops; different steps apply |

Check your `DEPLOY_MODE` too — you need it for the `--profile` flag:

```bash
grep DEPLOY_MODE .env
```

Valid values: `data-node`, `data-node-ui`. (Hub-only deployments — `DEPLOY_MODE=ui` — have no database and no importer.)

## One-shot mode

Run the importer once from your deployment directory. It exits when done.

```bash
docker compose --profile data-node-ui run --rm importer
```

Replace `data-node-ui` with your `DEPLOY_MODE` value.

## Daemon mode

When `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` are set, the importer container runs in a loop. On startup it checks `last_import_at` in the database — if the last import was recent (within a randomly chosen interval), it sleeps until the next scheduled time rather than importing again.

This means **restarting the container does not force an immediate re-import** unless the data is already overdue.

To force a re-import right now:

**Step 1 — Stop the running daemon** (from your deployment directory):

```bash
docker compose stop importer
```

**Step 2 — Run a one-shot import (interval vars unset inline):**

```bash
docker compose run --rm \
  -e REIMPORT_INTERVAL_MIN_DAYS= \
  -e REIMPORT_INTERVAL_MAX_DAYS= \
  importer
```

Unsetting the vars inline overrides `.env` without editing the file. The container runs once and exits.

**Step 3 — Resume the daemon:**

```bash
docker compose up -d importer
```

The daemon restarts, sees the fresh `last_import_at`, and sleeps for the next scheduled interval.

## Verify the import ran

```bash
curl -s http://localhost:8080/api/rpc/get_meta | python3 -m json.tool | grep last_import_at
```

Or from outside the host:

```bash
curl -s https://your-domain.example.com/api/rpc/get_meta | python3 -m json.tool | grep last_import_at
```

`last_import_at` is the timestamp of when the importer script ran. `osm_data_timestamp` reflects when Geofabrik generated the extract (can be up to a day behind).

## How long does it take?

See the timing table in [Scheduled Import → How long does an import take?](scheduled-import.md#how-long-does-an-import-take)

For most small regions, subsequent imports complete in under a minute once the PBF is cached.

## See also

- [Scheduled Import](scheduled-import.md) — set up automatic re-imports with daemon mode or a systemd timer
- [Monitoring](monitoring.md) — track import freshness via `federation-status.json` and Prometheus
- [Upgrading](upgrade.md) — re-importing after a spieli version upgrade
