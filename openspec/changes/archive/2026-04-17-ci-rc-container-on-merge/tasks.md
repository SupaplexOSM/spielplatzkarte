## 1. Update build.yml tag rules

- [x] 1.1 In the `meta` step (app image), change `type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}` to `type=raw,value=rc,enable=${{ github.ref == 'refs/heads/main' }}`
- [x] 1.2 In the `meta-importer` step (importer image), apply the same `value=latest` → `value=rc` change

## 2. Verification

- [x] 2.1 Confirm the workflow YAML is valid (no syntax errors) by inspecting the changed lines
- [x] 2.2 Merge to `main` and verify that `ghcr.io/<repo>:rc` and `ghcr.io/<repo>-importer:rc` are published and `:latest` is not updated
