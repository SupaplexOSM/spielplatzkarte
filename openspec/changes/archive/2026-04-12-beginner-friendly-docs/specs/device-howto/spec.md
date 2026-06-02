## ADDED Requirements

### Requirement: Add-a-device how-to guide
The README SHALL include a numbered tutorial explaining how to add support for a new playground device type, covering the full journey from OSM tag to rendered detail panel.

The guide MUST cover:
1. How to find the correct OSM tag for a device (link to OSM wiki `Key:playground`)
2. The structure of an entry in `objDevices` inside `js/objPlaygroundEquipment.js` — all fields explained (`name_de`, `image`, `category`, `filterable`, `filter_attr`)
3. How to find a Wikimedia Commons image filename for the `image` field
4. How to verify the change locally (run `make dev`, open a playground that has the device, expand the detail panel)
5. What to commit and how to open a PR

#### Scenario: Maintainer adds a new device type end-to-end
- **WHEN** a maintainer follows the guide for a new OSM playground tag (e.g. `playground=balance_beam`)
- **THEN** they can add the entry in `objPlaygroundEquipment.js`, see the device appear in the detail panel during local dev, and know exactly what to commit

#### Scenario: Maintainer finds the right Wikimedia image
- **WHEN** the guide explains the `image` field
- **THEN** the reader knows to search `commons.wikimedia.org`, copy the `File:` filename, and understands the Commons-first + OSM-wiki-fallback behaviour
