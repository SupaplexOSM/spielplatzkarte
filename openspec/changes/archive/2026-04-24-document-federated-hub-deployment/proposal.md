## Why

A federated topology — one UI running in Hub mode aggregating two or more data-nodes that have no UI of their own — is supported by the code (federation endpoints exist on every data node, the app has `APP_MODE=hub` and a `registry.json` loader), but is not documented as an end-to-end path. The pieces are scattered:

- `docs/reference/federation.md` says the Hub uses `APP_MODE=hub` and reads `registry.json`, but shows no example file, no format spec, and no `DEPLOY_MODE` guidance for the backends.
- `REGISTRY_URL` is honoured by `oci/app/docker-entrypoint.sh` and `app/src/lib/config.js`, but is absent from `docs/ops/configuration.md` and from `.env.example`.
- `docs/ops/manual-deploy.md` is single-node only and never mentions multi-node deployments.
- `docs/reference/architecture.md` lists the three `DEPLOY_MODE` profiles but never shows how they combine with the orthogonal `APP_MODE` axis (`standalone` vs `hub`).

An operator who wants "one UI that aggregates two regional data backends" today has to read the source to figure out the `registry.json` schema, guess that `REGISTRY_URL` exists as an env var, and manually wire `DEPLOY_MODE=ui` + `APP_MODE=hub` together by hand-editing `.env`.

## What Changes

- Add `docs/ops/federated-deployment.md` — a step-by-step walkthrough for the Hub-UI + N × data-node topology, including a copy-pasteable `registry.json` example and a topology diagram.
- Add a `REGISTRY_URL` row to the variable table in `docs/ops/configuration.md` (mode column: `ui` with `APP_MODE=hub`).
- Add a commented Hub block to `.env.example` showing `APP_MODE=hub` and `REGISTRY_URL`.
- Add a `docs/reference/registry-json.md` reference page documenting the `registry.json` schema, the two accepted top-level shapes (`{instances:[...]}` and bare array), and the fields the Hub reads from each entry.
- Extend `docs/reference/architecture.md` with a 2-axis matrix (`DEPLOY_MODE` × `APP_MODE`) making the legal combinations explicit.
- Link the new walkthrough from `docs/reference/federation.md` and from the MkDocs nav in `mkdocs.yml`.

Out of scope (possible follow-up proposals):
- Extending `install.sh` to offer Hub as a first-class selection. (Would require a secondary prompt after `DEPLOY_MODE=ui` for `APP_MODE` + `REGISTRY_URL`.)
- Restructuring the deployment docs around the 2-axis model rather than just adding a matrix.

## Capabilities

### New Capabilities

- `federated-hub-deployment-docs`: Documentation required to stand up a federated deployment (one Hub UI + ≥ 1 data-node backend) without reading source code.

### Modified Capabilities

- (none — this change only adds docs and example-config lines; runtime behaviour is untouched.)

## Impact

- `docs/ops/federated-deployment.md` — new file.
- `docs/reference/registry-json.md` — new file.
- `docs/ops/configuration.md` — new row in the variables table.
- `docs/reference/architecture.md` — new section (deploy-mode × app-mode matrix).
- `docs/reference/federation.md` — link added pointing to the walkthrough.
- `.env.example` — new commented Hub block.
- `mkdocs.yml` — nav entries for the two new pages.
- No code changes. No existing doc pages are restructured.
