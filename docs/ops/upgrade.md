# Upgrading spieli

## Before you upgrade

Check [GitHub Releases](https://github.com/mfuhrmann/spieli/releases) for the latest version and scan the release notes for **breaking labels**. Most releases carry none and require no manual action.

| Label | What it means | What you must do |
|---|---|---|
| `requires-env-update` | New or removed env var | Update `.env` **before** pulling the new image |
| `requires-compose-update` | `compose.yml` changed structurally | Re-run `install.sh` or update `compose.yml` manually **before** restarting |
| `requires-reimport` | OSM data model changed | Trigger a full re-import **after** the image update lands |
| `requires-schema-update` | `api.sql` changed | Covered automatically — no extra step needed |

To check what version is currently running:

```bash
docker inspect spieli-app-1 --format '{{index .Config.Labels "org.opencontainers.image.version"}}'
# or
docker compose images
```

---

## Automatic upgrade (Watchtower)

If you installed with the `auto-update` profile active, Watchtower handles standard releases with no manual intervention:

- New image published → Watchtower pulls and restarts `app` and `importer`.
- The daemon importer applies `api.sql` on every container startup, so schema changes take effect immediately after the restart — no separate `API_ONLY=1` step needed.

**Standard releases (no breaking labels): nothing to do.** Wait for Watchtower to pick up the new image (default poll interval: 5 minutes).

For **breaking-label releases**, follow the [Breaking label procedures](#breaking-label-procedures) below in addition to the Watchtower restart.

!!! note "One Watchtower covers all containers"
    Only the hub stack (or your single standalone stack) should run `--profile auto-update`. Adding a second Watchtower to any data-node stack causes both instances to fight over the same containers. The single Watchtower instance watches all containers on the Docker host automatically, including any data-node stacks that don't run `auto-update` themselves.

---

## Manual upgrade

Use manual steps when you don't run Watchtower, or when a breaking label requires a specific action sequence.

### Hub (DEPLOY_MODE=ui)

The hub has no database and no importer — only the app container needs updating.

```bash
cd /path/to/your/spieli-hub

docker compose pull
docker compose --profile ui up -d app
```

Done. No `API_ONLY=1`, no importer, no verify step needed.

### Standalone or Data-node (DEPLOY_MODE=data-node-ui or data-node)

Replace `<mode>` with your `DEPLOY_MODE` and `<port>` with your `APP_PORT`.

**Step 1 — Pull new images**

```bash
docker compose pull
```

**Step 2 — Restart the app container**

```bash
docker compose --profile <mode> up -d app
```

**Step 3 — Apply schema changes (API_ONLY)**

```bash
docker compose --profile <mode> run --rm -e API_ONLY=1 importer
```

This updates all PostgREST functions and the version number reported by `get_meta`. It runs as a one-shot container — the daemon importer is not affected.

!!! warning "Run API_ONLY=1 before restarting the daemon"
    The daemon importer also applies `api.sql` on container startup. If you restart the daemon and then immediately run `API_ONLY=1`, both processes race on the `DROP`/`CREATE` of the `playground_stats` materialized view. On large datasets this reliably causes `ERROR: relation "public.playground_stats" does not exist`. Always complete step 3 and verify (step 4) before starting the daemon (step 5).

!!! warning "If API_ONLY=1 fails mid-run"
    `API_ONLY=1` drops and recreates `playground_stats`. A crash partway through leaves the view gone and PostgREST will log `relation "public.playground_stats" does not exist`. Recovery: run a full re-import — it recreates everything from scratch.

**Step 4 — Verify**

```bash
curl -sf http://localhost:<port>/api/rpc/get_meta | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('version:', d['version'], ' playgrounds:', d['playground_count'])"
```

Both `version` and `playground_count` should be non-zero. If `playground_count` is 0, see [If playground_count is zero after upgrade](#if-playground_count-is-zero-after-upgrade) below.

**Step 5 — Restart the daemon importer on the new image**

```bash
docker compose --profile <mode> up -d importer
```

---

## Breaking label procedures

### requires-env-update

1. Read the release notes to find the new or removed variable.
2. Update `.env` accordingly.
3. Then proceed with the normal upgrade steps for your deployment type.

### requires-compose-update

`compose.yml` has structural changes (new service, renamed service, removed volume).

```bash
# Download the updated file:
curl -O https://raw.githubusercontent.com/mfuhrmann/spieli/main/compose.yml

# Recreate the stack:
docker compose --profile <mode> down
docker compose --profile <mode> up -d
```

Or re-run `install.sh` — it re-downloads and applies `compose.yml` automatically.

### requires-reimport

A new OSM tag type was added. Existing data doesn't have the new columns until a fresh import.

After the image update (Watchtower or manual steps 1–2):

```bash
# Full re-import — also applies api.sql, so no separate API_ONLY step needed
docker compose --profile <mode> run --rm importer
```

This takes several minutes for large regions. The separate `API_ONLY=1` step is not needed — a full re-import also updates all schema functions.

---

## Single-host federation (multiple stacks on one VPS)

When the hub and its data-nodes share a single VPS, use `scripts/upgrade-stacks.sh`. It handles the correct order (data-nodes first, hub last) and runs each stack sequentially to avoid OOM from concurrent importer runs.

Copy the script to the VPS once, then edit the `STACKS` array to match your port layout:

```bash
scp scripts/upgrade-stacks.sh user@vps:~/upgrade-stacks.sh
```

```bash
STACKS=(
  "$HOME/spieli-hessen:data-node-ui:8081"
  "$HOME/spieli-berlin:data-node-ui:8082"
  "$HOME/spieli:ui auto-update:8080"   # hub last
)
```

Run:

```bash
bash ~/upgrade-stacks.sh
```

The script pulls images, restarts each app container, runs `API_ONLY=1` for data-nodes, verifies `get_meta`, restarts the daemon importer, and moves to the next stack. The hub entry skips the importer steps automatically.

!!! note "Watchtower and the single-VPS setup"
    On a single-VPS federation, only the hub stack runs `--profile auto-update`. The single Watchtower instance restarts all containers on the host, including data-node containers — their stacks don't need their own `auto-update` profile.

---

## Special cases

### If playground_count is zero after upgrade

`get_meta` returns `playground_count: 0` after an upgrade when `playground_stats` was left in a broken state (see the API_ONLY race warning above), or when the database volume was wiped.

Recovery: run a full re-import.

```bash
docker compose --profile <mode> run --rm \
  -e REIMPORT_INTERVAL_MIN_DAYS= \
  -e REIMPORT_INTERVAL_MAX_DAYS= \
  importer
```

The empty `REIMPORT_INTERVAL_*` overrides force the importer to run immediately regardless of when data was last imported.

### If you deleted the database volume

`docker compose down -v` or `docker volume rm <stack>_pgdata` wipes all imported data. Before re-importing:

1. Check whether the PBF cache volume survived:

    ```bash
    docker volume ls | grep pbf_cache
    ```

2. If it exists, clear it — a previously interrupted import may have left a corrupt filtered PBF. The importer checks timestamps but not content; a corrupt cache causes it to process 0 objects and leave the database silently empty.

    ```bash
    docker volume rm <stack>_pbf_cache
    ```

3. Run a full re-import:

    ```bash
    docker compose --profile <mode> run --rm importer
    ```

4. Verify with `get_meta` as shown in the manual upgrade section.

### Downgrading

Supported only within the same minor version. Pin a specific version by editing `compose.yml`:

```yaml
# Change :latest to the version you want:
image: ghcr.io/mfuhrmann/spieli:0.4.0
```

```bash
docker compose pull
docker compose --profile <mode> up -d
```

The database schema is not automatically rolled back. If the new version added columns or functions, the older app typically ignores them — but this is not tested. When in doubt, re-import from scratch.

---

## See also

- [Configuration reference](configuration.md) — check for new or changed variables before upgrading
- [Troubleshooting](troubleshooting.md) — common post-upgrade issues
- [Single-host Federation](single-host-federation.md) — multi-stack setup and the upgrade script
- [RELEASING.md](https://github.com/mfuhrmann/spieli/blob/main/RELEASING.md) — how releases are cut (maintainer reference)
