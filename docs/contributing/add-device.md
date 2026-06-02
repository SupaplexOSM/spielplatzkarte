# Add a Playground Device

Every playground device that OSM records — slides, swings, climbing frames, balance beams — is defined in one place: `app/src/lib/objPlaygroundEquipment.js`. Adding support for a new device type is a small, self-contained change.

## Step 1 — Find the OSM tag

OSM uses the tag `playground=<value>` to describe individual devices. The full list of documented values is at [wiki.openstreetmap.org/wiki/Key:playground](https://wiki.openstreetmap.org/wiki/Key:playground).

For example, a balance beam is `playground=balance_beam`.

## Step 2 — Add an entry to `objDevices`

Open `app/src/lib/objPlaygroundEquipment.js` and add a new key to the `objDevices` object. Copy an existing entry as a template:

```js
balance_beam: {
    name_de: "Balancierbalken",
    image: "File:Playground balance beam.jpg",
    category: "stationary",
    filterable: false,
},
```

**Field reference:**

| Field | Required | Description |
|---|---|---|
| `name_de` | Yes | German display name shown in the detail panel |
| `image` | No | Wikimedia Commons filename for an example photo (see Step 3). Omit if no good image exists. |
| `category` | No | Groups the device in the filter panel. Values: `stationary`, `structure_parts`, `active`. Omit to leave ungrouped. |
| `filterable` | No | Set to `true` to make this device type appear as a filter option in the sidebar. |
| `filter_attr` | No | Array of OSM sub-attributes to show as filter controls, e.g. `["length", "height"]`. Only meaningful when `filterable: true`. |

## Step 3 — Find a Wikimedia Commons image

1. Go to [commons.wikimedia.org](https://commons.wikimedia.org) and search for the device name in English.
2. Find a clear, representative photo.
3. On the image page, copy the filename — it starts with `File:` (e.g. `File:Playground balance beam.jpg`).
4. Paste that filename as the `image` value in your entry.

If you can't find a suitable image, omit the `image` field. No broken icon will appear.

## Step 4 — Verify locally

```bash
make dev
```

Open the app at `http://localhost:5173`, navigate to a playground that has the device, and expand its entry in the equipment list. You should see the German name, the example image, and any attributes.

!!! tip "Finding a playground with a specific device"
    Use [Overpass Turbo](https://overpass-turbo.eu) — search for `playground=balance_beam` (replace with your tag value) to locate playgrounds that have it mapped.

## Step 5 — Commit and open a PR

```bash
git checkout -b feat/add-balance-beam-device
git add app/src/lib/objPlaygroundEquipment.js
git commit -m "feat: add balance_beam playground device"
git push -u origin feat/add-balance-beam-device
```

Then open a pull request on GitHub. See [CONTRIBUTING.md](https://github.com/mfuhrmann/spieli/blob/main/CONTRIBUTING.md) for the full PR walkthrough.
