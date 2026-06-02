// Reactive store for the currently selected playground.
// Replaces the 40+ DOM ID coupling in the old selectPlayground.js with a single
// writable store that all components can subscribe to.
//
// shape: { feature: OlFeature | null, backendUrl: string }
//   feature    — the selected OpenLayers feature (null = nothing selected)
//   backendUrl — the API base URL of the backend that owns this feature.
//                In standalone mode this is always apiBaseUrl.
//                In hub mode this is the per-backend URL from the registry.

import { writable, derived } from 'svelte/store';
import { writeHash } from '../lib/deeplink.js';

function createSelectionStore() {
    const { subscribe, set, update } = writable({ feature: null, backendUrl: '' });

    return {
        subscribe,
        select(feature, backendUrl) {
            set({ feature, backendUrl });
            if (feature) {
                const osmId = feature.get('osm_id');
                if (osmId) {
                    // `_backendSlug` is set by the hub registry when it knows the
                    // owning backend's slug; standalone never sets it, so this
                    // falls back to the legacy `#W<osm_id>` form.
                    const slug = feature.get('_backendSlug') ?? null;
                    history.replaceState(null, '', writeHash({ slug, osmId }));
                }
            }
        },
        clear() {
            set({ feature: null, backendUrl: '' });
            history.replaceState(null, '', window.location.pathname + window.location.search);
        },
    };
}

export const selection = createSelectionStore();

// Derived: true when a playground is selected
export const hasSelection = derived(selection, $s => $s.feature !== null);

// Derived: the OSM ID of the selected playground (or null)
export const selectedOsmId = derived(selection, $s => $s.feature?.get('osm_id') ?? null);
