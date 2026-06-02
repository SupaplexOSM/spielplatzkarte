## ADDED Requirements

### Requirement: MkDocs site builds locally
The repository SHALL include a `docs/` directory, `mkdocs.yml`, and `docs/requirements.txt` sufficient to build and serve the documentation site locally using `make docs-serve`.

#### Scenario: Local preview
- **WHEN** a developer runs `make docs-install` then `make docs-serve`
- **THEN** a live-reload server starts at `http://localhost:8000` showing the full docs site

#### Scenario: Clean build
- **WHEN** a developer runs `make docs-build`
- **THEN** a static site is generated in `site/` with no errors in strict mode

### Requirement: Makefile docs targets
The Makefile SHALL include four targets: `docs-install`, `docs-serve`, `docs-build`, `docs-clean`.

#### Scenario: Install target creates virtualenv
- **WHEN** `make docs-install` is run
- **THEN** a `.venv` directory is created and all packages from `docs/requirements.txt` are installed into it

#### Scenario: Clean target removes artifacts
- **WHEN** `make docs-clean` is run
- **THEN** the `site/` directory and `.venv` are removed

### Requirement: GitHub Pages deployment on main push
A GitHub Actions workflow SHALL deploy the docs site to GitHub Pages on every push to `main` that touches `docs/**` or `mkdocs.yml`, and on manual dispatch.

#### Scenario: Automatic deploy on docs change
- **WHEN** a commit touching `docs/` or `mkdocs.yml` is pushed to `main`
- **THEN** the workflow runs, builds the site, and pushes it to the `gh-pages` branch

#### Scenario: Manual deploy trigger
- **WHEN** the workflow is triggered via `workflow_dispatch`
- **THEN** the site is built and deployed regardless of which files changed

### Requirement: Material theme with search and edit links
The docs site SHALL use the MkDocs Material theme with full-text search enabled and an edit button on every page linking to the source file on GitHub.

#### Scenario: Search returns relevant results
- **WHEN** a visitor types "PBF" in the search box
- **THEN** the glossary entry for PBF file appears in results

#### Scenario: Edit link points to correct file
- **WHEN** a visitor clicks the edit button on any docs page
- **THEN** they are taken to the corresponding `.md` file in the `docs/` directory on GitHub

### Requirement: Navigation covers all extracted content
The docs site SHALL include pages for: quick start, manual deploy, configuration reference, troubleshooting, add-device how-to, architecture reference, tech stack, federation, and glossary.

#### Scenario: All nav items resolve
- **WHEN** every navigation item in `mkdocs.yml` is followed
- **THEN** it renders a page with content (no 404s, no empty pages)

### Requirement: Glossary contains only OSM-specific terms
`docs/reference/glossary.md` SHALL define exactly the following terms and no others: OSM relation ID, PBF file, osm2pgsql, PostgREST, Overpass Turbo.

#### Scenario: Generic tool terms absent
- **WHEN** the glossary page is rendered
- **THEN** it does not contain entries for Docker, nginx, PostgreSQL, Vite, Node.js, Svelte, Tailwind, or OpenLayers

#### Scenario: OSM terms present
- **WHEN** the glossary page is rendered
- **THEN** it contains definitions for OSM relation ID, PBF file, osm2pgsql, PostgREST, and Overpass Turbo
