## Workflow

Create one GitHub issue per numbered group below, one branch per issue, and open a PR when the group is complete.

## 1. Tech Stack and Glossary

- [x] 1.1 Update Tech Stack table: change Language row to "Svelte 5 (ES Modules)", update UI framework row to include Tailwind CSS 4, add lucide-svelte row
- [x] 1.2 Add Svelte and Tailwind to the Glossary table with one-line descriptions

## 2. How-to: Add a Playground Device

- [x] 2.1 Update every file path reference from `js/objPlaygroundEquipment.js` to `app/src/lib/objPlaygroundEquipment.js`
- [x] 2.2 Update any other `js/` path references in the same section (e.g. commit example, verification step)

## 3. How-to: Edit UI Strings / Add a Language

- [x] 3.1 Remove the step that instructs editing `js/i18n.js` (file does not exist)
- [x] 3.2 Add a note at the top of the section stating that multi-language support is not yet integrated in the Svelte rewrite; `locales/` files are preserved for future use
- [x] 3.3 Keep the `locales/*.json` editing guidance (still valid as reference / future-ready)

## 4. Federation Section

- [x] 4.1 Rewrite the Federation section to describe the merged Hub: same codebase, `APP_MODE=hub` env var, same `compose.yml`
- [x] 4.2 Remove or update the reference to the Hub as a separate repository
- [x] 4.3 Note that the Hub's `get_playgrounds` / `get_meta` API contract between instances is unchanged

## 5. Configuration Reference

- [x] 5.1 Add `APP_MODE` row (values: `standalone` | `hub`, default: `standalone`)
- [x] 5.2 Add `GEOSERVER_URL` row (optional; enables shadow WMS layer; leave empty to disable)
- [x] 5.3 Add `GEOSERVER_WORKSPACE` row (default: `spielplatzkarte`; only used when `GEOSERVER_URL` is set)
- [x] 5.4 Add `HUB_POLL_INTERVAL` row (seconds between Hub re-fetches; default: `300`; only used in hub mode)
- [x] 5.5 Annotate rows with a mode indicator where relevant (e.g. "hub mode only", "standalone only")

## 6. Local Development Section

- [x] 6.1 Update the `make install` description to note it installs both the root (Playwright) and `app/` (Svelte) packages
- [x] 6.2 Mention `compose.prod.yml` alongside `compose.yml` with a one-line description of when to use it

## 7. New Directories

- [x] 7.1 Add a brief mention of `processing/` (OSM data pipeline scripts) and `taginfo/` (taginfo metadata) in the Contributing section or project structure description
- [x] 7.2 Add a mention of `oci/` (Docker build contexts for app and data-node containers) near the Docker/deployment section
