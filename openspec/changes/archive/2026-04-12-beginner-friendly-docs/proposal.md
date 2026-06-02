## Why

The project is technically solid but its documentation assumes familiarity with Docker, Node.js, Git, and OpenStreetMap concepts — meaning anyone who didn't write the code cannot realistically get it running, extend it, or maintain it. Making the docs genuinely beginner-friendly turns the project from a personal tool into something a wider community can operate and contribute to.

## What Changes

- Rewrite the README into a structured, beginner-oriented guide: what every tool is, why it exists, and what to do when something goes wrong
- Add a **Glossary** section explaining Docker, Vite, PostgREST, osm2pgsql, OpenLayers, i18next, Overpass, and OSM in plain language
- Add a **"How to add a new playground device"** guide explaining `objPlaygroundEquipment.js` and the full round-trip: OSM tag → JS object → detail panel
- Add a **"How to change or add a UI string / translation"** guide covering the `locales/*.json` workflow
- Add a **"How the data flows"** narrative diagram section: phone → nginx → PostgREST → PostgreSQL, and the reverse path from Overpass during dev
- Add a **"Troubleshooting"** section covering the most common failure modes (port in use, import stuck, geolocation blocked, map blank)
- Add inline code comments to the most complex / entry-point JS files (`main.js`, `selectPlayground.js`, `objPlaygroundEquipment.js`) to make them self-teaching
- Add a **"Contributing"** section with a step-by-step PR walkthrough (branch → code → test locally → push → PR)

## Capabilities

### New Capabilities

- `readme-beginner-guide`: Expanded README with glossary, data-flow narrative, troubleshooting, and contributing sections
- `device-howto`: Step-by-step guide for adding a new playground device type (OSM tag to rendered detail panel)
- `translation-howto`: Guide for editing existing translations and adding a new language
- `code-comments`: Inline comments in key JS entry-point files making them self-explanatory for newcomers

### Modified Capabilities

## Impact

- `README.md` — substantially expanded (primary deliverable)
- `js/objPlaygroundEquipment.js` — add explanatory block comments
- `js/main.js` — add section comments explaining module wiring
- `js/selectPlayground.js` — add comments on the panel state machine and URL hash handling
- No runtime behaviour changes; documentation and comments only
