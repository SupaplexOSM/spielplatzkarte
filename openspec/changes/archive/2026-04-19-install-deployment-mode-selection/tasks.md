## 1. compose.prod.yml — Add profiles

- [x] 1.1 Add `profiles: [data-node, data-node-ui]` to the `db` service
- [x] 1.2 Add `profiles: [data-node, data-node-ui]` to the `postgrest` service
- [x] 1.3 Add `profiles: [data-node, data-node-ui]` to the `importer` service (currently has `profiles: [import]` — replace)
- [x] 1.4 Add `profiles: [ui, data-node-ui]` to the `app` service
- [x] 1.5 Verify `docker compose --profile data-node config` shows only db/postgrest/importer
- [x] 1.6 Verify `docker compose --profile ui config` shows only app
- [x] 1.7 Verify `docker compose --profile data-node-ui config` shows all services

## 2. install.sh — Mode selection

- [x] 2.1 Add a `choose_mode` function that presents a numbered menu (1=data-node, 2=ui, 3=data-node-ui) and loops until a valid choice is entered
- [x] 2.2 Call `choose_mode` immediately after the deployment-directory prompt, store result in `DEPLOY_MODE`
- [x] 2.3 Detect existing `.env` without `DEPLOY_MODE` and default to `data-node-ui` for backward compat

## 3. install.sh — Branched question sections

- [x] 3.1 Wrap the Region section (OSM_RELATION_ID, PBF_URL) in `[[ "$DEPLOY_MODE" != "ui" ]]`
- [x] 3.2 Add a new UI-mode-only section that asks for `API_BASE_URL` (required, no default)
- [x] 3.3 Wrap the "Optional: UI links" section so it only shows for `ui` and `data-node-ui`
- [x] 3.4 Wrap the "Optional: map display" section so it only shows for `ui` and `data-node-ui`
- [x] 3.5 For the infra section: skip `APP_PORT` when `DEPLOY_MODE=data-node`; skip `OSM2PGSQL_THREADS` when `DEPLOY_MODE=ui`

## 4. install.sh — .env generation

- [x] 4.1 Add `DEPLOY_MODE=${DEPLOY_MODE}` to the written `.env` (under the header comment)
- [x] 4.2 Write `API_BASE_URL` to `.env` for `ui` mode; omit for other modes
- [x] 4.3 Omit `APP_PORT` from `.env` for `data-node` mode
- [x] 4.4 Omit `OSM2PGSQL_THREADS` from `.env` for `ui` mode

## 5. install.sh — Docker Compose calls

- [x] 5.1 Add `--profile "$DEPLOY_MODE"` to the `docker compose pull` call
- [x] 5.2 Add `--profile "$DEPLOY_MODE"` to the `docker compose up -d` call
- [x] 5.3 Add `--profile "$DEPLOY_MODE"` to the `docker compose run --rm importer` call
- [x] 5.4 Skip the "Run OSM import now?" block entirely when `DEPLOY_MODE=ui`

## 6. install.sh — Done message

- [x] 6.1 Show app URL in the done message only when mode is `ui` or `data-node-ui`
- [x] 6.2 Show importer hint only when mode is `data-node` or `data-node-ui`
- [x] 6.3 Update the "Useful commands" section to include `--profile $DEPLOY_MODE` in example commands

## 7. Manual smoke test

- [ ] 7.1 Run installer in `data-node-ui` mode end-to-end and verify existing behaviour is unchanged
- [ ] 7.2 Run installer in `data-node` mode and verify only db/postgrest start, no app URL shown
- [ ] 7.3 Run installer in `ui` mode and verify only app starts, no import prompt, API URL written to `.env`
