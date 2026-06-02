import assert from 'node:assert/strict';
import { parseNominalCentroid, bboxCentroid } from './centroid.js';

// --- parseNominalCentroid ---

// 1. Valid centroid
{
  assert.deepEqual(parseNominalCentroid([8.67, 50.11], 'https://example.com'), [8.67, 50.11]);
}

// 2. Absent → null, no warning
{
  assert.equal(parseNominalCentroid(undefined, 'https://example.com'), null);
  assert.equal(parseNominalCentroid(null, 'https://example.com'), null);
}

// 3. Non-array → null + warn
{
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  assert.equal(parseNominalCentroid({ lon: 8.67, lat: 50.11 }, 'https://x'), null);
  assert.equal(parseNominalCentroid('8.67,50.11', 'https://x'), null);
  assert.ok(warns.length === 2, 'expected 2 warnings for non-array inputs');
  console.warn = orig;
}

// 4. Wrong-length array → null + warn
{
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  assert.equal(parseNominalCentroid([8.67], 'https://x'), null);
  assert.equal(parseNominalCentroid([8.67, 50.11, 0], 'https://x'), null);
  assert.ok(warns.length === 2, 'expected 2 warnings for wrong-length arrays');
  console.warn = orig;
}

// 5. Out-of-range lon → null + warn
{
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  assert.equal(parseNominalCentroid([200, 50], 'https://x'), null);
  assert.equal(parseNominalCentroid([-181, 50], 'https://x'), null);
  assert.ok(warns.length === 2);
  console.warn = orig;
}

// 6. Out-of-range lat → null + warn
{
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  assert.equal(parseNominalCentroid([8.67, 91], 'https://x'), null);
  assert.equal(parseNominalCentroid([8.67, -91], 'https://x'), null);
  assert.ok(warns.length === 2);
  console.warn = orig;
}

// 7. Non-finite values → null + warn
{
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  assert.equal(parseNominalCentroid([NaN, 50], 'https://x'), null);
  assert.equal(parseNominalCentroid([8.67, Infinity], 'https://x'), null);
  assert.ok(warns.length === 2);
  console.warn = orig;
}

// 8. Boundary values accepted
{
  assert.deepEqual(parseNominalCentroid([180, 90], 'https://x'), [180, 90]);
  assert.deepEqual(parseNominalCentroid([-180, -90], 'https://x'), [-180, -90]);
}

// --- bboxCentroid + nominalCentroid fallback (mirrors MacroView.svelte buildFeature logic) ---

function selectCentroid(bbox, nominalCentroid) {
  return bboxCentroid(bbox) ?? nominalCentroid ?? null;
}

// 9. Null bbox + valid nominalCentroid → uses nominalCentroid
{
  assert.deepEqual(selectCentroid(null, [8.67, 50.11]), [8.67, 50.11]);
}

// 10. Null bbox + null nominalCentroid → null (no feature rendered)
{
  assert.equal(selectCentroid(null, null), null);
}

// 11. Valid bbox always wins over nominalCentroid
{
  const result = selectCentroid([8.0, 50.0, 9.0, 51.0], [99, 99]);
  assert.deepEqual(result, [8.5, 50.5]);
}

// 12. bboxCentroid: malformed bbox → null
{
  assert.equal(bboxCentroid([]), null);
  assert.equal(bboxCentroid(null), null);
  assert.equal(bboxCentroid([8.0, 50.0, 9.0]), null); // wrong length
}
