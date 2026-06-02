## Why

The current `build.yml` workflow tags main-branch container builds as `:latest`, which collides with stable release semantics — operators pulling `:latest` expect a tested release, not unversioned work-in-progress. Publishing an `:rc` tag on every PR merge gives testers a clearly-labelled pre-release image without polluting the `:latest` channel.

## What Changes

- On push to `main` (i.e. every merged PR): publish both the app image and importer image tagged `:rc` instead of `:latest`
- On version tag (`v*`): continue publishing `:latest` + semver tags as today — no change
- The short-SHA tag continues to be published on both triggers for traceability
- `:latest` is no longer pushed on main merges — it becomes exclusively tied to version tags

## Capabilities

### New Capabilities

- `rc-container-tag`: Build and push `:rc`-tagged container images (app + importer) on every push to `main`

### Modified Capabilities

- (none — the existing `:latest` tagging logic changes, but it lives in `build.yml` configuration, not a spec)

## Impact

- `.github/workflows/build.yml`: modify the `type=raw` tag rule — replace `value=latest` with `value=rc` for the `main` branch condition
- Downstream: anyone currently pulling `:latest` for staging/testing should switch to `:rc`; `:latest` will only update on releases
