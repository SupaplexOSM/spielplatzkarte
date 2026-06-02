## Why

The installer currently deploys the full stack (database + PostgREST + UI) without giving operators a choice. Some deployments benefit from separating the data backend from the frontend — for example, running a shared data node that multiple lightweight UI nodes connect to.

## What Changes

- The installer gains a deployment mode selection step (before any other configuration).
- Three modes are supported: **data-node** (DB + PostgREST only), **ui** (app only, connects to a remote API), **data-node-ui** (current behaviour: full stack).
- Questions irrelevant to the selected mode are skipped (e.g. no region/PBF questions for a UI-only node; no app-port/UI-link questions for a data-only node).
- For **ui** mode the installer asks for the remote API base URL instead of region data.
- The generated `.env` includes a `DEPLOY_MODE` variable reflecting the choice.
- `compose.prod.yml` gains Docker Compose profiles (`data-node`, `ui`, `data-node-ui`) so the right services are started based on the chosen mode.

## Capabilities

### New Capabilities

- `deployment-mode-selection`: Interactive selection of deployment mode (`data-node` | `ui` | `data-node-ui`) at install time, with conditional question flow and profile-scoped compose services.

### Modified Capabilities

- (none — existing installer flow is extended, not changed in behaviour for the `data-node-ui` path)

## Impact

- `install.sh` — new mode selection prompt, branched question sections, profile flag passed to all `docker compose` calls.
- `compose.prod.yml` — services tagged with profiles matching the three modes.
- `.env` — new `DEPLOY_MODE` variable written by installer.
