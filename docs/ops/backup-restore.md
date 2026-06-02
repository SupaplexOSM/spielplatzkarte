# Backup and Restore

The only persistent state in spieli is the PostgreSQL database. All other data can be regenerated from the OSM PBF file.

## What to back up

| Data | Location | Backup needed? |
|---|---|---|
| OSM playground data | `pgdata` Docker volume | Optional — re-importable from PBF |
| PBF cache | `pbf_cache` Docker volume | Optional — re-downloadable from Geofabrik |
| Configuration | `.env` file | **Yes** — contains your passwords and settings |
| Custom `registry.json` | your deployment directory | **Yes** (if Hub mode) |

The most important thing to back up is your `.env` file. The database can always be rebuilt from the Geofabrik PBF — a full import takes 2–5 minutes. A lost `.env` means a lost `POSTGRES_PASSWORD` and requires recreating the stack from scratch.

## Back up the database

For a hot backup (database running):

```bash
docker compose exec db pg_dump -U osm osm | gzip > spieli-backup-$(date +%Y%m%d).sql.gz
```

For a cold backup (database stopped), or to back up the raw volume:

```bash
docker compose --profile data-node-ui stop db

# Copy the volume to a compressed tar
docker run --rm \
  -v spieli_pgdata:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/pgdata-$(date +%Y%m%d).tar.gz -C /data .

docker compose --profile data-node-ui start db
```

Replace `spieli_pgdata` with the actual volume name (`docker volume ls` to find it; typically `<project-name>_pgdata`).

## Restore the database

From a `pg_dump` backup:

```bash
# Stop the stack, recreate the DB volume, then restore
docker compose --profile data-node-ui down
docker volume rm spieli_pgdata       # ⚠️ destroys all data — only run if you have a backup!
docker compose --profile data-node-ui up -d db

# Wait for the DB to initialise (watch `docker compose logs -f db`)

# Restore
gunzip -c spieli-backup-20260501.sql.gz | docker compose exec -T db psql -U osm osm

# Apply the API schema (recreates PostgREST functions + materialised view)
docker compose --profile data-node-ui run --rm importer

# Restart the full stack
docker compose --profile data-node-ui up -d
```

## Re-import instead of restoring

Because the PBF is re-downloadable and imports are fast (~30 seconds when the PBF is cached), a re-import is often simpler than a full restore:

```bash
docker compose --profile data-node-ui down
docker volume rm spieli_pgdata      # clear the database
docker compose --profile data-node-ui up -d
docker compose --profile data-node-ui run --rm importer   # re-import from cached PBF
```

The PBF files are stored in the `pbf_cache` volume and are reused automatically. If you deleted the volume too, the importer downloads a fresh copy (~300 MB for a Bundesland extract).

## Scheduled backups

To schedule daily backups with cron (adjust paths to your deployment):

```cron
0 3 * * * cd /opt/spieli && docker compose exec -T db pg_dump -U osm osm | gzip > /opt/backups/spieli-$(date +\%Y\%m\%d).sql.gz && find /opt/backups -name 'spieli-*.sql.gz' -mtime +14 -delete
```

This dumps the database at 3 AM and deletes backups older than 14 days.

## See also

- [Configuration reference](configuration.md) — `POSTGRES_PASSWORD` and other variables to keep in your `.env` backup
- [Scheduled import](scheduled-import.md) — automating regular OSM data refreshes
