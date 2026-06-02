## Context

spieli uses `svelte-i18n` with nested JSON files in `locales/`. DE and EN are complete at 580 keys each. Ten additional locale files (cs, es, fr, it, ja, nl, pl, pt, sv, uk) exist from a previous attempt — they cover 15–19% of current strings and each contains 15 stale plural-suffix keys (`_one`, `_few`, `_other`) that predate the current ICU-inline plural format.

Current state of partial locales vs. what Weblate would see:

```
cs/es/fr/…  ████░░░░░░░░░░░░░░░░  ~17% of 580 keys
             + 15 orphaned _one/_few/_other keys
               (no match in en.json → Weblate imports as noise)
```

After cleanup: 89–94 valid keys per language remain. These are genuinely useful as a translator starting point for the app-shell strings (search, filters, nav, completeness), even though the large equipment vocabulary sections are blank.

Both blocking prerequisites are resolved: #249 (project rename to "spieli") and #157 (svelte-i18n re-integration) are closed.

## Goals / Non-Goals

**Goals:**
- Enable community translation contributions via a Weblate web UI — no GitHub access required
- Keep translation PRs in the maintainer's review queue — no direct pushes to `main`
- Import existing partial locale files as starting points with minimal friction
- Provide a clear threshold for when a new language goes live in the app
- Raise spieli's profile in the OSM translator community

**Non-Goals:**
- Pre-populating the equipment vocabulary sections from external data sources (OSM wiki, iD translations) — valuable but out of scope; that's a future bootstrap task
- Automated language promotion — adding to `SUPPORTED` stays a manual maintainer step
- Self-hosted Weblate infrastructure
- Changing the JSON translation format or ICU syntax

## Decisions

### 1. EN as Weblate source language (not DE)

`locales/en.json` is the Weblate template; translators work from English. The vast majority of hosted.weblate.org translators work from EN. Using DE as source would require knowledge of German grammar for e.g. Japanese or Czech contributors. Maintainer keeps DE in sync manually, as today.

### 2. hosted.weblate.org, free OSS tier

spieli qualifies as libre open-source. Zero infrastructure. Weblate handles GitHub webhook integration, translation memory, machine translation suggestions, and quality checks. No self-hosting burden.

### 3. `json-i18n` file format

`locales/*.json` uses ICU message format for plurals (`{count, plural, one {# bench} other {# benches}}`). Weblate's `json-i18n` format understands ICU syntax and presents plural forms as separate fields. Plain `json-nested` treats ICU strings as opaque — wrong for this format.

### 4. Clean up stale plural keys before import

The 15 `_one`/`_few`/`_other` keys in each partial locale are from an older format where plural forms were separate keys. They have no counterpart in `en.json`. Weblate would import them as untranslatable orphans. Strip them from all ten files before the Weblate component is connected.

The valid residual content (89–94 keys per language) is worth keeping — these cover the app-shell strings (search, navigation, completeness labels, info panel) that translators encounter first.

### 5. Push to dedicated branch, merge via PR

Weblate pushes commits to `weblate-translations`. PR to `main` for maintainer review. Matches the project's "never push directly to main" policy. Weblate's GitHub integration can open PRs automatically, or the maintainer creates them manually.

### 6. 80% completion threshold for language graduation

A language is added to `SUPPORTED` in `i18n.js` only when it reaches ≥ 80% translated in Weblate. With 580 keys, 80% = 464 keys. This is more work than the original estimate (~256 keys at the old 320-key count), but the quality bar is correct: below 80%, the equipment vocabulary sections would be largely untranslated and the app experience would be jarring.

The threshold is documented in the Weblate project description. Translator motivation: Weblate shows percentage bars and activity badges — reaching 80% is a visible milestone.

### 7. Developer workflow: EN first, DE in same commit

When a new string is added, `en.json` is updated first, `de.json` in the same commit. Weblate detects the new EN key and surfaces it to all language translators immediately. Adding to `de.json` only without an EN counterpart breaks the source → translation chain.

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|---|---|---|
| Stale keys missed during cleanup — Weblate imports orphans | Low | Python script to diff `locales/*.json` against `en.json` before connecting |
| EN/DE sync drift — new strings added only to `de.json` | Medium | Dev workflow documented; CI lint rule possible future addition |
| ICU plural complexity confuses translators | Low | Weblate surfaces plural forms as separate fields with language-specific plural rules; most common case (one/other) needs no explanation |
| Weblate PR flood during active translation periods | Low | Weblate squash-commits option; batch push delay setting |
| 80% threshold feels too high for minority languages with few speakers | Low–Medium | Threshold can be lowered per-language by maintainer; documented as guidance not hard policy |
| `.weblate.yml` format drift between Weblate versions | Low | Verify exact schema against hosted.weblate.org docs at setup time |
