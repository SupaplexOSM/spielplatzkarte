## Context

README.md is 607 lines mixing audience-specific content: a project pitch for evaluators, deploy instructions for operators, a git tutorial for contributors, and how-to guides for content editors. The packyard project in the same GitHub org already demonstrates the exact pattern to follow: MkDocs + Material theme, deployed to GitHub Pages via GitHub Actions. The goal is to replicate that setup here with content appropriate for spieli.

## Goals / Non-Goals

**Goals:**
- Extract deep content (troubleshooting, how-tos, full config reference, contributing workflow, glossary) into a browseable, searchable docs site
- Slim README to ~150 lines that serve as an effective project landing page
- Fully automated deployment: every push to `main` rebuilds the site
- Local preview with a single `make` command

**Non-Goals:**
- Versioned docs (Mike) — content is operational, not API-contract; single `latest` is sufficient
- Translating docs into languages other than English
- Migrating the i18n how-to until i18n is re-integrated in the Svelte rewrite
- Any changes to the Svelte app, Docker stack, or CI pipeline beyond the new docs workflow

## Decisions

### D1 — MkDocs + Material (not VitePress or Docusaurus)

Same choice as packyard. The project already has a Python toolchain dependency (osm2pgsql docs use Python). Material theme is best-in-class for MkDocs. VitePress would be natural given the JS stack but adds Node tooling complexity to a docs workflow that should be independent of the app build. Docusaurus is heavier than needed.

### D2 — Deploy on push to `main`, not on release

Docs are operational (how to deploy, configure, troubleshoot). They should stay current with `main` rather than lagging until a release is cut. No Mike versioning needed. Workflow trigger: `push: branches: [main]`, paths: `['docs/**', 'mkdocs.yml']` plus a manual `workflow_dispatch`.

### D3 — `docs/` directory structure

```
docs/
├── index.md                          # landing page
├── getting-started/
│   └── quick-start.md                # installer walkthrough (from README)
├── ops/
│   ├── manual-deploy.md              # from-source deploy (from README)
│   ├── configuration.md              # full env var table (from README)
│   └── troubleshooting.md            # Q&As (from README)
├── contributing/
│   └── add-device.md                 # how-to add playground device (from README)
└── reference/
    ├── architecture.md               # diagram + explanation
    ├── tech-stack.md                 # full tech stack table
    ├── federation.md                 # federation section (from README)
    └── glossary.md                   # OSM-specific terms only
```

The i18n how-to is intentionally excluded until i18n is active.

### D4 — CONTRIBUTING.md at repo root

GitHub surfaces `CONTRIBUTING.md` automatically in the "new issue" and "new PR" flows. The full git workflow from the README Contributing section moves here. The README Contributing section becomes two sentences with a link.

### D5 — Glossary scope

Only OSM/domain-specific terms are kept: OSM relation ID, PBF file, osm2pgsql, PostgREST, Overpass Turbo. Standard tools (Docker, nginx, PostgreSQL, Vite, etc.) are dropped — they are widely known and a sentence in a README won't substitute for their own documentation.

### D6 — README target structure

```
# spieli
  1-liner + origin

## Architecture         (diagram — keep)
## Tech stack           (table — keep, brief)
## Deploy               (quick install only; link to docs for manual)
## Configuration        (top 5 vars + link to full reference in docs)
## Local development    (make install / make up / make dev — 3 lines)
## Contributing         (2 sentences + link to CONTRIBUTING.md and docs)
## Federation           (keep as-is)
## External services    (table — keep)
## License
```

The manual ToC is removed — GitHub renders heading anchors automatically.

## Risks / Trade-offs

- **`gh-pages` branch creation** → GitHub Pages must be enabled in repo settings after first deploy; the workflow will create the branch automatically on first run but Pages must be switched on manually.
- **README content removal is irreversible in perception** → Some operators may have bookmarked specific README sections. Mitigation: all moved content gets a docs URL that is stable going forward.
- **Python dependency for docs** → Operators building from source now need Python to preview docs locally. Mitigation: `make docs-serve` is clearly scoped; it's not required to run the app.

## Open Questions

(none — all decisions made during explore session)
