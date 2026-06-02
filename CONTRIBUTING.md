# Contributing

All contributions are welcome — code, translations, bug reports, or documentation improvements.

## Repository layout

| Directory | Contents |
|---|---|
| `app/` | Svelte 5 frontend app (source in `app/src/`) |
| `importer/` | osm2pgsql import scripts and PostgREST API SQL |
| `db/` | PostgreSQL initialisation SQL |
| `oci/` | Docker build contexts — `oci/app/` (Svelte app + nginx) |
| `processing/` | OSM data pipeline scripts (Lua rules, SQL, shell) used during import |
| `taginfo/` | [taginfo](https://taginfo.openstreetmap.org) metadata describing the OSM tags this project uses |
| `locales/` | Translation files (`*.json`, one per language) — not yet active in the Svelte rewrite |
| `deploy/` | Systemd unit files for automated weekly import on Linux servers |

## Step 1 — Create a GitHub issue

Before writing code, open an issue describing what you want to fix or add. This lets maintainers give early feedback and avoids duplicated effort. Skip this for tiny fixes like typos.

## Step 2 — Create a branch

```bash
git checkout main
git pull
git checkout -b fix/my-fix-name
```

**Branch naming:**

| Prefix | Use for |
|---|---|
| `feat/` | New feature (e.g. `feat/add-balance-beam-device`) |
| `fix/` | Bug fix (e.g. `fix/popup-scroll`) |
| `docs/` | Documentation only (e.g. `docs/add-glossary`) |
| `chore/` | Maintenance, dependency updates |

## Step 3 — Make your change and test it

For frontend changes, run `make dev` and verify the feature in your browser. For Docker stack changes, run `make docker-build` and test at `http://localhost:8080`.

If you edited documentation, run `make docs-build` before pushing — the CI deploy uses `--strict` mode and will fail on broken links or missing nav entries.

## Step 4 — Commit with a conventional commit message

```bash
git add app/src/lib/yourChangedFile.js
git commit -m "feat: add balance_beam playground device"
```

**Format:** `<type>: <short description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `chore`, `ci`

Examples:

- `feat: add filtering by device height`
- `fix: location button not showing nearby playgrounds on mobile`
- `docs: add balance_beam to device how-to guide`

## Step 5 — Push and open a pull request

```bash
git push -u origin fix/my-fix-name
```

GitHub will print a link to open a pull request. Write a short description of what you changed and why, and submit. A maintainer will review it.

> **Never push directly to `main`.** All changes go through a branch and a pull request.
