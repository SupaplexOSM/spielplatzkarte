# spieli

## Linguistically

*Pronunciation:* **[ˈʃpiːli]**

<u>Meaning/Definition:</u>
A German word, that usually marks an area for children, often equipped with various facilities or devices for playing [Usage: children's language]

<u>Article/Gender:</u>
In German, the grammatical gender is masculine: „der Spieli".
In English, it is used as a neuter noun: "the spieli".

---

## Technically

A free, interactive web map for exploring playgrounds based on [OpenStreetMap](https://openstreetmap.org) data — configurable for any region.

### Historically

> **Origin:** This project is a further development of the original [Berliner Spielplatzkarte](https://github.com/SupaplexOSM/spielplatzkarte) by Alex Seidel.

---

## Deploy

The interactive installer downloads everything it needs and walks you through configuration:

```bash
TAG=v0.5.1  # check https://github.com/mfuhrmann/spieli/releases for the latest tag
curl -fsSL "https://github.com/mfuhrmann/spieli/releases/download/${TAG}/install.sh" -o install.sh
curl -fsSL "https://github.com/mfuhrmann/spieli/releases/download/${TAG}/install.sh.sha256" -o install.sh.sha256
sha256sum --check install.sh.sha256 && bash install.sh
```

**Requirements:** Docker with the Compose plugin, `bash`, `openssl`

The installer asks for a deployment mode (`data-node` / `ui` / `data-node-ui`), your OSM region, and optional settings, then generates a `.env`, pulls images, and optionally runs the first import.

For deploying from source, see [Manual Deploy](https://mfuhrmann.github.io/spieli/ops/manual-deploy/).

---

## Documentation

**[mfuhrmann.github.io/spieli](https://mfuhrmann.github.io/spieli/)**

Includes deployment guides, configuration reference, contributing how-tos, and architecture docs.

---

## Tech stack

Svelte 5 · Vite 6 · OpenLayers · Tailwind CSS · PostgreSQL/PostGIS · PostgREST · osm2pgsql · osmium · nginx · Docker

Full details: [Tech stack reference](https://mfuhrmann.github.io/spieli/reference/tech-stack/)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow (branch → commit → PR), or the [docs](https://mfuhrmann.github.io/spieli/) for how-to guides (e.g. [adding a playground device](https://mfuhrmann.github.io/spieli/contributing/add-device/)).

New to OSM concepts like relation IDs or PBF files? See the [glossary](https://mfuhrmann.github.io/spieli/reference/glossary/).

---

## Matrix Contact

Come and let's play:
https://matrix.to/#/#spieli:matrix.org

---

## License

[GNU General Public License v3.0](LICENSE)

Map data © [OpenStreetMap](https://openstreetmap.org) contributors, available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
