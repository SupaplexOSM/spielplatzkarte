## Context

`build.yml` uses `docker/metadata-action` to compute image tags. The `type=raw,value=latest` rule currently fires on any `main` push via `enable=${{ github.ref == 'refs/heads/main' }}`. Semver tags (`v*`) drive `type=semver` rules and do not set `latest` explicitly — but because `type=raw,value=latest` also enables on `main`, every commit merged to main overwrites `:latest`.

Both the app image (`ghcr.io/<repo>`) and the importer image (`ghcr.io/<repo>-importer`) are affected identically and must be changed in the same way.

## Goals / Non-Goals

**Goals:**
- Publish `:rc` on every push to `main` (merged PR)
- Reserve `:latest` exclusively for version-tag releases (`v*`)
- Keep the short-SHA tag on all pushes for traceability
- Change both app and importer image metadata blocks

**Non-Goals:**
- Adding new workflow jobs or restructuring the pipeline
- Changing the importer or app `Dockerfile`
- Introducing additional tag strategies (e.g. `:edge`, `:nightly`)

## Decisions

**Replace `value=latest` with `value=rc` on the `main` branch condition**

Both `meta` and `meta-importer` steps have:
```yaml
tags: |
  type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
  type=semver,pattern={{version}}
  type=semver,pattern={{major}}.{{minor}}
  type=sha,prefix=
```

Change `value=latest` → `value=rc` in both blocks. The `enable=` condition stays identical — `:rc` is pushed on main, `:latest` is no longer pushed on main.

For version tags, `type=semver,pattern={{version}}` and `type=semver,pattern={{major}}.{{minor}}` already produce `:x.y.z` and `:x.y`. To also push `:latest` on a version tag, add a second `type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') }}` rule (or rely on the Docker Hub / GHCR default — but since the current workflow never set it on tags, this is out of scope and left as a follow-up).

**Alternative considered:** a separate workflow triggered on `release` event — rejected because the existing `build.yml` already covers the tagging logic; adding a second workflow duplicates the Docker build steps.

## Risks / Trade-offs

- **[Risk] Operators pulling `:latest` for staging get stale images after this change** → Mitigation: document in README that `:rc` is the new pre-release tag; `:latest` will not update until the next version release.
- **[Risk] `:latest` is never pushed** until the next `v*` tag — a new deployment has no `:latest` image temporarily → Acceptable: `:rc` fills this role.

## Migration Plan

1. Merge the `build.yml` change to `main` — the next push immediately starts publishing `:rc`.
2. `:latest` retains its last-pushed digest until overwritten by the next `v*` tag.
3. No rollback needed — the tag name change is additive from GHCR's perspective.
