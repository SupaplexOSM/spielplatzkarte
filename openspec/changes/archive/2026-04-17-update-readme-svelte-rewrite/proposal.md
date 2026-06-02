## Why

The frontend was rewritten from vanilla JavaScript to Svelte 5 + Tailwind CSS 4, the Hub was merged into the main repo as a dual-mode app, and the file structure changed significantly — but the README still describes the old codebase, making it misleading for contributors and deployers.

## What Changes

- Update the **Tech Stack** table: language → Svelte 5, add Tailwind CSS 4 and lucide-svelte
- Fix the **How-to: Add a playground device** guide: `js/objPlaygroundEquipment.js` → `app/src/lib/objPlaygroundEquipment.js`
- Fix or deprecate the **How-to: Edit UI strings / add a language** guide: `js/i18n.js` no longer exists; i18next is a declared dependency but not imported anywhere in the Svelte source — the how-to is currently invalid
- Update the **Federation** section: the Hub is no longer a separate repo; it is built into the same Svelte app and toggled via `APP_MODE=hub`
- Update the **Configuration reference**: add `APP_MODE`, `GEOSERVER_URL`, `GEOSERVER_WORKSPACE`, `HUB_POLL_INTERVAL`; remove or annotate variables that only apply to one mode
- Add a brief mention of new top-level directories: `processing/`, `taginfo/`, `oci/`
- Mention `compose.prod.yml` alongside `compose.yml` in the local-dev section
- Update the **Glossary**: add Svelte, Tailwind; update the "Language" entry

## Capabilities

### New Capabilities

- `readme-accuracy`: The README correctly describes the current codebase — tech stack, file paths, configuration, and architecture

### Modified Capabilities

*(none — this is a documentation-only change; no existing spec files to delta)*

## Impact

- `spielplatzkarte/README.md` — primary file changed
- No code changes; documentation only
- The i18n how-to may need to note that multi-language support is not yet re-implemented in the Svelte rewrite (requires investigation before writing)
