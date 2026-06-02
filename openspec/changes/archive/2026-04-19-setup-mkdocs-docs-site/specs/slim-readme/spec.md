## ADDED Requirements

### Requirement: README is a concise landing page
`README.md` SHALL be reduced to approximately 150 lines and contain only: project one-liner, origin attribution, architecture diagram, tech stack table, quick install snippet, abbreviated configuration (top vars + link to full docs), local development (3 make commands), contributing one-liner with links, federation section, external services table, and license.

#### Scenario: README line count
- **WHEN** the updated README is rendered
- **THEN** it is no longer than 200 lines

#### Scenario: README contains no ToC
- **WHEN** the README is rendered on GitHub
- **THEN** there is no manually-maintained table of contents section (GitHub renders heading anchors automatically)

#### Scenario: Deep content links to docs
- **WHEN** a reader encounters the configuration, troubleshooting, or contributing sections
- **THEN** each section contains a link pointing to the corresponding docs site page

### Requirement: Glossary reference removed from README
The Glossary section SHALL be removed from `README.md` entirely, replaced by a single sentence linking to `docs/reference/glossary.md`.

#### Scenario: No glossary table in README
- **WHEN** `README.md` is rendered
- **THEN** it contains no table with tool/term definitions

#### Scenario: Glossary linked
- **WHEN** `README.md` is rendered
- **THEN** it contains at least one link to the docs glossary page

### Requirement: CONTRIBUTING.md at repo root
A `CONTRIBUTING.md` file SHALL exist at the repository root containing the full contributing workflow (issue → branch → change → commit → PR), branch naming convention, and commit message format.

#### Scenario: GitHub surfaces CONTRIBUTING.md
- **WHEN** a user opens a new issue or PR on GitHub
- **THEN** GitHub displays a link to `CONTRIBUTING.md`

#### Scenario: README Contributing section is brief
- **WHEN** `README.md` is rendered
- **THEN** the Contributing section is no longer than 5 lines and links to `CONTRIBUTING.md`

### Requirement: Deploy commands updated
All `docker compose` command examples in `README.md` SHALL include the `--profile` flag consistent with the deployment mode changes introduced in PR #118.

#### Scenario: No bare docker compose commands
- **WHEN** `README.md` is scanned for `docker compose` invocations
- **THEN** every invocation that starts services includes `--profile <mode>`
