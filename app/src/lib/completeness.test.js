import assert from 'node:assert/strict';
import { playgroundCompleteness } from './completeness.js';

// 1. All three signals present → complete
{
  const props = { name: 'Playground', panoramax: 'abc123', surface: 'sand' };
  assert.equal(playgroundCompleteness(props), 'complete');
}

// 2. panoramax: prefix counts as photo → complete
{
  const props = { name: 'Playground', 'panoramax:sequence': 'abc', operator: 'City' };
  assert.equal(playgroundCompleteness(props), 'complete');
}

// 3. photo + name, no info → partial
{
  const props = { name: 'Park', panoramax: 'abc' };
  assert.equal(playgroundCompleteness(props), 'partial');
}

// 4. name + info, no photo → partial
{
  assert.equal(playgroundCompleteness({ name: 'Park', surface: 'grass' }), 'partial');
}

// 5. photo only → partial
{
  assert.equal(playgroundCompleteness({ panoramax: 'abc' }), 'partial');
}

// 6. name only → partial
{
  assert.equal(playgroundCompleteness({ name: 'Park' }), 'partial');
}

// 7. operator counts as info → partial
{
  assert.equal(playgroundCompleteness({ operator: 'City Parks' }), 'partial');
}

// 8. opening_hours counts as info → partial
{
  assert.equal(playgroundCompleteness({ opening_hours: 'Mo-Su 08:00-20:00' }), 'partial');
}

// 9. surface counts as info → partial
{
  assert.equal(playgroundCompleteness({ surface: 'sand' }), 'partial');
}

// 10. non-trivial access counts as info → partial
{
  assert.equal(playgroundCompleteness({ access: 'private' }), 'partial');
  assert.equal(playgroundCompleteness({ access: 'no' }), 'partial');
  assert.equal(playgroundCompleteness({ access: 'permissive' }), 'partial');
}

// 11. access: 'yes' does NOT count as info → missing
{
  assert.equal(playgroundCompleteness({ access: 'yes' }), 'missing');
}

// 12. none present → missing
{
  assert.equal(playgroundCompleteness({}), 'missing');
  assert.equal(playgroundCompleteness({ nearest_highway: 'residential' }), 'missing');
}

console.log('All completeness tests passed.');
