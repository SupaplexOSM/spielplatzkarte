## 1. MkDocs scaffolding

- [x] 1.1 Create `docs/requirements.txt` with `mkdocs`, `mkdocs-material`, and `mike` pinned to versions matching packyard
- [x] 1.2 Create `mkdocs.yml` at repo root: site name, repo URL, edit URI, Material theme, nav skeleton, markdown extensions (admonition, superfences, tabbed, toc)
- [x] 1.3 Add `docs-install`, `docs-serve`, `docs-build`, `docs-clean` targets to `Makefile`
- [x] 1.4 Add `site/` and `.venv` to `.gitignore`
- [x] 1.5 Verify `make docs-install && make docs-build` runs without errors

## 2. GitHub Actions workflow

- [x] 2.1 Create `.github/workflows/docs.yml` triggering on push to `main` (paths: `docs/**`, `mkdocs.yml`) and `workflow_dispatch`
- [x] 2.2 Workflow steps: checkout (fetch-depth 0), setup Python, `make docs-install`, `mkdocs gh-deploy --force`
- [x] 2.3 Add required permissions: `contents: write`

## 3. Docs content — Getting Started

- [x] 3.1 Create `docs/index.md`: brief project description, architecture diagram (copy from README), links to main sections
- [x] 3.2 Create `docs/getting-started/quick-start.md`: full quick install walkthrough extracted from README (installer steps, post-install commands updated with `--profile` flags)

## 4. Docs content — Operations

- [x] 4.1 Create `docs/ops/manual-deploy.md`: manual from-source deploy steps extracted from README (steps 1–5), commands updated with `--profile` flags
- [x] 4.2 Create `docs/ops/configuration.md`: full env var reference table extracted from README, all variables with defaults, modes, descriptions
- [x] 4.3 Create `docs/ops/troubleshooting.md`: all 5 Q&A entries extracted from README troubleshooting section

## 5. Docs content — Contributing

- [x] 5.1 Create `docs/contributing/add-device.md`: full "How-to: Add a playground device" extracted from README (5 steps)
- [x] 5.2 Create `CONTRIBUTING.md` at repo root: issue → branch → change → commit → PR workflow, branch naming, commit message format (extracted from README Contributing section)

## 6. Docs content — Reference

- [x] 6.1 Create `docs/reference/architecture.md`: data flow diagram, production vs dev explanation (from README)
- [x] 6.2 Create `docs/reference/tech-stack.md`: full tech stack table (from README)
- [x] 6.3 Create `docs/reference/federation.md`: federation section content (from README)
- [x] 6.4 Create `docs/reference/glossary.md`: OSM relation ID, PBF file, osm2pgsql, PostgREST, Overpass Turbo — definitions only, no generic tool entries

## 7. Wire up mkdocs.yml navigation

- [x] 7.1 Fill in complete `nav:` section in `mkdocs.yml` mapping all pages created in tasks 3–6
- [x] 7.2 Verify `make docs-build` renders all pages without 404s or warnings

## 8. Slim README.md

- [x] 8.1 Remove the manual table of contents
- [x] 8.2 Remove the Glossary section; replace with one sentence linking to `docs/reference/glossary.md`
- [x] 8.3 Remove the "Manual deploy (from source)" subsection; replace with one line linking to `docs/ops/manual-deploy.md`
- [x] 8.4 Trim the Configuration reference to the top ~5 most-used variables plus a link to the full table in docs
- [x] 8.5 Remove the "How-to: Add a playground device" section; replace with one line linking to `docs/contributing/add-device.md`
- [x] 8.6 Remove the "How-to: Edit UI strings / add a language" section entirely (dead code; will be restored when i18n is re-integrated)
- [x] 8.7 Remove the "Troubleshooting" section; replace with one line linking to `docs/ops/troubleshooting.md`
- [x] 8.8 Replace the Contributing section body with 2 sentences + links to `CONTRIBUTING.md` and docs
- [x] 8.9 Remove the "Internationalisation" section (duplicate of removed how-to; dead code)
- [x] 8.10 Update all `docker compose` command examples to include `--profile data-node-ui` (or appropriate mode)
- [x] 8.11 Verify README is ≤ 200 lines

## 9. Enable GitHub Pages

- [ ] 9.1 Push branch, confirm workflow runs and `gh-pages` branch is created
- [ ] 9.2 Enable GitHub Pages in repository settings (source: `gh-pages` branch, root `/`)
- [ ] 9.3 Confirm docs site is accessible at `https://mfuhrmann.github.io/spieli/`
- [ ] 9.4 Add docs URL to `mkdocs.yml` `site_url` field
- [ ] 9.5 Add docs URL link to README (e.g. in the header or Contributing section)
