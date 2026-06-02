## Why

The README is 607 lines serving four different audiences (evaluators, operators, contributors, content editors) and mixing quick-start material with deep how-tos, troubleshooting Q&As, and a glossary — making it hard to scan and maintain. A dedicated docs site extracts that depth into a properly navigable, searchable reference while slimming the README to an effective project landing page.

## What Changes

- `docs/` directory added with MkDocs + Material theme source (markdown pages, `requirements.txt`)
- `mkdocs.yml` added at repo root with navigation, Material theme config, and GitHub repo integration
- `Makefile` gains `docs-install`, `docs-serve`, `docs-build`, `docs-clean` targets
- `.github/workflows/docs.yml` added — deploys to GitHub Pages on every push to `main`
- `CONTRIBUTING.md` added at repo root with the full contributing workflow (extracted from README)
- `README.md` slimmed from 607 lines to ~150: keeps header, architecture diagram, tech stack table, quick install, abbreviated config, 3-line local dev, federation, external services, license
- Docs content extracted from README into structured pages under `docs/`

## Capabilities

### New Capabilities

- `mkdocs-site`: MkDocs Material docs site with GitHub Pages deployment, covering ops, contributing, and reference content extracted from README
- `slim-readme`: README restructured as a concise project landing page (~150 lines), with deep content moved to docs

### Modified Capabilities

(none — no existing spec-level behaviour changes)

## Impact

- `README.md` — significant reduction in content; links added pointing to docs site
- `CONTRIBUTING.md` — new file (extracted from README Contributing section)
- `Makefile` — new `docs-*` targets added
- `mkdocs.yml` — new file at repo root
- `docs/` — new directory with all markdown source and `requirements.txt`
- `.github/workflows/docs.yml` — new CI workflow
- GitHub repository settings — GitHub Pages must be enabled (source: `gh-pages` branch)
