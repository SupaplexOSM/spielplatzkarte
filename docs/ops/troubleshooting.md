# Troubleshooting

## Port 8080 is already in use

**Symptom:** `docker compose up` fails with `address already in use` or `port is already allocated`.

**Fix:** Stop whatever is using port 8080, or change the port in `.env`:

```env
APP_PORT=8081
```

Then restart the stack:

```bash
docker compose -f compose.yml --profile <mode> up -d
```

---

## Import exits immediately or fails with a database error

**Symptom:** The import finishes in seconds (normally takes minutes), or you see a `connection refused` or `role does not exist` error.

**Fix:** The database must be running before you import. Start the stack first and confirm all containers are healthy:

```bash
docker compose ps   # all containers should show "running" or "healthy"
# then run the importer — replace <mode> with your DEPLOY_MODE (data-node or data-node-ui)
docker compose --profile <mode> run --rm importer
```

If you are using the local development setup, `make import` is equivalent. If the database shows as unhealthy, try stopping and restarting the stack.

---

## Map loads but shows no playgrounds

**Symptom:** Map tiles appear (streets and buildings visible) but no playground polygons are drawn, or the detail panel is empty.

**Possible causes:**

1. **Import not run** — Run the importer after starting the stack. Playground data is not loaded automatically:
   ```bash
   docker compose --profile <mode> run --rm importer
   ```
2. **Wrong relation ID** — Check `OSM_RELATION_ID` in `.env`. An incorrect ID filters out all playgrounds. Verify at [nominatim.openstreetmap.org](https://nominatim.openstreetmap.org).
3. **PBF doesn't cover the relation** — The PBF extract must geographically contain the relation. If `OSM_RELATION_ID` is a large region (e.g. a whole state), the `PBF_URL` must point to a matching extract — a district or city PBF will silently produce 0 playgrounds. Check [download.geofabrik.de](https://download.geofabrik.de) for the right extract.
4. **Docker stack not running** — The app requires a live PostgREST backend. Confirm the stack is running and healthy (`docker compose ps`).
5. **Browser cache** — Try a hard reload: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac).

---

## Geolocation button does nothing on mobile

**Symptom:** Tapping the location button on a phone browser has no effect — no movement, no error.

**Cause:** Browsers block the geolocation API on plain HTTP connections (including local IPs like `http://192.168.1.42:8080`). This is a browser security policy and cannot be overridden in the app.

**Fix options:**

- Test geolocation on the **production HTTPS URL**.
- On Android with **Chrome**: go to `chrome://flags`, search for "Insecure origins treated as secure", add your local URL, and relaunch Chrome.
- DuckDuckGo and Brave do not offer this workaround — use Chrome for local geolocation testing.

---

## Dev server starts but changes don't appear

!!! note "Source-clone / local dev only"
    This section applies when running the Vite dev server (`make dev`) from a source clone. Skip if using pre-built images.

**Symptom:** You edited a JS or CSS file, but the browser still shows the old version.

**Fix:** Vite hot-reload should pick up changes automatically. If it doesn't:

1. Check the terminal running `make dev` — a build error will prevent the browser from updating.
2. Try a hard reload: `Ctrl+Shift+R` / `Cmd+Shift+R`.
3. If you changed `index.html` or a file in `public/`, stop and restart `make dev`.

When testing against the Docker stack, rebuild and restart the app container after changes:

```bash
docker compose -f compose.yml --profile <mode> up -d --build app
```

---

## LAN IP for mobile testing

!!! note "Source-clone / local dev only"
    `make lan-url` is only available from a source clone. Skip if using pre-built images.

Run this command to find your LAN IP:

```bash
ip route get 1 | awk '{print $7; exit}'
```

Then open `http://<that-ip>:8080` on your phone.

---

## PostgREST returns 404 or connection refused on `/api/`

**Symptom:** The app loads but every API call fails with "Failed to fetch" or the network tab shows 502/404 on `/api/rpc/*`.

**Possible causes:**

1. **PostgREST container not running** — Check `docker compose ps`. The `postgrest` service should be running and healthy.
2. **Database not ready** — PostgREST starts before PostgreSQL finishes initialising on first launch. It retries automatically, but a `docker compose restart postgrest` usually resolves it.
3. **Schema cache stale** — After applying schema changes, PostgREST needs a schema reload. The importer sends `NOTIFY pgrst, 'reload schema'` automatically, but if that notification was missed, restart PostgREST: `docker compose restart postgrest`.
4. **`web_anon` role missing** — `db/init.sql` creates this role on first init. If you deleted and recreated the `pgdata` volume without re-running init.sql (e.g. by running `docker volume rm` but not recreating via `docker compose up`), the role is missing. Run `docker compose up -d` to let init.sql re-run, or run it manually.

---

## Import fails partway through with a PBF error

**Symptom:** The importer exits with `osmium` or `osm2pgsql` reporting a corrupt or truncated file.

**Fix:** The cached PBF may be corrupt (interrupted download). Delete the cached files and re-run:

```bash
docker compose run --rm importer sh -c "rm -f /data/*.pbf"
docker compose --profile data-node-ui run --rm importer
```

The importer validates the source PBF with `osmium fileinfo` before using it and will re-download a corrupt file automatically. If the re-download fails, check `PBF_URL` in `.env` — make sure the URL is reachable and returns a valid PBF.

---

## Hub shows all backends as red / unreachable

**Symptom:** The instance drawer shows every data-node with a red indicator.

**Possible causes:**

1. **CORS not configured** — The Hub's browser must be able to reach each data-node's `/api/` cross-origin over HTTPS. Verify with:
   ```bash
   curl -I https://your-data-node.example.com/api/rpc/get_meta
   # must include: Access-Control-Allow-Origin: *
   ```
2. **registry.json not updated** — The Hub still has the bundled dev `registry.json` pointing at `/api` and `/api2`. See [Federated Deployment](federated-deployment.md#step-3-stand-up-the-hub) for how to replace it.
3. **Data-node not reachable from browser** — The Hub serves the app; the Hub's *browser* must reach each data-node, not the Hub host. Test from a browser (not the server) by opening each data-node's `https://…/api/rpc/get_meta` URL directly.
4. **Hub cron not running** — Check `federation-status.json`: if `generated_at` is older than 5 minutes, the cron job inside the hub container has stopped. Restart the hub container: `docker compose --profile ui restart app`.

---

## Hub shows a backend as reachable but with 0 playgrounds

**Symptom:** A data-node appears in the Hub instance drawer with a green or yellow indicator, but its playground count is 0 and no playgrounds are drawn from that backend.

**Hub operator — diagnose remotely:**

```bash
curl https://the-data-node.example.com/api/rpc/get_meta
```

If `playground_count` is `0` and `bbox` is `[null,null,null,null]`, the database has no playground data. Pass the findings to the data-node operator.

If `playground_count` is `> 0` and `bbox` contains real coordinates, the data-node is healthy. The hub has stale cached state — see **Hub operator** below.

**Hub operator — stale cached state (`playground_count > 0`, valid `bbox`):**

The hub polls each backend's `get_meta` at startup and every 5 minutes. If the last poll hit the backend while it was mid-import, restarting, or transiently unreachable, the hub cached `bbox: null` and `playgroundCount: 0`. With `bbox: null` the hub's viewport router silently excludes the backend from every map query.

1. **Reload the hub page** in the browser. This triggers an immediate re-poll of every backend's `get_meta`. If playgrounds appear after reload, the cache was stale and self-healed.

2. **Check whether the hub health poller marked the backend down.** The hub container runs a 60-second cron that writes `federation-status.json`; backends that exceed the 3-second curl timeout are marked `up: false` and the hub orchestrator skips them even when `get_meta` succeeds from the browser:

   ```bash
   curl https://your-hub.example.com/federation-status.json \
     | jq '.backends | to_entries[] | select(.value.up == false) | .key'
   ```

   If the backend slug appears, it is being skipped by the orchestrator. Check whether the backend is slow to respond:

   ```bash
   curl -w '%{time_total}s\n' -o /dev/null -sf \
     https://the-data-node.example.com/api/rpc/get_meta
   ```

   Response times consistently above 3 seconds will flip `up: false` on the next hub poll cycle. Investigate slow PostgREST response times on the data-node side (see [Map loads but shows no playgrounds](#map-loads-but-shows-no-playgrounds) for database health checks). If the latency is transient, the hub auto-recovers within 60 seconds once the backend is fast again. If the hub container is stuck showing a backend as down despite it being healthy, restart it:

   ```bash
   docker compose restart app   # run on the hub host
   ```

**Data-node operator — possible causes:**

1. **Import not run** — The stack started but the importer was never triggered:
   ```bash
   cd ~/spieli   # or wherever spieli was installed
   docker compose --profile data-node run --rm importer
   # or watch daemon logs if auto-update is enabled:
   docker compose logs -f importer
   ```
2. **PBF doesn't cover the relation** — See [Map loads but shows no playgrounds](#map-loads-but-shows-no-playgrounds), cause 3.
3. **Outdated image** — See [Hub backend returns "function not found" errors](#hub-backend-returns-function-not-found-errors).
4. **Daemon importer sleeping after a failed/corrupt previous run** — If the importer ran but was OOM-killed during preprocessing, osm2pgsql may have ingested a partial file and recorded a successful `last_import_at`. The daemon will not retry until the next scheduled interval. Force an immediate one-shot reimport:
   ```bash
   # Clear any stale cached PBF files left by the killed run
   docker compose run --rm importer sh -c "rm -f /data/*.pbf"
   # Run a one-shot reimport regardless of last_import_at
   docker compose run --rm \
     -e REIMPORT_INTERVAL_MIN_DAYS= \
     -e REIMPORT_INTERVAL_MAX_DAYS= \
     importer
   ```
   Unsetting both interval variables forces one-shot mode, bypassing the grace check.

---

## Hub backend returns "function not found" errors

**Symptom:** The hub operator checks the data-node API and gets:

```json
{"code":"PGRST202","message":"Could not find the function api.get_playgrounds_bbox(bbox) in the schema cache."}
```

The Hub shows 0 playgrounds for that backend.

**Hub operator — diagnose remotely:**

```bash
curl https://the-data-node.example.com/api/rpc/get_meta
# check "version" — if older than v0.4.9, the image needs updating
```

**Data-node operator — fix:**

The image predates the tiered-fetch functions added in v0.4.9. Update and re-import:

```bash
cd ~/spieli   # or wherever spieli was installed
docker compose pull
docker compose --profile data-node down
docker compose --profile data-node up -d
docker compose --profile data-node run --rm importer
```

**Hub operator — verify after the data-node operator confirms the update:**

```bash
curl https://the-data-node.example.com/api/rpc/get_meta
# playground_count should now be > 0
```

---

## Importer fails with "permission denied" on schema apply

**Symptom:** `psql` reports `permission denied` when the importer runs `api.sql`.

**Cause:** The SQL runs as the database user configured in `.env`. This user needs `SUPERUSER` or at minimum `pg_signal_backend` (to terminate PostgREST connections) and `CREATE` on the `public` schema. The default user (`osm`) is a superuser — if you changed `POSTGRES_USER`, verify the role has these privileges.

**Fix:**

```bash
docker compose -f compose.yml exec db psql -U osm osm
# in psql:
ALTER ROLE your_user SUPERUSER;
\q
```

Then re-run the importer:

```bash
docker compose -f compose.yml --profile <mode> run --rm importer
```

---

## Database volume is very large after repeated imports

**Symptom:** The `pgdata` Docker volume grows beyond expectations over time.

**Cause:** `api.sql` uses `DROP MATERIALIZED VIEW … CASCADE` + `CREATE MATERIALIZED VIEW` on every apply. PostgreSQL does not reclaim the space immediately — it marks pages as dead and waits for autovacuum. After many re-imports, dead tuple bloat can be significant.

**Fix:** Run VACUUM FULL (briefly locks the table):

```bash
docker compose -f compose.yml exec db psql -U osm osm -c "VACUUM FULL public.playground_stats;"
```

Or simply recreate the data volume after a re-import — the volume will start clean.

---

## Hub drawer shows "updating" badge that never clears

**Symptom:** One or more backends in the Hub instance drawer permanently show an "updating" badge, even though no import is running.

**Cause:** The `importing` flag in `api.import_status` was left `true` by an importer that was killed with SIGKILL (bypasses the EXIT trap) or crashed before the trap could fire.

**Self-healing:** The importer clears the flag automatically at startup. Restarting the container is usually enough:

```bash
docker compose restart importer
# or, in daemon mode, the container is already running — it will clear the flag
# on its next scheduled run
```

**Manual fix** (if you need it cleared immediately without waiting for a restart):

```bash
# From the data-node host
docker compose exec db psql -U osm -d osm \
  -c "UPDATE api.import_status SET importing = false WHERE id = 1;"
```

The Hub will pick up the corrected value on its next poll cycle (within 60 seconds).

---

### Legal pages missing or showing wrong contact details

**Symptom:** `/impressum` or `/datenschutz` returns 404, or the pages show stale contact information after updating `IMPRESSUM_*` vars.

**Cause:** The HTML files are generated by `docker-entrypoint.sh` at container startup. A rebuild is required to pick up changed env vars.

**Fix:** Restart the app container to regenerate legal pages from current env vars:

```bash
docker compose -f compose.yml --profile <mode> up -d app
```

If `get_meta()` still returns the old `impressum_url` / `privacy_url`, the legal URLs are baked into the database at import time. Re-run the importer to apply them:

```bash
docker compose -f compose.yml --profile <mode> run --rm importer
```

**Symptom:** `/impressum` returns 404 despite `IMPRESSUM_NAME` being set.

**Cause:** `IMPRESSUM_ADDRESS` is also required. The entrypoint skips generation when either of the two required vars is empty.

**Fix:** Set both `IMPRESSUM_NAME` and `IMPRESSUM_ADDRESS` in `.env`, then `make docker-build`.

---

**Symptom:** PostgREST logs `relation "public.playground_stats" does not exist` after an upgrade.

**Cause:** The `API_ONLY=1` importer run dropped the `playground_stats` materialised view but failed before recreating it, leaving the database in a broken state.

**Fix:** Run a full re-import to rebuild everything from scratch:

```bash
docker compose -f compose.yml --profile <mode> run --rm importer
```

This re-applies `api.sql` (recreating `playground_stats`) and re-imports OSM data. It takes longer than `API_ONLY=1` but is always safe.
