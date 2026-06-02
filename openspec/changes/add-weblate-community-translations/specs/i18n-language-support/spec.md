## ADDED Requirements

### Requirement: Language graduation threshold

A language SHALL only be added to the app's `SUPPORTED` array in `app/src/lib/i18n.js` when it has reached ≥ 80% translation completion in Weblate. With the current 580-key source (`locales/en.json`), that is ≥ 464 keys translated. Languages below this threshold SHALL remain in `locales/` (available in Weblate for contributor work) but SHALL NOT appear in the running application.

#### Scenario: Language reaches 80% in Weblate

- **WHEN** a language's completion percentage in Weblate reaches or exceeds 80%
- **THEN** the maintainer opens a PR that adds the language code to `SUPPORTED` in `i18n.js` and adds a `register()` call pointing to `locales/<lang>.json`
- **AND** after the PR is merged and `make docker-build` is run, the app resolves to that language for users whose browser reports it as their preferred language

#### Scenario: Language below threshold

- **WHEN** a locale file for a language exists in `locales/` but the language is below 80% completion
- **THEN** the app does NOT register or resolve to that language
- **AND** users with that browser language fall back to EN

### Requirement: Graduation threshold documented for contributors

The 80% graduation threshold SHALL be stated in the Weblate project description so translators understand when their work becomes visible in the production app.

#### Scenario: Translator checks project description

- **WHEN** a translator views the spieli project page on hosted.weblate.org
- **THEN** they can read that their language will be enabled in the app once it reaches 80% completion

### Requirement: EN is the authoritative source for new strings

When new UI strings are introduced, they SHALL be added to `locales/en.json` first. `locales/de.json` SHALL be updated in the same commit. Adding only to `de.json` without an EN counterpart is not permitted, as Weblate uses `locales/en.json` as the template.

#### Scenario: Developer adds a new UI string

- **WHEN** a developer adds a new translatable string to a Svelte component
- **THEN** the corresponding key is added to both `locales/en.json` and `locales/de.json` in the same commit
- **AND** Weblate detects the new EN key and marks it as needing translation in all registered languages
