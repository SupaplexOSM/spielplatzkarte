# Add a Sport Pitch Type

Playground maps often include sports pitches — football fields, basketball courts, skate parks, BMX tracks, and many more. Each pitch type is identified by the OSM `sport` tag on a `leisure=pitch` feature. Adding a new sport type means adding translations to both locale files so the equipment list renders a readable label instead of the raw OSM tag value.

## Step 1 — Find the OSM tag value

OSM uses the tag `sport=<value>` on `leisure=pitch` features. The full list of documented values is at:

- [wiki.openstreetmap.org/wiki/Key:sport](https://wiki.openstreetmap.org/wiki/Key:sport)
- [wiki.openstreetmap.org/wiki/Tag:leisure%3Dpitch](https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dpitch)

For example, a roller hockey rink uses `sport=roller_hockey`.

!!! tip "Finding pitches with a specific sport in OSM"
    Use [Overpass Turbo](https://overpass-turbo.eu) — search for `leisure=pitch` + `sport=roller_hockey` (replace with your value) to confirm the tag is used in the wild.

## Step 2 — Add the translation keys

Open `locales/en.json` and add a new entry under `equipment.pitches`:

```json
"pitches": {
  "soccer":        "Football pitch",
  "basketball":    "Basketball court",
  ...
  "roller_hockey": "Roller hockey rink"
}
```

The key must exactly match the OSM `sport` tag value (case-sensitive, underscores preserved).

Then open `locales/de.json` and add the German translation at the same path:

```json
"pitches": {
  "soccer":        "Bolzplatz",
  "basketball":    "Basketballfeld",
  ...
  "roller_hockey": "Rollhockeyfeld"
}
```

Both files must be updated — a key present in one but missing in the other will fall back to the raw OSM value in the missing language.

## Step 3 — Handle multi-value sport tags (no extra work needed)

OSM allows semicolon-separated multi-values on `sport` (e.g. `sport=cycling;bmx`). The equipment list automatically splits on `;`, translates each part using the keys above, and joins them with ` / `. Unknown values fall back to the raw OSM string. You only need to add the individual keys — no extra code changes are required.

## Step 4 — Verify locally

```bash
make dev
```

Open the app at `http://localhost:5173`, navigate to a playground that contains a pitch with your sport tag, and check the equipment list. The pitch should show your translated label instead of the raw tag value.

!!! tip "Finding a playground with a specific pitch"
    Use [Overpass Turbo](https://overpass-turbo.eu) to locate an OSM node or way with `leisure=pitch` and `sport=<your_value>`, note its coordinates, and navigate there in the app.

## Step 5 — Commit and open a PR

```bash
git checkout -b feat/add-roller-hockey-sport
git add locales/en.json locales/de.json
git commit -m "feat(i18n): add roller_hockey sport pitch translation"
git push -u origin feat/add-roller-hockey-sport
```

Then open a pull request on GitHub. See [CONTRIBUTING.md](https://github.com/mfuhrmann/spieli/blob/main/CONTRIBUTING.md) for the full PR walkthrough.
