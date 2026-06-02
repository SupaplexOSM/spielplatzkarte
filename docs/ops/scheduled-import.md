# Scheduled Import

Geofabrik publishes updated OSM extracts daily. Running the importer on a schedule keeps your playground data fresh without manual intervention.

## Daemon mode (recommended)

!!! note "Terminology"
    "Daemon mode" here refers to the importer container's **scheduling behaviour** — whether it loops and re-imports automatically or exits after one run. This is separate from `DEPLOY_MODE` (which services start) and `APP_MODE` (standalone vs hub frontend).

The importer container has a built-in daemon mode: set `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` in `.env` and the container loops forever, re-importing at a random interval within that range. No host cron, no systemd unit — the container manages its own schedule.

```env
REIMPORT_INTERVAL_MIN_DAYS=6
REIMPORT_INTERVAL_MAX_DAYS=8
```

A random interval in `[MIN, MAX]` days is chosen after each successful import, spreading load across operators who deploy at similar times. When the importer container restarts (e.g. after a Watchtower image update), it checks the last import timestamp in the database — if a recent import is on record, it sleeps the remaining interval rather than re-importing immediately.

!!! note "When both vars are unset (default)"
    The importer runs once and exits (one-shot mode). Use this when you manage scheduling externally (systemd, cron).

### Enabling daemon mode

Add the two vars to `.env`:

```env
REIMPORT_INTERVAL_MIN_DAYS=6
REIMPORT_INTERVAL_MAX_DAYS=8
```

Then restart the importer so it picks up the new env:

```bash
docker compose --profile data-node-ui restart importer
```

Check that it entered daemon mode:

```bash
docker compose logs importer | grep -i daemon
# [importer] Daemon mode: interval 6–8 days.
```

## Automatic image updates with Watchtower

Watchtower complements daemon mode: it pulls updated spieli images daily and restarts the affected containers. The importer's startup grace check (see above) prevents an unplanned re-import on Watchtower-triggered restarts.

Enable Watchtower by including the `auto-update` profile:

```bash
docker compose --profile data-node-ui --profile auto-update up -d
```

Or add `auto-update` to any existing `up` invocation. Watchtower polls Docker Hub every 24 hours and cleans up old images automatically.

## How long does an import take?

| Scenario | Typical duration |
|---|---|
| First run, PBF not cached | download time + 2–5 min |
| First run, PBF cached | 2–5 min |
| Re-run, Geofabrik has a newer extract | download time + 2–5 min |
| Re-run, Geofabrik extract unchanged | 30–60 s for small regions; 30+ min for large (e.g. all of Germany) |

The source PBF is checked against Geofabrik on every run using HTTP `If-Modified-Since`. When no newer extract is available the download is skipped and the existing bbox and tag-filtered caches are reused — only the final osm2pgsql + api.sql step runs.

## How fresh is the data?

Geofabrik refreshes most regional extracts daily. The importer stores two timestamps in the database:

- **`last_import_at`** — when the importer script ran (visible via `GET /api/rpc/get_meta`)
- **`osm_data_timestamp`** — the `osmosis_replication_timestamp` header from the source PBF, which reflects when Geofabrik generated that extract (can be up to a week old for less-trafficked regions)

Both are surfaced in [Monitoring → `/federation-status.json`](monitoring.md).

## Without daemon mode (host-managed scheduling)

If you prefer external scheduling, leave `REIMPORT_INTERVAL_MIN_DAYS` and `REIMPORT_INTERVAL_MAX_DAYS` unset. The importer exits with code 0 after a successful one-shot run.

### systemd timer

spieli ships unit files in `deploy/` for Linux hosts with systemd:

```bash
sudo cp deploy/spieli-import.service /etc/systemd/system/
sudo cp deploy/spieli-import.timer   /etc/systemd/system/
```

Open `/etc/systemd/system/spieli-import.service` and set:

- `WorkingDirectory=` — directory where `compose.yml` and `.env` live (e.g. `/opt/spieli`)
- `EnvironmentFile=` — path to `.env` (usually `WorkingDirectory/.env`)
- `User=` — user in the `docker` group that owns the deployment directory

The default timer fires weekly on Sunday at 04:00. Change the schedule in `spieli-import.timer`:

```ini
[Timer]
OnCalendar=Sun 04:00      # weekly, Sunday 4 AM
# OnCalendar=daily         # every day at midnight
# OnCalendar=*-*-* 03:30  # every day at 3:30 AM
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spieli-import.timer
systemctl list-timers spieli-import.timer
```

### Host cron

```cron
0 4 * * 0 cd /opt/spieli && docker compose --profile data-node-ui run --rm importer >> /var/log/spieli-import.log 2>&1
```

## See also

- [Refresh Data](refresh-data.md) — trigger an immediate re-import outside of the schedule
- [Monitoring](monitoring.md) — observe import freshness via federation-status and Prometheus
- [Backup and Restore](backup-restore.md) — database backups before major import runs
- [Configuration reference](configuration.md) — `OSM_RELATION_ID`, `PBF_URL`, `OSM2PGSQL_THREADS`, `REIMPORT_INTERVAL_MIN_DAYS`, `REIMPORT_INTERVAL_MAX_DAYS`
