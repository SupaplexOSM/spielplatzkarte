import assert from 'node:assert/strict';
import { groupEquipment } from './equipmentGrouping.js';

function poly(rings, osm_id = 1, props = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: rings },
    properties: { playground: 'structure', osm_id, ...props },
  };
}
function multiPoly(polygons, osm_id = 1, props = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'MultiPolygon', coordinates: polygons },
    properties: { playground: 'structure', osm_id, ...props },
  };
}
function point(coord, playground = 'slide', osm_id = 99) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coord },
    properties: { playground, osm_id },
  };
}
function bench(coord, osm_id = 100) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coord },
    properties: { amenity: 'bench', osm_id },
  };
}

const ring   = [[0,0],[10,0],[10,10],[0,10],[0,0]];
const inner  = [[3,3],[7,3],[7,7],[3,7],[3,3]];          // hole of `ring`
const small  = [[2,2],[5,2],[5,5],[2,5],[2,2]];           // small structure inside `ring`
const offset = [[20,20],[30,20],[30,30],[20,30],[20,20]]; // disjoint structure

// 1. Device inside polygon → grouped
{
  const structure = poly([ring], 1);
  const inside = point([5, 5], 'slide', 2);
  const { groups, standalone } = groupEquipment([structure, inside]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].children.length, 1);
  assert.equal(groups[0].children[0], inside);
  assert.equal(standalone.length, 0);
}

// 2. Device outside polygon → standalone, original order preserved
{
  const structure = poly([ring], 1);
  const outside = point([15, 15], 'swing', 3);
  const { groups, standalone } = groupEquipment([structure, outside]);
  assert.equal(groups.length, 0, 'structure with no children is standalone');
  assert.deepEqual(standalone, [structure, outside], 'standalone preserves original order');
}

// 3. No structure polygons → all standalone, unchanged
{
  const f1 = point([1, 1], 'slide', 10);
  const f2 = point([2, 2], 'swing', 11);
  const { groups, standalone } = groupEquipment([f1, f2]);
  assert.equal(groups.length, 0);
  assert.deepEqual(standalone, [f1, f2]);
}

// 4. Structure with zero contained devices → standalone (no grouping UI)
{
  const structure = poly([ring], 1);
  const { groups, standalone } = groupEquipment([structure]);
  assert.equal(groups.length, 0);
  assert.deepEqual(standalone, [structure]);
}

// 5. Empty input
{
  const { groups, standalone } = groupEquipment([]);
  assert.equal(groups.length, 0);
  assert.equal(standalone.length, 0);
}

// 6. Polygon hole — device inside the hole is NOT grouped
{
  const structure = poly([ring, inner], 1);
  const insideOuter = point([1, 5], 'slide', 20);  // outer ring, not in hole
  const insideHole  = point([5, 5], 'swing', 21);  // inside the hole
  const { groups, standalone } = groupEquipment([structure, insideOuter, insideHole]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].children, [insideOuter]);
  assert.deepEqual(standalone, [insideHole]);
}

// 7. MultiPolygon — device inside the second sub-polygon IS grouped
{
  const structure = multiPoly([[ring], [offset]], 1);
  const inFirst  = point([5, 5],   'slide', 30);
  const inSecond = point([25, 25], 'swing', 31);
  const { groups } = groupEquipment([structure, inFirst, inSecond]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].children, [inFirst, inSecond]);
}

// 8. Overlapping structures — device inside both goes to the SMALLER
{
  const big   = poly([ring],  1);
  const tiny  = poly([small], 2);
  const inBoth = point([3, 3], 'slide', 40); // inside both
  // Pass `big` first to confirm we don't just pick first-encountered.
  const { groups } = groupEquipment([big, tiny, inBoth]);
  assert.equal(groups.length, 1, 'only the inner structure becomes a group');
  assert.equal(groups[0].structure, tiny, 'innermost (smallest) wins');
  assert.deepEqual(groups[0].children, [inBoth]);
}

// 9. Non-device features (bench, pitch, …) inside a structure stay standalone
{
  const structure = poly([ring], 1);
  const slide = point([5, 5], 'slide', 50);
  const benchInside = bench([6, 6], 51);
  const { groups, standalone } = groupEquipment([structure, slide, benchInside]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].children, [slide], 'only playground devices become children');
  assert.deepEqual(standalone, [benchInside], 'bench bypasses grouping');
}

// 10. playground=yes is NOT groupable (per device-list filter convention)
{
  const structure = poly([ring], 1);
  const generic = point([5, 5], 'yes', 60);
  const { groups, standalone } = groupEquipment([structure, generic]);
  assert.equal(groups.length, 0);
  assert.deepEqual(standalone, [structure, generic]);
}

// 11. Group order matches structure position in the input
{
  const f1   = point([100, 100], 'slide', 70);
  const sA   = poly([ring], 1);
  const f2   = point([200, 200], 'swing', 71);
  const sB   = poly([offset], 2);
  const inA  = point([5, 5], 'slide', 72);
  const inB  = point([25, 25], 'swing', 73);
  const { groups, standalone } = groupEquipment([f1, sA, f2, sB, inA, inB]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].structure, sA, 'sA group precedes sB group');
  assert.equal(groups[1].structure, sB);
  assert.deepEqual(standalone, [f1, f2], 'standalone preserves input order');
}

console.log('All groupEquipment tests passed.');
