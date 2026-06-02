## Why

spieli's UI is fully localised in DE and EN, but no other language is active in the app. The OSM community is global — connecting spieli to hosted.weblate.org puts it in front of community translators and raises project visibility, turning translation into a self-service activity that runs without developer involvement. The two prerequisite blockers (#249 project rename, #157 svelte-i18n epic) are both closed: setup can begin now.

## What Changes

- Add `.weblate.yml` to the repo root so hosted.weblate.org auto-discovers the translation component
- Register spieli on hosted.weblate.org (free OSS tier) linked to the GitHub repo via webhook
- Clean up stale plural-suffix keys (`_one`, `_few`, `_other`) from the ten partial locale files — these predate the ICU-inline format and would appear as untranslatable noise in Weblate
- Configure Weblate to use EN as the source language and `json-i18n` file format (ICU-plural-aware)
- Set the push branch to `weblate-translations`; all translation PRs go through maintainer review before reaching `main`
- Document the language graduation threshold (≥ 80% completion) in the Weblate project description

## Capabilities

### New Capabilities

- `weblate-integration`: Weblate component config, repo webhook, push-branch PR workflow, and partial-locale cleanup

### Modified Capabilities

- `i18n-language-support`: graduation threshold clarified — 80% of 580 keys (~464) needed before a language is added to `SUPPORTED` in `i18n.js`; EN is the authoritative source for new strings

## Impact

- **New file**: `.weblate.yml` in repo root
- **Modified files**: `locales/cs.json`, `es.json`, `fr.json`, `it.json`, `ja.json`, `nl.json`, `pl.json`, `pt.json`, `sv.json`, `uk.json` — remove 15 stale `_one`/`_few`/`_other` plural keys each
- **`app/src/lib/i18n.js`**: updated when languages graduate (one-time per language, maintainer-triggered)
- **External dependency**: hosted.weblate.org account and project setup (one-time manual step)
- **No changes** to `locales/en.json`, `locales/de.json`, or the JSON translation format
