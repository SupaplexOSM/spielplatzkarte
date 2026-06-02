## 1. Locale Cleanup (repo-side, before Weblate connects)

- [ ] 1.1 Strip the 15 stale `_one`/`_few`/`_other` plural-suffix keys from each of the ten partial locale files (cs, es, fr, it, ja, nl, pl, pt, sv, uk) — these predate the ICU-inline plural format and have no counterpart in `en.json`
- [ ] 1.2 Verify no partial locale file contains keys absent from `en.json` (run a diff script: `python3 -c "..."` comparing leaves of each locale against en.json)
- [ ] 1.3 Commit cleanup as `chore(i18n): remove stale plural-suffix keys from partial locales`

## 2. Weblate Account & Project Setup (manual, external)

- [ ] 2.1 Register on hosted.weblate.org — create project named "spieli" (libre OSS plan, free)
- [ ] 2.2 Connect the GitHub repo to Weblate via deploy key and webhook (Weblate guided setup in project settings)
- [ ] 2.3 Set the Weblate project description to include the graduation threshold: "Languages are enabled in the app once they reach ≥ 80% completion"

## 3. Repository Config

- [ ] 3.1 Add `.weblate.yml` to repo root with: file format `json-i18n`, file mask `locales/*.json`, template `locales/en.json`, source language `en`, push branch `weblate-translations`
- [ ] 3.2 Verify Weblate detects the component automatically from `.weblate.yml` after connecting (check Weblate component list — should appear without manual path configuration)
- [ ] 3.3 Confirm Weblate imports all twelve locale files including the cleaned-up partial translations

## 4. Weblate Component Configuration

- [ ] 4.1 Set push branch to `weblate-translations` in Weblate component settings (if not already set from `.weblate.yml`)
- [ ] 4.2 Enable "Squash commits" in Weblate settings to keep PR history clean
- [ ] 4.3 Verify ICU plural strings (e.g. `equipment.deviceCount`) appear as separate plural-form fields in the Weblate editor, not as a single raw ICU string
- [ ] 4.4 Enable machine translation suggestions (LibreTranslate or DeepL if available on OSS tier) to help bootstrap the equipment vocabulary sections

## 5. PR Workflow Verification

- [ ] 5.1 Make a test translation change in Weblate and confirm it pushes to `weblate-translations` branch (not `main`)
- [ ] 5.2 Confirm a PR from `weblate-translations` → `main` can be opened and merged following the normal review workflow
- [ ] 5.3 After merging the test PR, confirm the updated locale file is present in `main` and `make docker-build` picks it up correctly

## 6. Developer Workflow Documentation

- [ ] 6.1 Add a note to `CLAUDE.md` (or a `docs/contributing.md`): new strings go to `en.json` first, then `de.json` in the same commit — never `de.json` only
- [ ] 6.2 Document language graduation process: when a language hits ≥ 80% in Weblate, open a PR adding it to `SUPPORTED` in `app/src/lib/i18n.js` with a `register()` call targeting `locales/<lang>.json`
- [ ] 6.3 Close legacy sub-issues #264–#268 (superseded by this epic #348)
