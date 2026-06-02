## ADDED Requirements

### Requirement: Tech stack table reflects current framework
The README tech stack table SHALL list Svelte 5 as the UI framework/language, include Tailwind CSS 4 as a styling dependency, and include lucide-svelte as an icon library.

#### Scenario: Reader checks language entry
- **WHEN** a contributor reads the Tech Stack table
- **THEN** the Language row SHALL say "Svelte 5 (ES Modules)" or equivalent (not "JavaScript (ES Modules)")

#### Scenario: Reader checks UI framework entry
- **WHEN** a contributor reads the Tech Stack table
- **THEN** the UI framework row SHALL mention both Bootstrap 5 and Tailwind CSS 4

### Requirement: How-to device guide references correct file path
The "How-to: Add a playground device" guide SHALL reference `app/src/lib/objPlaygroundEquipment.js` as the file to edit.

#### Scenario: Reader follows the device how-to
- **WHEN** a contributor opens the file path shown in the how-to
- **THEN** the file SHALL exist at that path in the repository

### Requirement: How-to language guide reflects i18n status
The "How-to: Edit UI strings / add a language" section SHALL accurately describe the current state of i18n in the Svelte rewrite. Since i18next is not yet integrated into the Svelte source, the guide SHALL note that multi-language support is not yet implemented and that the `locales/` files are preserved for a future re-integration.

#### Scenario: Reader wants to add a translation
- **WHEN** a contributor reads the language how-to
- **THEN** they SHALL understand that translations are not currently loaded by the Svelte app and that contributing a translation requires waiting for the i18n integration to be completed

#### Scenario: Step referencing js/i18n.js is removed
- **WHEN** a contributor reads the language how-to
- **THEN** there SHALL be no instruction to edit `js/i18n.js` (that file does not exist)

### Requirement: Federation section describes the merged Hub
The Federation section SHALL describe that the Hub functionality is built into the same codebase as the standalone app, toggled by the `APP_MODE` environment variable, rather than pointing to a separate repository.

#### Scenario: Reader wants to run the Hub
- **WHEN** a reader follows the Federation section
- **THEN** they SHALL find instructions that reference `APP_MODE=hub` and the same `compose.yml`

### Requirement: Configuration reference is complete
The configuration reference table SHALL include all variables present in `compose.yml` and `config.js`, including `APP_MODE`, and SHALL document which variables apply to which mode (standalone / hub / both).

#### Scenario: Deployer looks up APP_MODE
- **WHEN** a deployer reads the Configuration reference
- **THEN** they SHALL find `APP_MODE` with valid values `standalone` and `hub` and a description of what each does

#### Scenario: Deployer looks up GeoServer variables
- **WHEN** a deployer reads the Configuration reference
- **THEN** they SHALL find `GEOSERVER_URL` and `GEOSERVER_WORKSPACE` with descriptions noting they are optional and enable the shadow WMS layer
