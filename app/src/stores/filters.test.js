import assert from 'node:assert/strict';
import { matchesFilters, hasActiveFilters, activeFilterCount } from './filters.js';

const noFilters = {
  private: false, water: false, baby: false, toddler: false,
  wheelchair: false, bench: false, picnic: false, shelter: false,
  tableTennis: false, soccer: false, basketball: false, standalonePitches: false,
  showComplete: true, showPartial: true, showMissing: true,
};

// --- matchesFilters ---

// 1. No active filters → always passes
{
  assert.equal(matchesFilters({}, noFilters), true);
  assert.equal(matchesFilters({ access: 'private', is_water: false }, noFilters), true);
}

// 2. private filter: access=private or access=no → excluded; anything else → included
{
  const f = { ...noFilters, private: true };
  assert.equal(matchesFilters({ access: 'private' }, f), false);
  assert.equal(matchesFilters({ access: 'no' }, f), false);
  assert.equal(matchesFilters({ access: 'yes' }, f), true);
  assert.equal(matchesFilters({}, f), true);
}

// 3. water filter
{
  const f = { ...noFilters, water: true };
  assert.equal(matchesFilters({ is_water: true }, f), true);
  assert.equal(matchesFilters({ is_water: false }, f), false);
  assert.equal(matchesFilters({}, f), false);
}

// 4. baby filter
{
  const f = { ...noFilters, baby: true };
  assert.equal(matchesFilters({ for_baby: true }, f), true);
  assert.equal(matchesFilters({ for_baby: false }, f), false);
  assert.equal(matchesFilters({}, f), false);
}

// 5. toddler filter
{
  const f = { ...noFilters, toddler: true };
  assert.equal(matchesFilters({ for_toddler: true }, f), true);
  assert.equal(matchesFilters({}, f), false);
}

// 6. wheelchair filter
{
  const f = { ...noFilters, wheelchair: true };
  assert.equal(matchesFilters({ for_wheelchair: true }, f), true);
  assert.equal(matchesFilters({ for_wheelchair: false }, f), false);
}

// 7. bench filter — bench_count must be > 0
{
  const f = { ...noFilters, bench: true };
  assert.equal(matchesFilters({ bench_count: 2 }, f), true);
  assert.equal(matchesFilters({ bench_count: 0 }, f), false);
  assert.equal(matchesFilters({}, f), false);
}

// 8. picnic filter
{
  const f = { ...noFilters, picnic: true };
  assert.equal(matchesFilters({ picnic_count: 1 }, f), true);
  assert.equal(matchesFilters({ picnic_count: 0 }, f), false);
}

// 9. shelter filter
{
  const f = { ...noFilters, shelter: true };
  assert.equal(matchesFilters({ shelter_count: 1 }, f), true);
  assert.equal(matchesFilters({}, f), false);
}

// 10. tableTennis filter
{
  const f = { ...noFilters, tableTennis: true };
  assert.equal(matchesFilters({ table_tennis_count: 1 }, f), true);
  assert.equal(matchesFilters({ table_tennis_count: 0 }, f), false);
}

// 11. soccer filter
{
  const f = { ...noFilters, soccer: true };
  assert.equal(matchesFilters({ has_soccer: true }, f), true);
  assert.equal(matchesFilters({ has_soccer: false }, f), false);
}

// 12. basketball filter
{
  const f = { ...noFilters, basketball: true };
  assert.equal(matchesFilters({ has_basketball: true }, f), true);
  assert.equal(matchesFilters({}, f), false);
}

// 13. Multiple active filters — ALL must match
{
  const f = { ...noFilters, water: true, bench: true };
  assert.equal(matchesFilters({ is_water: true, bench_count: 1 }, f), true);
  assert.equal(matchesFilters({ is_water: true, bench_count: 0 }, f), false);
  assert.equal(matchesFilters({ is_water: false, bench_count: 1 }, f), false);
}

// 13b. completeness filter — hide by state
{
  const completeProps     = { device_count: 1, bench_count: 1, surface: 'rubber', panoramax: '123' };
  const partialProps      = { device_count: 1 };
  const missingProps      = {};

  // hiding complete
  const hideComplete = { ...noFilters, showComplete: false };
  assert.equal(matchesFilters(completeProps, hideComplete), false);
  assert.equal(matchesFilters(partialProps,  hideComplete), true);
  assert.equal(matchesFilters(missingProps,  hideComplete), true);

  // hiding partial
  const hidePartial = { ...noFilters, showPartial: false };
  assert.equal(matchesFilters(completeProps, hidePartial), true);
  assert.equal(matchesFilters(partialProps,  hidePartial), false);
  assert.equal(matchesFilters(missingProps,  hidePartial), true);

  // hiding missing
  const hideMissing = { ...noFilters, showMissing: false };
  assert.equal(matchesFilters(completeProps, hideMissing), true);
  assert.equal(matchesFilters(partialProps,  hideMissing), true);
  assert.equal(matchesFilters(missingProps,  hideMissing), false);

  // all shown → no filtering
  assert.equal(matchesFilters(missingProps, noFilters), true);
}

// --- hasActiveFilters ---

// 14. All false / all true (completeness) → false
{
  assert.equal(hasActiveFilters(noFilters), false);
}

// 15. Any regular filter true → true
{
  assert.equal(hasActiveFilters({ ...noFilters, water: true }), true);
  assert.equal(hasActiveFilters({ ...noFilters, standalonePitches: true }), true);
  assert.equal(hasActiveFilters({ ...noFilters, basketball: true }), true);
}

// 16. Any completeness state false → true
{
  assert.equal(hasActiveFilters({ ...noFilters, showComplete: false }), true);
  assert.equal(hasActiveFilters({ ...noFilters, showPartial: false }),  true);
  assert.equal(hasActiveFilters({ ...noFilters, showMissing: false }),  true);
}

// --- activeFilterCount ---

// 17. No active filters → 0
{
  assert.equal(activeFilterCount(noFilters), 0);
}

// 18. Regular filters count positively
{
  assert.equal(activeFilterCount({ ...noFilters, water: true }), 1);
  assert.equal(activeFilterCount({ ...noFilters, water: true, bench: true }), 2);
}

// 19. Deactivated completeness states count positively
{
  assert.equal(activeFilterCount({ ...noFilters, showComplete: false }), 1);
  assert.equal(activeFilterCount({ ...noFilters, showComplete: false, showPartial: false }), 2);
}

// 20. standalonePitches not counted
{
  assert.equal(activeFilterCount({ ...noFilters, standalonePitches: true }), 0);
}

// 21. Mixed: regular + completeness
{
  assert.equal(activeFilterCount({ ...noFilters, water: true, showMissing: false }), 2);
}

console.log('All filter tests passed.');
