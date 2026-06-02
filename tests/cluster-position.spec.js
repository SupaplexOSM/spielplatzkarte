// Live-API integration: verifies that `api.get_playground_clusters` ships
// the bucket position as the unweighted spatial mean of its members'
// centroids — the contract introduced by the
// `position-clusters-at-member-centroid` change.
//
// Hits the running docker stack at http://localhost:8080/api directly via
// Playwright's request fixture. Skips on a network-level failure (stack
// not running) but fails loudly on HTTP non-OK responses, so a partial
// outage (db down, schema not loaded → 5xx) doesn't silently mask
// regressions.
//
// The complementary SQL-level regression lives at
// `dev/sql-tests/cluster-position.sql`. This browser-side test exists
// because:
//   1. positive proof that the rendered cluster position is *inside* the
//      member convex hull — i.e. the dot tracks geography, not the grid
//      anchor (which at z=7 would land ~10 km outside the Fulda cluster).
//   2. round-trip coverage of the wire format (PostgREST → JSON → client)
//      so a future schema rename or projection bug surfaces here.
//
// The hull and containment math runs in EPSG:3857 metres rather than
// WGS84 lon/lat. The SQL function computes ST_Centroid in 3857 (metric
// mean) and reprojects to 4326; the reprojected midpoint is *not* on the
// WGS84 segment between two members (Mercator's log/tan warp offsets it
// perpendicular to the segment), so a containment test in degree-space
// fragile-fails for N=2 or collinear-N≥3 buckets. Working in metres also
// gives `eps` a stable physical meaning (1 mm).

import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:8080/api';

// Bbox covering Hessen with the seeded 4 Fulda playgrounds at z=7
// (78 km cell). Picked so the seed collapses into one bucket regardless
// of cell-edge stickiness.
const BBOX = { min_lon: 8.5, min_lat: 50.0, max_lon: 10.5, max_lat: 51.2 };
const Z = 7;

// `ST_SnapToGrid(geom, m)` snaps each coordinate to the *nearest* multiple
// of `m` (origin 0,0). The JS bucketing must mirror this — `Math.floor`
// would diverge for any centroid past the cell midpoint.
const Z7_CELL_SIZE_M = 78125;

function clustersUrl(z, bbox) {
  return `${API_BASE}/rpc/get_playground_clusters?z=${z}` +
    `&min_lon=${bbox.min_lon}&min_lat=${bbox.min_lat}` +
    `&max_lon=${bbox.max_lon}&max_lat=${bbox.max_lat}`;
}

function centroidsUrl(bbox) {
  return `${API_BASE}/rpc/get_playground_centroids` +
    `?min_lon=${bbox.min_lon}&min_lat=${bbox.min_lat}` +
    `&max_lon=${bbox.max_lon}&max_lat=${bbox.max_lat}`;
}

test.describe('Cluster position semantics (live API)', () => {
  test.beforeAll(async ({ request }) => {
    let probe;
    try {
      probe = await request.get(`${API_BASE}/rpc/get_meta`, { timeout: 2000 });
    } catch (err) {
      // Network-level failure (ECONNREFUSED, DNS, timeout) — stack isn't up.
      // Skip the suite so it stays opt-in for stub-only CI.
      test.skip(true, `Skipping live-API tests — ${API_BASE} unreachable: ${err.message}`);
      return;
    }
    // Reachable but broken (db down, schema not loaded, etc.) — fail loudly,
    // because silently skipping would hide the contract being broken.
    expect(
      probe.ok(),
      `Live-API probe failed: ${API_BASE}/rpc/get_meta returned ${probe.status()}`,
    ).toBeTruthy();
  });

  test('multi-member bucket lon/lat lies inside the convex hull of its members', async ({ request }) => {
    const clustersRes = await request.get(clustersUrl(Z, BBOX));
    expect(clustersRes.ok(), `clusters RPC failed: ${clustersRes.status()}`).toBeTruthy();
    const clusters = await clustersRes.json();
    expect(Array.isArray(clusters)).toBe(true);

    const multi = clusters.filter(b => b.count >= 2).sort((a, b) => b.count - a.count);
    expect(
      multi.length,
      'no multi-member bucket — seed must place ≥ 2 playgrounds in one z=7 cell',
    ).toBeGreaterThan(0);
    const bucket = multi[0];

    expect(bucket.count).toBe(bucket.complete + bucket.partial + bucket.missing + bucket.restricted);

    const centroidsRes = await request.get(centroidsUrl(BBOX));
    expect(centroidsRes.ok(), `centroids RPC failed: ${centroidsRes.status()}`).toBeTruthy();
    const centroids = await centroidsRes.json();
    expect(centroids.length).toBeGreaterThanOrEqual(bucket.count);

    // Re-bucket centroids into Web-Mercator cells matching the SQL function.
    const cellGroups = bucketBy3857(centroids, Z7_CELL_SIZE_M);
    const candidates = [...cellGroups.values()].filter(g => g.length === bucket.count);
    expect(
      candidates.length,
      `expected at least one cell with ${bucket.count} members; got ${candidates.length}`,
    ).toBeGreaterThan(0);

    // Tie-break by proximity to the reported (lon, lat). The SQL test does
    // the same — without it, two cells with identical member counts would
    // make the cell-pick ambiguous.
    const [bx, by] = lonLatTo3857(bucket.lon, bucket.lat);
    const members = candidates
      .map(g => {
        const meanX = g.reduce((s, m) => s + lonLatTo3857(m.lon, m.lat)[0], 0) / g.length;
        const meanY = g.reduce((s, m) => s + lonLatTo3857(m.lon, m.lat)[1], 0) / g.length;
        return { g, distSq: (meanX - bx) ** 2 + (meanY - by) ** 2 };
      })
      .sort((a, b) => a.distSq - b.distSq)[0].g;

    // Run the convex-hull test in 3857 metres. eps = 1 mm covers floating-
    // point noise without admitting any geographically-meaningful drift.
    const memberPts3857 = members.map(m => lonLatTo3857(m.lon, m.lat));
    const bucketPt3857 = [bx, by];
    const hull = convexHull(memberPts3857);
    expect(
      pointInOrOnPolygon(bucketPt3857, hull, 1e-3),
      `bucket position (${bucket.lon}, ${bucket.lat}) lies outside the convex hull of its members ` +
        `(${members.map(m => `(${m.lon}, ${m.lat})`).join(', ')})`,
    ).toBe(true);
  });

  test('single-member bucket lon/lat equals that member\'s centroid', async ({ request }) => {
    // At z=13 (cell ~1.2 km) the 4 Fulda playgrounds split across multiple
    // cells, producing single-member buckets — exercises the spec scenario
    // "for a bucket with a single member, the returned lon/lat equal that
    // member's centroid reprojected to WGS84."
    const Z_HIGH = 13;
    const clustersRes = await request.get(clustersUrl(Z_HIGH, BBOX));
    expect(clustersRes.ok(), `clusters RPC failed: ${clustersRes.status()}`).toBeTruthy();
    const clusters = await clustersRes.json();

    const singletons = clusters.filter(b => b.count === 1);
    expect(
      singletons.length,
      'expected at least one single-member bucket at z=13 — seed must place playgrounds in distinct ~1.2 km cells',
    ).toBeGreaterThan(0);

    const centroidsRes = await request.get(centroidsUrl(BBOX));
    expect(centroidsRes.ok(), `centroids RPC failed: ${centroidsRes.status()}`).toBeTruthy();
    const centroids = await centroidsRes.json();

    // For each singleton, the bucket lon/lat must be bit-equal to one of
    // the centroids (both come from `ST_Transform(ps.centroid_3857, 4326)`).
    // 1e-12 deg covers any reprojection noise.
    for (const bucket of singletons) {
      const closest = centroids
        .map(c => ({ c, d: Math.hypot(c.lon - bucket.lon, c.lat - bucket.lat) }))
        .sort((a, b) => a.d - b.d)[0];
      expect(
        closest.d,
        `single-member bucket (${bucket.lon}, ${bucket.lat}) does not match any centroid; ` +
          `closest is osm_id=${closest.c.osm_id} at (${closest.c.lon}, ${closest.c.lat})`,
      ).toBeLessThan(1e-12);
    }
  });

  test('total count across all buckets is invariant across zoom levels', async ({ request }) => {
    // Spec scenario: "the total `count` across all buckets is identical
    // across zoom levels (no features lost to bucketing)." Same bbox, two
    // zooms — sums must agree.
    const at6 = await (await request.get(clustersUrl(6, BBOX))).json();
    const at10 = await (await request.get(clustersUrl(10, BBOX))).json();

    const sumCounts = (clusters) => clusters.reduce((s, b) => s + b.count, 0);
    expect(sumCounts(at6)).toBe(sumCounts(at10));
    // Cell size halves with zoom, so z=10 must produce strictly more (or
    // equal) buckets than z=6 — the change can't conjure features but
    // higher zooms should not collapse fewer than a lower one.
    expect(at10.length).toBeGreaterThanOrEqual(at6.length);
  });
});

// --- geometry helpers ---

// PostGIS `ST_SnapToGrid(geom, m)` snaps each coordinate to the *nearest*
// multiple of `m` with origin (0,0) — i.e. round-to-nearest, not floor.
function bucketBy3857(centroids, cellSize) {
  const groups = new Map();
  for (const c of centroids) {
    const [x, y] = lonLatTo3857(c.lon, c.lat);
    const cx = Math.round(x / cellSize) * cellSize;
    const cy = Math.round(y / cellSize) * cellSize;
    const key = `${cx},${cy}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return groups;
}

function lonLatTo3857(lon, lat) {
  // Spherical Mercator (EPSG:3857). Domain: |lat| < ~85.05113°. The test
  // bbox is constrained to Hessen so this is safe; reusing this helper
  // for polar regions would need a domain guard.
  const r = 6378137;
  const x = (lon * Math.PI / 180) * r;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * r;
  return [x, y];
}

// Andrew's monotone-chain convex hull (returns CCW vertices, no duplicate end).
function convexHull(points) {
  const pts = points
    .map(p => [...p])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 2) return pts;

  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Containment test in 3857 metres. `eps` is the same physical tolerance
// applied to both the segment-degenerate path (N≤2 or collinear-N≥3) and
// to general polygon edge-grazing.
function pointInOrOnPolygon([px, py], polygon, eps) {
  if (polygon.length < 1) return false;
  if (polygon.length < 3) {
    // 1-vertex hull (all members coincident) or 2-vertex hull (collinear
    // members of any N ≥ 2). Both reduce to "p lies on the segment a-b",
    // with the 1-vertex case handled by the degenerate-segment guard
    // inside onSegment.
    const a = polygon[0];
    const b = polygon[polygon.length - 1];
    return onSegment(a, b, [px, py], eps);
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (onSegment([xj, yj], [xi, yi], [px, py], eps)) return true;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function onSegment(a, b, p, eps) {
  const lenSq = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  if (lenSq <= eps * eps) {
    // Degenerate segment (a ≈ b) — `p` must coincide with that single
    // point. Without this guard, the cross-product test below collapses
    // to `0 <= eps` and any `p` on the line through `a` would falsely
    // pass.
    const distSq = (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    return distSq <= eps * eps;
  }
  // Cross-product is the signed parallelogram area of (a→b, a→p);
  // perpendicular distance × |a→b|. Comparing to eps × |a→b| keeps the
  // tolerance physically meaningful regardless of segment length.
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (Math.abs(cross) > eps * Math.sqrt(lenSq)) return false;
  const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
  if (dot < -eps * Math.sqrt(lenSq)) return false;
  return dot <= lenSq + eps * Math.sqrt(lenSq);
}
