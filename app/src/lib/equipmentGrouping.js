/**
 * Group playground equipment by playground=structure polygon containers.
 *
 * Geometry semantics
 * ──────────────────
 * - Containment is tested per polygon (with holes) on raw lon/lat using
 *   classical ray-casting. Correct for any structure that does not cross
 *   the antimeridian; spieli deployments are regional so this is safe.
 * - When a device falls inside multiple overlapping structures, the one
 *   with the smallest area (the innermost) wins.
 * - Only `playground=*` device features (not `playground=yes`) are eligible
 *   to become children. Pitches, benches, shelters, picnic tables and
 *   other non-device features bypass grouping and stay in `standalone`,
 *   matching the spec wording "leisure=playground … playground != yes".
 * - Result preserves the original input order: groups appear at the
 *   position of their structure polygon, and standalone entries keep
 *   their original sequence relative to the rest.
 */

function representativePoint(geometry) {
  if (!geometry) return null;
  switch (geometry.type) {
    case 'Point':           return geometry.coordinates;
    case 'MultiPoint':
    case 'LineString':      return geometry.coordinates[0] ?? null;
    case 'MultiLineString': return geometry.coordinates[0]?.[0] ?? null;
    // For Polygon/MultiPolygon devices we use the first vertex of the
    // outer ring rather than a vertex-mean centroid: the mean can fall
    // outside L-shaped polygons, while the first vertex is always on
    // the boundary and matches the spec's "first coordinate" wording.
    case 'Polygon':         return geometry.coordinates[0]?.[0] ?? null;
    case 'MultiPolygon':    return geometry.coordinates[0]?.[0]?.[0] ?? null;
    default:                return null;
  }
}

function pointInPolygon([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Inside the outer ring AND not inside any inner ring (hole).
function pointInPolygonWithHoles(pt, polygon) {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInPolygon(pt, outer)) return false;
  for (const hole of holes) {
    if (pointInPolygon(pt, hole)) return false;
  }
  return true;
}

// Returns the polygons that make up a structure feature. Each entry is
// `[outer, ...holes]`. Polygon → 1 entry; MultiPolygon → N entries.
function structurePolygons(feature) {
  const { type, coordinates } = feature.geometry ?? {};
  if (type === 'Polygon')      return [coordinates];
  if (type === 'MultiPolygon') return coordinates;
  return [];
}

// Shoelace area of a closed lon/lat ring. Used only for ordering — never
// for absolute area — so the planar approximation is acceptable.
function ringArea(ring) {
  if (!ring || ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(sum) / 2;
}

function structureArea(feature) {
  let area = 0;
  for (const polygon of structurePolygons(feature)) {
    area += ringArea(polygon[0]);
    for (const hole of polygon.slice(1)) area -= ringArea(hole);
  }
  return area;
}

function isGroupableDevice(f) {
  const p = f.properties?.playground;
  return Boolean(p) && p !== 'yes' && p !== 'structure';
}

/**
 * @param {Array} features GeoJSON Feature array from get_equipment
 * @returns {{ groups: Array<{structure: Feature, children: Feature[]}>, standalone: Feature[] }}
 */
export function groupEquipment(features) {
  const structures = features.filter(
    f => f.properties?.playground === 'structure' &&
         (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')
  );

  if (structures.length === 0) return { groups: [], standalone: features };

  // Sort by area ascending so the innermost (smallest) container wins on
  // overlap, regardless of API response order.
  const sortedStructures = [...structures].sort(
    (a, b) => structureArea(a) - structureArea(b)
  );

  const childrenMap = new Map(structures.map(s => [s.properties.osm_id, []]));
  const assignedTo = new Map();

  for (const feature of features) {
    if (structures.includes(feature))   continue; // structures handled below
    if (!isGroupableDevice(feature))    continue; // pitch/bench/shelter/etc. stay standalone

    const pt = representativePoint(feature.geometry);
    if (!pt) continue;

    for (const structure of sortedStructures) {
      const polygons = structurePolygons(structure);
      if (polygons.some(p => pointInPolygonWithHoles(pt, p))) {
        childrenMap.get(structure.properties.osm_id).push(feature);
        assignedTo.set(feature, structure.properties.osm_id);
        break;
      }
    }
  }

  // Walk the input once to build the result in original order. A structure
  // with children becomes a group at its position; an empty structure or an
  // unassigned non-structure feature becomes standalone at its position.
  const groups = [];
  const standalone = [];
  for (const feature of features) {
    if (structures.includes(feature)) {
      const children = childrenMap.get(feature.properties.osm_id);
      if (children.length > 0) groups.push({ structure: feature, children });
      else                     standalone.push(feature);
    } else if (!assignedTo.has(feature)) {
      standalone.push(feature);
    }
  }

  return { groups, standalone };
}
