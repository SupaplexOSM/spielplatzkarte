## ADDED Requirements

### Requirement: Contributor guide for adding new sport types
The docs SHALL include a guide at `docs/contributing/add-sport-type.md` that explains how to add support for a new OSM sport pitch type, mirroring the structure of the existing `docs/contributing/add-device.md`.

#### Scenario: Guide covers all required steps
- **WHEN** a contributor wants to add a new sport type
- **THEN** the guide SHALL cover: finding the OSM tag value, adding the i18n key to both locale files, verifying locally, and opening a PR

#### Scenario: Guide links to OSM resources
- **WHEN** a contributor reads the guide
- **THEN** the guide SHALL link to the relevant OSM wiki page for `leisure=pitch` and `Key:sport`

#### Scenario: Guide includes translation guidance
- **WHEN** a contributor adds a new sport key
- **THEN** the guide SHALL explain that both `locales/en.json` and `locales/de.json` must be updated, and show the exact path of the key (`equipment.pitches.<sport_value>`)
