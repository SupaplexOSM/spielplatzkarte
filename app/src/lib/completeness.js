// Shared data-completeness logic for playground features.
// Returns 'complete' | 'partial' | 'missing'
//
// Criteria:
//   hasPhoto     — at least one panoramax / panoramax:* tag
//   hasEquipment — any mapped equipment inside the playground
//                  (playground=* devices, benches, pitches, etc.)
//   hasInfo      — opening_hours, surface, or a non-trivial access value
//
// complete = all three present
// partial  = at least one present
// missing  = none present
//
// `name` and `operator` are intentionally excluded — administrative data,
// not useful to parents choosing a playground.

export function playgroundCompleteness(props) {
    const hasPhoto = Object.keys(props).some(k => k === 'panoramax' || k.startsWith('panoramax:'));
    const hasEquipment = (props.device_count > 0)
        || (props.bench_count > 0)
        || (props.shelter_count > 0)
        || (props.picnic_count > 0)
        || (props.table_tennis_count > 0)
        || props.has_soccer
        || props.has_basketball
        || props.is_water
        || props.for_baby
        || props.for_toddler
        || props.for_wheelchair;
    const hasInfo = !!(props.opening_hours || props.surface ||
                       (props.access && props.access !== 'yes'));

    if (hasPhoto && hasEquipment && hasInfo) return 'complete';
    if (hasPhoto || hasEquipment || hasInfo) return 'partial';
    return 'missing';
}
