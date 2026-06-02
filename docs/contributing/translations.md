# Translate spieli

spieli uses [hosted.weblate.org](https://hosted.weblate.org) for community translations. Translators work through a web UI — no GitHub account or knowledge of JSON is required.

## How translations reach the app

```
Translator edits strings       Weblate pushes commit         Maintainer merges PR
on hosted.weblate.org    →     to weblate-translations   →   into main
  (web UI, no GitHub)           branch on GitHub              → make docker-build
                                                               → live in app
```

Weblate batches translation saves and periodically pushes a commit to the `weblate-translations` branch. The maintainer opens a PR from `weblate-translations` → `main`, reviews the JSON diff, and merges. The next `make docker-build` bundles the updated locale files into the app.

Weblate never pushes directly to `main` — every translation update goes through a PR.

## Language graduation

A language becomes visible in the app only when it reaches **≥ 80% completion** (≥ 464 of 580 keys) in Weblate. Below that threshold the locale file exists in the repo and Weblate keeps improving it, but the running app ignores it — users with that browser language fall back to English.

When a language crosses the threshold:

1. Open a PR editing `app/src/lib/i18n.js`:
    - Add the language code to the `SUPPORTED` array
    - Add a `register()` call: `register('<lang>', () => import('../../../locales/<lang>.json'));`
2. Title the PR: `feat(i18n): add <Language> language support`
3. After merging, run `make docker-build` — users with that browser language now see the app in their language

## Adding new UI strings (developer workflow)

New translatable strings **must** be added to `locales/en.json` first. `locales/de.json` must be updated in the **same commit**. Adding a key only to `de.json` breaks Weblate — it uses `locales/en.json` as the source template and won't surface keys that are absent from it.

Keys follow the existing nested structure. Plural strings use ICU inline format:

```json
"deviceCount": "{count, plural, one {# piece of equipment} other {# pieces of equipment}}"
```

When you add a new key, Weblate automatically marks it as needing translation in all registered languages.

## Weblate component settings

The `.weblate.yml` file in the repo root documents the intended component configuration for the manual setup step. Key settings:

| Setting | Value |
|---|---|
| File format | `json-nested` |
| File mask | `locales/*.json` |
| Source template | `locales/en.json` |
| Source language | `en` |
| Push branch | `weblate-translations` |

ICU plural strings appear as a single field in the Weblate editor. Translators write the full ICU expression for their language — Weblate's built-in checks catch syntax errors.
