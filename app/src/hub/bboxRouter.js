// Hub bbox router (P2 §1.3).
//
// Pure function: given a viewport bbox in WGS84 and the current backends
// list, return the subset whose own bbox intersects the viewport.
// The hub orchestrator uses this so a Paris user's moveend doesn't query
// Berlin / Hamburg / etc. backends.
//
// Caveat: this assumes both bboxes have `minLon ≤ maxLon`. A bbox that
// crosses the antimeridian (e.g. Russia, Pacific island chains) is
// conventionally encoded with `minLon > maxLon` and would fail every
// intersection test here, silently dropping the backend from the router's
// output. No current deployment hits this; fix when a Pacific federation
// becomes real (split the wrapped bbox at ±180 before testing).

function isFiniteBbox(bb) {
  return Array.isArray(bb) && bb.length === 4 && bb.every(Number.isFinite);
}

/**
 * Test whether two `[minLon, minLat, maxLon, maxLat]` bboxes (WGS84) intersect.
 * Returns true on touch (shared edge).
 */
function bboxesIntersect(a, b) {
  if (!a || !b) return false;
  const [ax0, ay0, ax1, ay1] = a;
  const [bx0, by0, bx1, by1] = b;
  return ax0 <= bx1 && ax1 >= bx0 && ay0 <= by1 && ay1 >= by0;
}

/**
 * Return the subset of `backends` whose bbox intersects `viewportBbox`.
 *
 * @param {[number, number, number, number] | null} viewportBbox  WGS84
 * @param {Array<{ bbox: [number,number,number,number] | null }>} backends
 * @returns {Array} same shape as input, filtered
 */
export function selectBackends(viewportBbox, backends) {
  // null viewport (initial mount before the map has computed an extent) →
  // include every backend; the orchestrator's tier logic decides.
  if (viewportBbox === null) return backends;
  // NaN / non-finite tuple → treat as no filter; without this guard every
  // numeric comparison against NaN is false and the router would silently
  // exclude every backend.
  if (!isFiniteBbox(viewportBbox)) return backends;
  return backends.filter(b => bboxesIntersect(viewportBbox, b.bbox));
}
