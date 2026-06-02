## Context

`install.sh` is a single-file bash script that walks operators through an interactive setup, downloads `compose.prod.yml` + `db/init.sql`, writes `.env`, and optionally starts the stack. Currently it always installs the complete stack (db + PostgREST + app). `compose.prod.yml` already has a rough split between data services (`db`, `postgrest`, `importer`) and the UI (`app`), but no profiles are defined.

## Goals / Non-Goals

**Goals:**
- Let operators choose exactly which tier to deploy without manually editing compose files.
- Skip irrelevant questions per mode (e.g. no PBF/region questions for UI-only).
- Keep `data-node-ui` fully backward-compatible with the current flow.
- Pass the correct `--profile` flag to all `docker compose` calls automatically.

**Non-Goals:**
- Multi-host networking setup — operators configure `API_BASE_URL` manually when a remote data node exists.
- Any changes to the Svelte app or PostgREST config beyond what `.env` already controls.
- GUI or web-based installer.

## Decisions

### D1 — Docker Compose profiles as the mechanism

Profiles let operators (and the installer) activate only the relevant services without maintaining multiple compose files. Each service is tagged with the profile(s) in which it participates:

| Service    | data-node | ui | data-node-ui |
|------------|:---------:|:--:|:------------:|
| db         | ✓         |    | ✓            |
| importer   | ✓         |    | ✓            |
| postgrest  | ✓         |    | ✓            |
| app        |           | ✓  | ✓            |

Alternative considered: separate compose files per mode. Rejected — more files to maintain and download, and the installer would need to know which file to fetch.

### D2 — Mode stored in `DEPLOY_MODE` env var

Writing `DEPLOY_MODE` to `.env` means the operator can re-run `docker compose --profile $DEPLOY_MODE up -d` without remembering what they chose at install time. The installer reads this var when re-running to detect an existing mode.

### D3 — Question branching via a simple `case` block

After the mode is selected, a `case "$DEPLOY_MODE" in` block guards each question section:

- `data-node`: region/PBF, infra (threads, no app-port)
- `ui`: remote API URL, UI links, map display, app-port
- `data-node-ui`: all questions (current behaviour)

This keeps the script linear and easy to read.

### D4 — `API_BASE_URL` for UI mode

When mode is `ui`, the installer asks for the base URL of the remote PostgREST endpoint (e.g. `https://data.example.com/api`). This is written to `.env` and passed into the `app` container as `API_BASE_URL`.

### D5 — No port question for data-node mode

A data-only node doesn't expose the app. `APP_PORT` is omitted from `.env` for `data-node`, avoiding confusion.

## Risks / Trade-offs

- **Profile typo confusion** → The script uses a fixed `select` menu (not free text) so the value is always one of the three valid strings.
- **Existing installs without `DEPLOY_MODE`** → The installer detects missing `DEPLOY_MODE` in an existing `.env` and treats it as `data-node-ui`, preserving backward compatibility.
- **Remote API URL not validated** → We don't test connectivity to the remote API at install time. A bad URL fails silently until the user opens the app. Mitigation: print a reminder to verify connectivity after start.

## Migration Plan

1. Update `compose.prod.yml` to add profiles (backward-compatible: services without profiles still start when no `--profile` is given, so existing deployments are unaffected until they re-run the installer).
2. Update `install.sh` with mode selection and branched questions.
3. No database migration needed.
4. Rollback: revert both files; existing `.env` files without `DEPLOY_MODE` continue to work.

## Open Questions

- Should the installer support upgrading an existing install to a different mode (e.g. data-node → data-node-ui)? → Out of scope for now; operators can edit `.env` and re-run `docker compose --profile <mode> up -d`.
