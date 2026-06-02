/** Parses the optional `centroid: [lon, lat]` field from a registry entry.
 *  Returns `[lon, lat]` on success, `null` on absent, `null` + warn on invalid. */
export function parseNominalCentroid(raw, url) {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length !== 2) {
    console.warn(`[registry] invalid centroid on backend ${url} — expected [lon, lat] array`);
    return null;
  }
  const [lon, lat] = raw;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    console.warn(`[registry] invalid centroid [${lon}, ${lat}] on backend ${url} — lon ∈ [-180,180], lat ∈ [-90,90]`);
    return null;
  }
  return [lon, lat];
}

/** Returns [lon, lat] midpoint of a bbox, or null if bbox is absent/malformed. */
export function bboxCentroid(bbox) {
  if (!bbox || bbox.length !== 4) return null;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}
