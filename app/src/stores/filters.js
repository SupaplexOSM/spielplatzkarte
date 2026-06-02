import { writable } from 'svelte/store';
import { playgroundCompleteness } from '../lib/completeness.js';

// showComplete/showPartial/showMissing default true (show all).
// Deactivating a state hides playgrounds of that completeness.
export const defaultFilters = {
    private:          false,
    water:            false,
    baby:             false,
    toddler:          false,
    wheelchair:       false,
    bench:            false,
    picnic:           false,
    shelter:          false,
    tableTennis:      false,
    soccer:           false,
    basketball:       false,
    standalonePitches: false,  // layer toggle — show pitches outside playground areas
    showComplete:     true,
    showPartial:      true,
    showMissing:      true,
};

export const filterStore = writable({ ...defaultFilters });

/**
 * Returns true if the feature properties satisfy all active filters.
 * Property names match what get_playgrounds returns.
 * @param {Object} props - OL feature properties
 * @param {Object} filters - current filterStore value
 */
export function matchesFilters(props, filters) {
    if (filters.private     && (props.access === 'private' || props.access === 'no')) return false;
    if (filters.water       && !props.is_water)       return false;
    if (filters.baby        && !props.for_baby)       return false;
    if (filters.toddler     && !props.for_toddler)    return false;
    if (filters.wheelchair  && !props.for_wheelchair) return false;
    if (filters.bench       && !(props.bench_count > 0))        return false;
    if (filters.picnic      && !(props.picnic_count > 0))       return false;
    if (filters.shelter     && !(props.shelter_count > 0))      return false;
    if (filters.tableTennis && !(props.table_tennis_count > 0)) return false;
    if (filters.soccer      && !props.has_soccer)      return false;
    if (filters.basketball  && !props.has_basketball)  return false;
    if (!filters.showComplete || !filters.showPartial || !filters.showMissing) {
        const c = playgroundCompleteness(props);
        if (!filters.showComplete && c === 'complete') return false;
        if (!filters.showPartial  && c === 'partial')  return false;
        if (!filters.showMissing  && c === 'missing')  return false;
    }
    return true;
}

/** Returns true if any filter (including deactivated completeness states) is active. */
export function hasActiveFilters(filters) {
    const { showComplete, showPartial, showMissing, ...rest } = filters;
    return Object.values(rest).some(Boolean)
        || !showComplete || !showPartial || !showMissing;
}

/** Count of active filters for the badge (deactivated completeness states count too). */
export function activeFilterCount(filters) {
    const { showComplete, showPartial, showMissing, standalonePitches, ...boolFilters } = filters;
    return Object.values(boolFilters).filter(Boolean).length
        + (showComplete ? 0 : 1) + (showPartial ? 0 : 1) + (showMissing ? 0 : 1);
}
