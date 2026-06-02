## Context

The README was written for the original vanilla-JS version of spielplatzkarte. Since then, the frontend was fully rewritten in Svelte 5, the Hub was merged into the main repo as a dual-mode Vite app, and several new directories and env vars were added. The README now contradicts the actual codebase in multiple places.

Current state of inaccuracies:
- Tech stack table says "JavaScript (ES Modules)" and "Bootstrap 5" — reality is Svelte 5 + Bootstrap 5 + Tailwind CSS 4
- Two how-to guides reference paths that no longer exist (`js/` directory was removed)
- The i18n how-to references `js/i18n.js` and a language-registration step — i18next is in `package.json` but is **not imported anywhere** in the Svelte source; strings appear hardcoded in German
- Federation section describes the Hub as a separate repository; it is now in `app/src/hub/` toggled by `APP_MODE`
- Config table is missing `APP_MODE`, `GEOSERVER_URL`, `GEOSERVER_WORKSPACE`, `HUB_POLL_INTERVAL`
- New directories (`processing/`, `taginfo/`, `oci/`) are unmentioned

## Goals / Non-Goals

**Goals:**
- README accurately describes the current tech stack, file paths, and architecture
- How-to guides point to files that exist
- Config reference is complete
- Contributors are not misled about how i18n works (or doesn't yet work) in the Svelte rewrite

**Non-Goals:**
- Re-implementing i18n in the Svelte app (that is a separate engineering task)
- Documenting every internal file — the README is for deployers and contributors, not code archaeology
- Updating the Hub's own `README.md` (separate repo)

## Decisions

### Decision: Note i18n as "not yet ported" rather than removing the how-to

The existing how-to guide is invalid because `js/i18n.js` does not exist. However, the `locales/*.json` files still exist and the intent is presumably to re-integrate i18next. The clearest honest approach is to update the guide to reflect current reality: strings are currently hardcoded in German in the Svelte components; multi-language support via i18next is planned but not yet implemented. The `locales/` files are preserved for when it is.

Alternative considered: Delete the "Add a language" section entirely. Rejected — it would lose useful context about the intended i18n approach and make contributions harder once it's re-implemented.

### Decision: Describe `APP_MODE` in both the Config reference and the Federation section

`APP_MODE` controls whether the app runs as a regional standalone or as a Hub. It belongs in the config table (with valid values `standalone` | `hub`) AND in the Federation section (which currently wrongly points to a separate repo).

### Decision: Keep new-directory mentions brief

`processing/`, `taginfo/`, and `oci/` don't need their own sections. A sentence in the "How the data flows" or "Contributing" section noting their existence is sufficient.

## Risks / Trade-offs

- **i18n status may be misrepresented** → Mitigation: Before writing the how-to update, verify in the Svelte source that i18next is genuinely unused (already confirmed: no `from 'i18next'` import anywhere in `app/src/`).
- **Config table may have more gaps** → Mitigation: Cross-check `compose.yml` env vars, `.env.example`, and `config.js` exports before writing the updated table.
- **README may drift again** → No mitigation in scope; this is a one-time sync.

## Open Questions

- Should `GEOSERVER_URL` and `GEOSERVER_WORKSPACE` appear in `.env.example` too, or only in the README config reference? (Currently in `config.js` defaults but not in `.env.example` or compose env block — may be intentionally omitted as an advanced/optional feature.)
