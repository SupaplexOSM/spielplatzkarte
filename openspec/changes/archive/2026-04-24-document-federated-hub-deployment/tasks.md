## 1. Walkthrough page — `docs/ops/federated-deployment.md`

- [x] 1.1 Add an intro paragraph defining the topology: one Hub UI + ≥ 1 data-node, no UI on the backends
- [x] 1.2 Include an ASCII topology diagram showing browser → Hub UI → N × data-node
- [x] 1.3 Document the per-node `.env` for each data-node (`DEPLOY_MODE=data-node`, `OSM_RELATION_ID`, `PBF_URL`, `POSTGRES_PASSWORD`)
- [x] 1.4 Document the Hub UI's `.env` (`DEPLOY_MODE=ui`, `APP_MODE=hub`, `REGISTRY_URL`, `HUB_POLL_INTERVAL`, `APP_PORT`) — note that `API_BASE_URL` is *not* set on a Hub
- [x] 1.5 Show a copy-pasteable `registry.json` example covering two backends in the `{instances: [...]}` shape
- [x] 1.6 Document where `registry.json` is served from (same origin as the Hub UI) and the CORS requirement on data nodes
- [x] 1.7 Show the exact `docker compose --profile ui up -d` invocation for the Hub and `--profile data-node up -d` + `run --rm importer` for each backend
- [x] 1.8 Add a "Verification" section: operator visits the Hub, opens DevTools, sees features loaded from each backend URL

## 2. Registry schema reference — `docs/reference/registry-json.md`

- [x] 2.1 Document the two accepted top-level shapes: `{instances: [...]}` and bare array (source of truth: `app/src/hub/registry.js:93`)
- [x] 2.2 Document per-entry fields read by the Hub: `url` (required), `name` (optional, falls back to meta or url)
- [x] 2.3 Note which fields come from `/api/rpc/get_meta` at runtime (`version`, `region`) so readers don't try to set them in `registry.json`
- [x] 2.4 Include a minimal and a full example side-by-side

## 3. Configuration reference — `docs/ops/configuration.md`

- [x] 3.1 Add a `REGISTRY_URL` row: default unset, mode `ui` (hub), description + link to the registry-json reference page
- [x] 3.2 Clarify the existing `APP_MODE` row so it's visible that `hub` requires `REGISTRY_URL`

## 4. Architecture reference — `docs/reference/architecture.md`

- [x] 4.1 Under "Deployment modes", add a second subsection showing the `DEPLOY_MODE` × `APP_MODE` matrix
- [x] 4.2 Mark the legal-and-useful cells; mark `data-node × hub` as N/A (no UI to run in hub mode)
- [x] 4.3 Include a one-line caption pointing readers at `docs/ops/federated-deployment.md` for the hub topology

## 5. Federation page cross-link — `docs/reference/federation.md`

- [x] 5.1 Add a "See also" link to `docs/ops/federated-deployment.md` as the stand-up walkthrough
- [x] 5.2 Add a "See also" link to `docs/reference/registry-json.md` for the schema

## 6. `.env.example` — Hub block

- [x] 6.1 Add a commented "Hub mode" section with `APP_MODE=hub` and `REGISTRY_URL=` (both commented out)
- [x] 6.2 Add a one-line comment pointing at `docs/ops/federated-deployment.md`

## 7. MkDocs nav — `mkdocs.yml`

- [x] 7.1 Add `docs/ops/federated-deployment.md` under the Ops section of the nav
- [x] 7.2 Add `docs/reference/registry-json.md` under the Reference section of the nav

## 8. Validation

- [x] 8.1 Run `mkdocs build --strict` and confirm no broken links / nav warnings
- [x] 8.2 Run `openspec validate document-federated-hub-deployment --strict` and confirm it passes
- [x] 8.3 Read the walkthrough top-to-bottom as if standing up a real cluster — sanity-check that every command is correct against `compose.prod.yml` and `install.sh`

## 9. Review Findings (bmad-code-review, 2026-04-24)

### Critical
- [x] [Review][Patch] `compose.override.yml` auto-merge claim is wrong when `-f compose.prod.yml` is used. Compose v2 only auto-merges `compose.override.yml` when no `-f` is passed. Fix: Option A must use `docker compose -f compose.prod.yml -f compose.override.yml --profile ui up -d`, and the explanatory text must drop "Compose merges both automatically". [docs/ops/federated-deployment.md Step 3 "Option A"]

### High
- [x] [Review][Patch] Walkthrough's CORS guidance assumes nginx from `data-node-ui`, but Step 1 deploys `data-node` profile which has no HTTP server and no port publish for `postgrest`. Operator following the happy path has no reachable `/api`. Fix: either tell operators to add their own reverse proxy + port publish (with snippet), or recommend `DEPLOY_MODE=data-node-ui` for external data-nodes even if the UI is not used. [docs/ops/federated-deployment.md Step 1 "Enable public access"]
- [x] [Review][Patch] Default `REGISTRY_URL=/registry.json` serves the dev fixture (`/api`, `/api2`) baked into the image. On a `DEPLOY_MODE=ui` Hub, those paths have no upstream — Hub loads with all-red backends. The walkthrough presents bind-mount (Option A) and custom image (Option B) as "options" but at least one is mandatory. Fix: mark Step 3 "Make registry.json available" as required, not optional polish. [docs/ops/federated-deployment.md Step 3]
- [x] [Review][Patch] Compose override YAML example in Option A is missing the `services:` root key — a literal copy-paste produces invalid YAML. Fix: wrap under `services:`. [docs/ops/federated-deployment.md Step 3 "Option A" code block]

### Medium
- [x] [Review][Patch] `REGISTRY_URL` and `HUB_POLL_INTERVAL` rows in `docs/ops/configuration.md` don't link to the walkthrough or registry reference (spec Req 3 Scenario asks for a link). Fix: append `See [Federated Deployment](federated-deployment.md).` to both descriptions. [docs/ops/configuration.md:14, :30]
- [x] [Review][Patch] `docs/reference/registry-json.md` doesn't mark `version` and `region` as runtime-populated from `get_meta` and therefore not user-settable in the file (task 2.3 unsatisfied). Also the `name` field is listed as required but `app/src/hub/registry.js:114` falls back to `url` — clarify "required for readable display, falls back to url". [docs/reference/registry-json.md entry fields table]
- [x] [Review][Patch] Walkthrough's `get_meta` curl comment lists a `version` field that `importer/api.sql:591-601` does not return. Fix to `{ relation_id, name, playground_count, bbox }`. [docs/ops/federated-deployment.md Step 1 verification block]
- [x] [Review][Patch] `REGISTRY_URL` documented as a URL, but `oci/app/docker-entrypoint.sh:14` strips `?`, `=`, `&` via sanitizer — query strings and fragments are silently dropped. Fix: add a one-line note to the walkthrough's `REGISTRY_URL` description. [docs/ops/federated-deployment.md Step 3 Hub `.env` notes]
- [x] [Review][Patch] Architecture matrix's `data-node-ui + hub` cell ("Hub co-located with a local data-node (dev / single-host)") doesn't warn that the default registry targets dev paths (`/api`, `/api2`) and must be replaced. Fix: add a short caveat to the cell or the caption. [docs/reference/architecture.md matrix]

### Low
- [x] [Review][Patch] `.env.example` Hub banner says "Uncomment these and set DEPLOY_MODE=ui when running a Hub container" but the data-node block tacitly relies on default. Tighten wording so operators don't uncomment Hub vars on data-nodes. [.env.example Hub-mode block top comment]
- [x] [Review][Patch] Verification step 4.2 shows `🌐 2 Regionen · N Spielplätze` with literal `N` inside backticks — readers will wonder if they should see the letter. Replace with `<count>` placeholder and note localized German text is expected. [docs/ops/federated-deployment.md Step 4 item 2]
- [x] [Review][Patch] Architecture matrix `ui + standalone` cell ("Remote-frontend for one region") gives no pointer to Step 1's CORS requirements, which also apply here. Minor: add a one-line note. [docs/reference/architecture.md matrix]
- [x] [Review][Patch] `HUB_POLL_INTERVAL` documented only as "seconds between ...". Noting the value is a bare integer (not `300s`) would pre-empt a common footgun. [docs/ops/federated-deployment.md Step 3 notes]
- [x] [Review][Patch] Data-node `.env` example uses `POSTGRES_PASSWORD=<strong-random-password>` with angle-bracket placeholder — a literal paste with brackets would be accepted by PostgreSQL but be an embarrassing password. Nudge the operator with "(replace the placeholder)". [docs/ops/federated-deployment.md Step 1 data-node .env]

## 10. Review Findings — Pass 2 (bmad-code-review, 2026-04-24)

Re-review of pass 1's 14 patches. Both hard spec misses from pass 1 confirmed resolved. 7 small residual issues + 1 cosmetic task-hygiene item.

- [x] [Review][Patch] Step 4 item 4 promises a "version badge" the drawer won't render — `InstancePanelDrawer.svelte:71` guards on `{#if b.version}` but `get_meta` never returns `version`. Regression from the pass-1 curl fix. Fix: drop "version badge" from the verification list, or caveat that it's always empty today. [docs/ops/federated-deployment.md Step 4 item 4] (Medium)
- [x] [Review][Patch] "You must list both files on every invocation" paragraph is scoped to Option A but written unscoped — Option B readers may think they also need the override. Fix: scope the sentence explicitly. [docs/ops/federated-deployment.md Step 3 "Replace the bundled registry.json"] (Low)
- [x] [Review][Patch] "Pure `DEPLOY_MODE=data-node` (advanced)" tip box doesn't say which `--profile` to use. Fix: add `--profile data-node` to the guidance. [docs/ops/federated-deployment.md Topology section tip] (Low)
- [x] [Review][Patch] Runtime-populated caveat in `registry-json.md` overstates behaviour — `registry.js` never reads `entry.version`/`entry.region`, so there's nothing to "overwrite", and `get_meta` doesn't return `version` so it's always null (not "app package version"). Fix: rewrite to say the Hub ignores these keys in the file, and `version` stays null until the importer or backend surfaces one. [docs/reference/registry-json.md runtime-populated admonition] (Low-Medium)
- [x] [Review][Patch] Port conflict when two data-nodes share a host — both default `APP_PORT=8080`. Fix: add a one-line note to Prerequisites or the data-node `.env` block recommending distinct `APP_PORT` + `COMPOSE_PROJECT_NAME` for co-located backends. [docs/ops/federated-deployment.md Prerequisites / Step 1] (Medium)
- [x] [Review][Patch] `!!! tip` admonition for the pure data-node path carries a warning-level caveat (no HTTP server, secondary UI may leak). Change to `!!! note` or `!!! warning` for correct visual severity. [docs/ops/federated-deployment.md Topology section] (Low)
- [x] [Review][Patch] Architecture matrix `ui × standalone` cell mentions "that backend must enable CORS" with no pointer. Fix: link the phrase to the walkthrough's Step 1 CORS discussion. [docs/reference/architecture.md matrix] (Low)
- [x] [Review][Patch] Implementation tasks 1.1–7.1 remain unticked despite being done; only 8.1/8.2 and the review patches are ticked. Cosmetic but tidier for archive. [openspec/changes/.../tasks.md] (Nit)

### Dismissed (pass 2)
- Mode column "hub" for `REGISTRY_URL` / `HUB_POLL_INTERVAL` despite unconditional compose wiring — the Mode column describes where the var has effect, not where it's wired. Convention is consistent.
- `name` field naming consistency between walkthrough mini-table and reference — both say "recommended"; already consistent.
- `.env.example` Hub banner could be misread — current wording "These apply ONLY on the Hub container (DEPLOY_MODE=ui)" is clear enough.
- Password placeholder nudge position — verified correct (before the code block).
- Proposal "no UI of their own" vs walkthrough recommending `data-node-ui` — acknowledged documented trade-off; proposal intent is preserved operationally.
- `registry-json.md` admission that `get_meta` doesn't return `version` — consistent with Step 1 curl comment.

### Dismissed (noise / false positive / already handled)
- Rename `HUB_REGISTRY_URL` → `REGISTRY_URL` half-done: only one occurrence existed, already fixed this branch.
- OSM_RELATION_ID=454863 vs canonical: `454863` IS correct for Fulda Stadt (`docs/reference/federation.md:34`).
- `--profile data-node/ui` labels don't exist: verified present in `compose.prod.yml` profiles blocks.
- Registry URL trailing-slash concern: matches `app/src/hub/registry.js` concatenation behaviour.
- "hub requires REGISTRY_URL" overreach: default `/registry.json` works with bind-mount, acceptable phrasing.
- `See also` link-style inconsistency: nit not worth the churn.
- Auditor: `REGISTRY_URL` row missing from configuration.md — the row pre-exists at line 14; only the link is missing (captured above as Medium).
- Auditor: mkdocs Reference nav missing registry-json entry — already present pre-existing (`mkdocs.yml:44`).
- Auditor: compose.prod.yml scope violation — user explicitly approved bundling the fix earlier this session.
- Auditor: `HUB_POLL_INTERVAL` scope creep in task 1.4 — same user-approved judgment.
- Empty `HUB_POLL_INTERVAL` env producing invalid JS: the Edge Hunter self-corrected; `${VAR:-default}` handles both unset and empty.
