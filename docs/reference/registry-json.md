# `registry.json` Reference

The Hub reads a `registry.json` file at startup and on a short poll interval (`HUB_POLL_INTERVAL`, default 5 min). Each entry points to one regional PostgREST backend. The Hub fetches `get_playgrounds` and `get_meta` from each backend, merges them onto a shared map, and tags every feature with its source backend so deep-links round-trip.

## Location

- **Served from**: the nginx container under `/registry.json` (path configurable via `REGISTRY_URL`).
- **Source file**: `app/public/registry.json` in the repo. In production, replace or bind-mount with your own registry.
- **Served as**: `application/json`. CORS is not needed for the registry file itself — the Hub fetches it from its own origin. The *backends* the registry points at are typically cross-origin and must enable CORS on `/api/` (covered in [Federation endpoints](federation.md#federation-endpoints)).

## Schema

Two top-level shapes are accepted:

=== "Object form (recommended)"

    ```json
    {
      "instances": [
        {
          "slug": "fulda",
          "url":  "https://spielplatz.fulda.de/api",
          "name": "Fulda"
        },
        {
          "slug": "mv",
          "url":  "https://spielplatz.mv.de/api",
          "name": "Mecklenburg-Vorpommern",
          "centroid": [12.43, 53.81]
        }
      ]
    }
    ```

=== "Bare array form (legacy)"

    ```json
    [
      { "slug": "fulda",  "url": "https://spielplatz.fulda.de/api",  "name": "Fulda"  },
      { "slug": "berlin", "url": "https://spielplatz.berlin.de/api", "name": "Berlin" }
    ]
    ```

Both forms are supported indefinitely. New registries should prefer the object form so future top-level metadata (e.g. a registry version) can be added without a breaking change.

## Entry fields

| Field | Required | Description |
|---|---|---|
| `url`      | yes | Base URL of the backend's PostgREST `/api` (no trailing slash). The Hub appends `/rpc/get_playgrounds`, `/rpc/get_meta`, and `/rpc/get_nearest_playgrounds`. |
| `name`     | recommended | Human-readable label. Shown in the instance drawer and — until `get_meta` returns — used as the backend's displayed region name. Technically falls back to `url` if omitted, which gives ugly labels — always set it. |
| `slug`     | no  | Short stable identifier used in deep-links (`#<slug>/W<osm_id>`). If present, features from this backend round-trip their slug back into the URL hash on selection. See [validation rules](#slug-validation) below. |
| `centroid` | no  | `[lon, lat]` in WGS84 (e.g. `[9.93, 51.54]`). Sets a fallback position for the macro view ring when the backend has no bbox yet (first import not completed, or import failed). Without this field, a backend with no data is invisible on the macro view map. Once the first import completes, the bbox-derived centroid takes over automatically — no manual update needed. |

!!! note "Runtime-populated fields"
    The Hub does **not** read `version` or `region` from `registry.json` entries — adding those keys to the file has no effect. Both are derived at runtime from each backend's `/api/rpc/get_meta` response: `region` from the OSM relation name, `version` from a `version` key the response *would* carry. The current `get_meta` SQL function (`importer/api.sql`) does not return `version`, so `version` stays `null` and the instance drawer's version badge remains empty until a future release wires one through.

### Slug validation

Slugs must match `^[a-z0-9-]+$` — lowercase ASCII letters, digits, and hyphens only. Invalid slugs are logged as a console warning and treated as *absent* — the entry still works (playgrounds still load from that backend), but deep-links won't be slug-scoped and selections on features from that backend will fall back to the bare `#W<osm_id>` form.

Slugs should be **stable** — they are persisted in URLs shared by users. Rename with care; there's no redirect mechanism.

## Derived capabilities

Once the registry is loaded, the Hub derives two aggregate behaviours:

### Aggregated bounding box

The Hub unions every backend's `get_meta().bbox` into a single extent and uses it to fit the initial map view. Backends that haven't yet reported (still loading, failed, or running a version older than v0.2.1) are ignored. Until at least one backend reports a bbox, the map stays on its default Germany-wide view.

### Multi-backend nearest search

The "nearby playgrounds" panel fans `get_nearest_playgrounds` out to every registered backend in parallel with a 3 s per-backend timeout. Results are merged, deduplicated by `osm_id` (keeping the closest distance), sorted by distance, and truncated to the top 10. A slow or unreachable backend contributes zero results but never stalls the response.

## Deep-link behaviour

| URL hash                  | Hub behaviour                                                                 |
|---------------------------|-------------------------------------------------------------------------------|
| `#<slug>/W<osm_id>`       | Resolves slug → backend URL, waits for that backend's features, selects the matching `osm_id`. Unknown slug: logs once and retries as more backends load. |
| `#W<osm_id>`              | Broadcast search across every loaded backend. First match wins; duplicate `osm_id` across backends triggers a console warning. |
| `#<anything>/W<osm_id>`   | Standalone mode ignores the slug prefix and selects the `osm_id` from its sole configured backend. |

When a user selects a playground, the Hub rewrites the hash to its canonical slug-scoped form if the backend has a slug, otherwise to the bare `W<osm_id>` form.

## See also

- [Federation](federation.md) — Hub deployment and the `APP_MODE=hub` switch.
- [Monitoring](../ops/monitoring.md) — `/federation-status.json` health rollup and `/metrics` Prometheus exposition.
