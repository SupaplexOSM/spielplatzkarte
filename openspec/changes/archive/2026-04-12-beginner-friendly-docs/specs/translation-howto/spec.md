## ADDED Requirements

### Requirement: Translation editing how-to guide
The README SHALL include a numbered tutorial explaining how to edit an existing UI string and how to add a new language, written for someone who has never worked with JSON or i18next before.

The guide MUST cover:
1. Where all UI strings live (`locales/*.json`) and how the file structure maps to the UI
2. How to find the key for a string they want to change (browser dev tools or search in `locales/de.json`)
3. How to edit a value safely (valid JSON: commas, quotes)
4. How to test the change locally (`make dev`, `?lang=xx` URL parameter)
5. How to add a completely new language: copy `locales/en.json`, translate, register in `js/i18n.js`
6. A note about plural forms for languages like Polish/Ukrainian

#### Scenario: Non-developer fixes a typo in the German UI
- **WHEN** a contributor follows the guide to find and fix a typo in the German translation
- **THEN** they open `locales/de.json`, find the key, edit the value, and verify the fix in the browser without touching any other file

#### Scenario: Community member adds Romanian
- **WHEN** a Romanian speaker follows the "add a new language" steps
- **THEN** they produce a valid `locales/ro.json` and a correct `js/i18n.js` registration without needing to understand how i18next works internally
