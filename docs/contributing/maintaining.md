# Maintainer Guide

This guide is for maintainers who manage the project's dependencies, toolchain, and release process. It covers how to upgrade key components and how to handle deprecations.

## Release procedure

See [RELEASING.md](https://github.com/mfuhrmann/spieli/blob/main/RELEASING.md) for the full release checklist. Summary:

1. Remove `-rc` suffix from `app/package.json` (e.g. `0.4.1-rc` → `0.4.1`)
2. Commit: `chore: release v0.4.1`
3. Tag: `git tag v0.4.1 && git push origin v0.4.1` — CI publishes `:latest`, `:0.4.1`, `:0.4` images
4. Create GitHub release with `gh release create v0.4.1 --title "…" --notes "…"`
5. Bump `main` to next `-rc`: `0.4.2-rc`

`main` always carries the next `-rc` version between releases.

---

## Upgrading frontend dependencies

### Svelte

Svelte 5 introduced runes (signals-based reactivity). This project currently uses Svelte 5 with legacy writable stores — not runes. Migrating to runes is tracked but not yet done.

To upgrade within Svelte 5:

```bash
cd app
npm update svelte @sveltejs/vite-plugin-svelte
```

Run `make dev`, open the app, and verify:
- Map renders and loads playgrounds
- Filter panel works
- PlaygroundPanel opens on click
- Hub mode works (set `appMode: 'hub'` in `public/config.js`)

Run `make test` to confirm E2E tests pass.

For a **major version upgrade** (Svelte 5 → 6), check the [Svelte migration guide](https://svelte.dev/docs/svelte/v5-migration-guide) first. The migration is likely to involve changes to `StandaloneApp.svelte`, `HubApp.svelte`, and all store subscriptions.

### OpenLayers

```bash
cd app
npm update ol
```

OpenLayers has a history of breaking API changes between minor versions. After upgrading, verify:
- Map tiles load
- Cluster rings render correctly (`clusterStyle.js` uses the OL canvas renderer API)
- Equipment and polygon layers render
- Click handling on playground polygons works
- `Map.svelte` imports — OL occasionally moves modules between paths

### Tailwind CSS

Tailwind 4 uses a PostCSS plugin (no `tailwind.config.js`). To upgrade:

```bash
cd app
npm update tailwindcss @tailwindcss/postcss
```

Check that utility classes still apply by opening the app. Tailwind 4's `@theme` syntax differs from Tailwind 3 — if you see the `@` directives breaking, check the [Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide).

---

## Upgrading infrastructure components

### PostgreSQL

PostgreSQL major version upgrades (e.g. 16 → 17) require a `pg_upgrade` or dump-restore migration. The database is stored in the `pgdata` Docker volume.

Steps:
1. Back up the database: `docker compose exec db pg_dump -U osm osm > backup.sql`
2. Update the PostgreSQL image tag in `compose.yml` and `compose.prod.yml`
3. Stop the stack and **remove the volume**: `docker volume rm <project>_pgdata`
4. Start the stack (init.sql runs again, creating a fresh empty database)
5. Re-import: `docker compose run --rm importer`

The data volume is not forward-compatible between major PostgreSQL versions — you must re-import rather than reuse the volume.

### PostgREST

```yaml
# compose.yml / compose.prod.yml
image: postgrest/postgrest:v13   # bump this
```

After upgrading PostgREST:
- Run `make db-apply` — some PostgREST versions change how they interpret `SECURITY DEFINER` or `search_path` settings
- Verify all `/api/rpc/*` endpoints work: `curl http://localhost:8080/api/rpc/get_meta`
- Check the [PostgREST changelog](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md) for breaking changes to the HTTP API or JWT handling

### osm2pgsql + osmium-tool

These are installed in the importer Docker image (`importer/Dockerfile`). To upgrade:

1. Update the base image or `apt install` versions in `importer/Dockerfile`
2. Run `make docker-build` (rebuilds the importer image)
3. Run `make import` to test the new version

The importer uses osm2pgsql in default pgsql mode (`--slim --drop --hstore`) — no Lua script. Check the [osm2pgsql changelog](https://osm2pgsql.org/news/) for breaking changes to the pgsql output schema or CLI flags when upgrading.

---

## Docker base images

The app image (`oci/app/Dockerfile`) uses an nginx base image. The importer image (`importer/Dockerfile`) uses an osm2pgsql base image or builds from a Debian/Ubuntu base.

Update base images by changing the `FROM` line and rebuilding:

```bash
make docker-build   # rebuilds oci/app + importer images
```

After rebuilding, run the full E2E suite:

```bash
make up && make seed-load && make test
```

---

## Handling deprecations

The codebase currently has one deprecated API: `fetchPlaygrounds` (region-scoped, replaced by `fetchPlaygroundsBbox`).

Deprecation process:
1. Add a `console.warn` in the deprecated function (already done)
2. Add a `COMMENT ON FUNCTION` in `api.sql` flagging it for removal
3. Document the planned removal version in the function's JSDoc `@deprecated` tag
4. Remove in the release **after** next (one release grace period)
5. Update `docs/reference/api.md` to mark the function as removed

---

## Architecture Decision Records (ADRs)

When making a significant architectural choice — a new external dependency, a change to the API contract, a new deployment mode — write an ADR in `docs/adr/`.

File naming: `NNNN-short-title.md` (e.g. `0002-add-hub-mode.md`).

Suggested structure:
```markdown
# ADR-NNNN: Title

- **Status:** Proposed | Accepted | Rejected | Superseded
- **Date:** YYYY-MM-DD
- **Deciders:** @username

## Context
What problem are we solving? What are the constraints?

## Decision
What did we decide?

## Alternatives considered
What else did we evaluate and why did we reject it?

## Consequences
What are the positive and negative effects of this decision?
```

See [ADR-0001](../adr/0001-openspec-sharing-policy.md) for an example.

---

## Dependency audit

Check for outdated or vulnerable packages periodically:

```bash
# Frontend
cd app && npm audit && npm outdated

# Root (Playwright)
npm audit && npm outdated
```

GitHub Dependabot is configured in `.github/dependabot.yml` and will open PRs for dependency updates automatically.

## See also

- [RELEASING.md](https://github.com/mfuhrmann/spieli/blob/main/RELEASING.md) — full release checklist
- [Contributing](local-dev.md) — local dev setup
- [Tech Stack](../reference/tech-stack.md) — component versions
