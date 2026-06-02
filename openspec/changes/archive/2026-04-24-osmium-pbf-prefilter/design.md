## Context

The importer runs osm2pgsql against a full Geofabrik Bundesland extract (e.g. Hessen ~322 MB, ~31M nodes). Only a small fraction of that data belongs to the target region (a city or Kreis, ~50–80k objects). The osm2pgsql step takes ~60s because it reads and processes every node regardless. The PBF download is already cached by filename; the bottleneck is purely the osm2pgsql processing time.

`osmium-tool` can clip a PBF to a bounding box in ~1–2s. Running osm2pgsql on the clipped file takes ~3–5s instead of ~60s.

## Goals / Non-Goals

**Goals:**
- Reduce osm2pgsql processing time for city/Kreis-sized imports from ~60s to ~5s
- Keep the full Bundesland PBF cached (reusable for multiple regions / import2)
- Degrade gracefully when Nominatim is unavailable
- Zero impact on import correctness — same data in the DB as before

**Non-Goals:**
- Reducing the initial PBF download time (network bound, not addressable here)
- Switching from the default pgsql output to the Lua-based processing pipeline
- Changing the import API (env vars, Makefile targets, Docker Compose services)

## Decisions

### D1: osmium over osm2pgsql `--bbox`

osm2pgsql's `--bbox` flag filters what gets *written* but still reads the entire file. osmium reads the file once and writes a small output; subsequent osm2pgsql only sees the small file. osmium wins on total wall time.

### D2: Nominatim for bbox lookup, with `OSM_BBOX` escape hatch

Nominatim is already used by the frontend for location search — it's a known, trusted dependency. The `OSM_BBOX` env var covers air-gapped deployments and CI environments where Nominatim access isn't available. Fallback to full PBF ensures no regression.

**Alternatives considered:**
- OSM API (`/api/0.6/relation/<id>`): returns XML, harder to parse reliably in shell
- Overpass API: heavier, slower, same network dependency
- Hard-coded bbox in `.env`: forces user to calculate coordinates manually; not acceptable as a default

### D3: `--strategy=smart` over `complete-ways`

`smart` strategy ensures relation members (including the region boundary polygon ways) are fully included even when they cross the padded bbox edge. `complete-ways` handles ways but not relations. For our use case the region relation polygon is critical — `smart` is the correct choice at negligible extra cost.

### D4: Cache filtered PBF, invalidate by source mtime

osmium on 322 MB takes ~1–2s, so caching provides only marginal benefit on the first run. The main value is correctness: if a developer runs `make import` twice in quick succession (e.g. debugging api.sql), the second run skips osmium entirely. Cache key: `<pbf-basename>_<relation-id>.pbf`. Invalidation: source PBF newer than filtered PBF → regenerate.

### D5: Skip pre-filter for small PBFs (< 20 MB)

Some users may configure a city-level Geofabrik extract as `PBF_URL`. Running osmium on a 5 MB file saves nothing and adds a Nominatim round-trip. The 20 MB threshold is well above any city-level extract and well below any Bundesland extract.

### D6: Padding default of 0.15°

`POI_RADIUS_M` defaults to 5000 m. 0.15° ≈ 15 km at mid-latitudes — 3× the POI radius, comfortably capturing all POIs and buildings near the region edge. For the typical Hessen use case this grows the filtered PBF from ~3 MB to ~8 MB, still negligible for osm2pgsql.

## Risks / Trade-offs

- **Nominatim rate limit** → One request per import; well within the 1 req/s limit. Not a concern.
- **Nominatim bbox accuracy** → For administrative relations the bbox is tight and correct. Padding handles edge cases.
- **osmium `smart` strategy completeness** → `smart` guarantees relation members are included, but multi-polygon outer rings that extend far outside the bbox could pull in distant nodes. For admin boundary relations of city size this is not a practical problem.
- **Filtered PBF stale after source update** → Handled by mtime comparison. Only a risk if someone manually touches the filtered PBF's timestamp — not a realistic scenario.
- **Image size increase** → `osmium-tool` + `jq` + `curl` on Debian bookworm-slim add ~15 MB to the image. Acceptable.

## Migration Plan

1. Update `importer/Dockerfile` — add packages
2. Update `importer/import.sh` — add pre-filter step
3. Update `.env.example` — document `OSM_BBOX` and `OSM_BBOX_PADDING`
4. Update `docs/ops/configuration.md` — new env vars
5. Rebuild importer image (`make import` uses `--build`)
6. Existing cached PBFs on the volume continue to work — osmium reads them, produces new filtered file

No data migration required. No rollback complexity — removing the osmium step reverts to current behavior.

## Open Questions

- Should `OSM_BBOX_PADDING` be exposed in `.env.example` or kept as an advanced/hidden variable? Default of 0.15° should be correct for all realistic use cases.
- Should the filtered PBF path be printed in import output so users can inspect it? Leaning yes — useful for debugging unexpected import results.
