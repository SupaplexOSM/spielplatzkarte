## ADDED Requirements

### Requirement: Partial locale files cleaned of stale plural-suffix keys before Weblate import

Before connecting hosted.weblate.org to the repository, all ten partial locale files (cs, es, fr, it, ja, nl, pl, pt, sv, uk) SHALL have their 15 stale `_one`/`_few`/`_other` plural-suffix keys removed. These keys are from a prior plural format and have no counterpart in `locales/en.json`; Weblate would import them as untranslatable orphans.

#### Scenario: Weblate imports a cleaned partial locale

- **WHEN** Weblate imports `locales/cs.json` after cleanup
- **THEN** every key in `cs.json` matches a key in `locales/en.json`
- **AND** no untranslatable orphan keys appear in the Weblate component

### Requirement: Weblate component discovery file

The repository SHALL contain a `.weblate.yml` file in the root that configures Weblate component auto-discovery with the following settings: file format `json-i18n`, file mask `locales/*.json`, template `locales/en.json`, source language `en`, push branch `weblate-translations`.

#### Scenario: Weblate reads component config on connect

- **WHEN** hosted.weblate.org connects to the GitHub repository
- **THEN** it discovers the translation component automatically from `.weblate.yml` without manual UI configuration of file paths or format

### Requirement: Translation updates arrive as PRs, never direct pushes

The Weblate component SHALL be configured to push translation commits to a branch named `weblate-translations` rather than directly to `main`. A pull request from `weblate-translations` to `main` SHALL be opened for maintainer review before any translation strings reach production.

#### Scenario: Translator completes strings in Weblate UI

- **WHEN** a translator saves one or more translated strings in the Weblate web UI
- **THEN** Weblate eventually pushes a commit to the `weblate-translations` branch
- **AND** a pull request from `weblate-translations` to `main` is opened (manually or via Weblate's GitHub PR integration)
- **AND** no translation change reaches `main` without maintainer review

#### Scenario: Maintainer merges translation PR

- **WHEN** the maintainer merges a PR from `weblate-translations` into `main`
- **THEN** the updated `locales/*.json` files are bundled into the next Docker build
- **AND** the changes become visible in the live app after `make docker-build`

### Requirement: Existing locale files preserved as starting points (after cleanup)

After the stale-key cleanup (see above), the remaining valid keys in the ten partial locale files SHALL be retained and imported by Weblate. They cover the app-shell strings (search, navigation, completeness labels, info panel) and give translators a non-blank starting point.

#### Scenario: Community translator opens an existing language

- **WHEN** a translator opens e.g. the French component in Weblate
- **THEN** they see ~99 pre-filled translations covering core UI strings
- **AND** they can review, correct, and complete the remaining strings rather than starting from blank

### Requirement: ICU plural forms presented correctly in Weblate UI

The `json-i18n` format MUST be used (not `json-nested`) so that Weblate presents ICU plural strings as separate form fields per plural rule, not as a single opaque string.

#### Scenario: Translator handles a plural string

- **WHEN** a translator opens a key containing `{count, plural, one {...} other {...}}`
- **THEN** Weblate presents separate input fields for each plural form defined by the target language's plural rules
- **AND** the translator does not need to write raw ICU syntax manually
