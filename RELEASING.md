# Release procedure

## Container images

Two images are published to GHCR on every release:

| Image | Used by |
|---|---|
| `ghcr.io/mfuhrmann/spieli` | app container (standalone + hub) |
| `ghcr.io/mfuhrmann/spieli-importer` | OSM importer |

### Tags published per event

| Git event | Tags written |
|---|---|
| Push to `main` | `:rc` |
| Push of `v*` tag | `:latest`, `:X.Y.Z`, `:X.Y` |

`compose.prod.yml` and `install.sh` both reference `:latest`. Without a properly tagged release, new operator installs fail with `image not found`.

## Version convention

`app/package.json` always carries the *next* version as an `-rc` suffix on `main` (e.g. `0.2.6-rc`). The `-rc` is removed only for the release commit. After tagging, `main` is immediately bumped to the next `-rc`.

## Release checklist

```bash
# 1. Make sure main is green and all intended PRs are merged.

# 2. Remove the -rc suffix in app/package.json.
#    Example: "0.2.6-rc" → "0.2.6"
$EDITOR app/package.json

# 3. Commit.
git add app/package.json && git commit -m "chore: release v0.2.6"

# 4. Tag and push the tag.  CI fires on the tag push and publishes
#    :latest, :0.2.6, and :0.2 for both images.
git tag v0.2.6
git push origin main
git push origin v0.2.6

# 5. Create the GitHub release.  This is NOT done automatically by CI —
#    without this step the tag exists but the Releases page stays stale
#    and operators have no release notes.
gh release create v0.2.6 \
  --title "v0.2.6 — <short summary>" \
  --notes "$(cat <<'EOF'
## What's new
- ...

## Breaking changes
- none

## Images
\`\`\`
ghcr.io/mfuhrmann/spieli:0.2.6
ghcr.io/mfuhrmann/spieli-importer:0.2.6
\`\`\`
EOF
)"

# 6. Verify both images are visible in GHCR and :latest is updated.
#    https://github.com/mfuhrmann?tab=packages&repo_name=spieli

# 7. Bump main to the next -rc.
#    Example: "0.2.6" → "0.2.7-rc"
$EDITOR app/package.json
git add app/package.json && git commit -m "chore: bump version to 0.2.7-rc"
git push origin main
```

## E2E tests and tag pushes

The E2E test workflow runs on pushes to `main` and on pull requests — **not** on tag pushes. This means the image published on a tag push is built from a commit that was already tested when it landed on `main`. No additional test run is needed before tagging.
