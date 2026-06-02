## 1. README — Structure & Navigation

- [x] 1.1 Add an anchor-linked table of contents at the top of README.md covering all major sections
- [x] 1.2 Add a Glossary section defining: Docker, Docker Compose, Vite, Node.js, PostgREST, PostgreSQL, PostGIS, osm2pgsql, OpenLayers, i18next, Overpass API, OpenStreetMap, nginx, PBF file, OSM relation ID

## 2. README — How It Works

- [x] 2.1 Add a "How the data flows" section with an ASCII diagram showing browser → nginx → PostgREST → PostgreSQL (production) and the Overpass fallback path (local dev without a database)
- [x] 2.2 Add a short narrative (3–5 sentences) below the diagram explaining why each component exists in plain language

## 3. README — How-To: Add a Playground Device

- [x] 3.1 Write a numbered guide for adding a new device type: how to find the OSM tag, how to add an entry to `objDevices` in `js/objPlaygroundEquipment.js` with all fields explained
- [x] 3.2 Explain how to find a Wikimedia Commons image and use the `File:` filename in the `image` field
- [x] 3.3 Explain how to verify the change locally (`make dev`, open a playground with that device, check the detail panel)

## 4. README — How-To: Edit Translations / Add a Language

- [x] 4.1 Write a numbered guide for finding and editing an existing UI string in `locales/*.json`, including how to use the `?lang=xx` URL parameter to test it
- [x] 4.2 Write the steps for adding a completely new language (copy `en.json`, translate, register in `js/i18n.js`) with a note on plural forms

## 5. README — Troubleshooting

- [x] 5.1 Add a Troubleshooting section with symptom + fix entries for: port 8080 in use, import fails/exits immediately, map loads but shows no playgrounds, geolocation button does nothing on mobile, dev server changes don't appear, `make lan-url` can't detect IP

## 6. README — Contributing

- [x] 6.1 Add a Contributing section with step-by-step instructions: create branch (naming convention), make change, test locally, conventional commit message, push, open PR on GitHub

## 7. Code Comments — objPlaygroundEquipment.js

- [x] 7.1 Add a top-of-file block comment explaining the purpose of `objDevices` and `objFeatures`, every field in a device entry with its effect and what happens when omitted, and how the `image` field and Commons/OSM-wiki fallback work

## 8. Code Comments — main.js

- [x] 8.1 Add a top-of-file block comment explaining the entry-point role, which modules are wired here, and the initialisation order
- [x] 8.2 Add section comments to each logical block within the file explaining why that section exists

## 9. Code Comments — selectPlayground.js

- [x] 9.1 Add a top-of-file block comment explaining what "selecting a playground" entails (URL hash, feature highlight, panel state), the three mobile panel states, and the `showAttributes` contract
- [x] 9.2 Add inline comments to the drag handler functions explaining the non-obvious choices (e.g. why `window.innerHeight` is used instead of `element.offsetHeight`)
