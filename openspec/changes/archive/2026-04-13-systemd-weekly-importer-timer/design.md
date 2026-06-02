## Context

spieli uses `docker compose run --rm importer` (wrapped as `make import`) to download a PBF file and load OSM data into PostGIS. This is a one-shot operation with no scheduling built in. On a typical Linux server deployment, systemd is the standard init and scheduling system. A service + timer unit pair is the idiomatic way to run recurring Docker Compose tasks on such systems.

## Goals / Non-Goals

**Goals:**
- Provide ready-to-use `spieli-import.service` and `spieli-import.timer` unit files under `deploy/`
- Fire the importer once a week; catch missed runs on next boot (`Persistent=true`)
- Pick up project path and credentials from the deployed `.env` file — no hardcoded values
- Document how to install and enable the units in `CLAUDE.md`

**Non-Goals:**
- Cron-based scheduling (systemd timer is sufficient and more capable on modern Linux)
- Kubernetes / cloud-native scheduling (out of scope for this self-hosted project)
- Alerting or failure notifications (can be layered on top later via `OnFailure=`)
- Modifying the importer container or `Makefile` itself

## Decisions

**1. `docker compose run --rm importer` vs `make import`**
Use `docker compose run --rm importer` directly in the unit file. `make` may not be installed on all servers; `docker compose` is a direct dependency that must already be present.

**2. `WorkingDirectory` + `EnvironmentFile` vs hardcoded paths**
Set `WorkingDirectory=/opt/spieli` as a placeholder comment that operators must adjust. Load `.env` via `EnvironmentFile=%h/.env` where `%h` expands to the service user's home, keeping secrets out of the unit file. Document this clearly.

**3. `OnCalendar=weekly` vs explicit day/time**
`OnCalendar=weekly` (Sunday 00:00 local time) is the simplest expression. Operators can override to e.g. `OnCalendar=Sun 03:00` in an override drop-in without editing the shipped file.

**4. `User=` in the service unit**
Leave `User=` commented out as a placeholder. The operator must run `docker compose` as the user that owns the deployment directory and is in the `docker` group. A hardcoded value would be wrong for most setups.

## Risks / Trade-offs

- **Operator must edit `WorkingDirectory`** — the unit will fail silently (or not start) if the path is wrong. Mitigation: add a clear comment and document the required edit step.
- **`docker` group membership** — if the service user isn't in the `docker` group the run will fail with a permission error. Mitigation: document this prerequisite.
- **Long-running import blocks concurrent `make up` restarts** — the importer is a separate container so it won't affect the running stack, but a simultaneous `make import` call could conflict. Mitigation: low risk in practice (weekly cadence); note in docs.

## Migration Plan

1. Copy `deploy/spieli-import.service` and `deploy/spieli-import.timer` to `/etc/systemd/system/`
2. Edit `WorkingDirectory=` and `User=` in the service unit to match the deployment
3. `systemctl daemon-reload`
4. `systemctl enable --now spieli-import.timer`
5. Verify with `systemctl status spieli-import.timer`

Rollback: `systemctl disable --now spieli-import.timer && rm /etc/systemd/system/spieli-import.*`
