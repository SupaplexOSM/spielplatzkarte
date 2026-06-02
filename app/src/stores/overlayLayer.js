import { writable } from 'svelte/store';

/** GeoJSON feature arrays for the equipment/tree overlay. Empty arrays = no selection or nothing loaded. */
export const overlayFeaturesStore = writable({ equipment: [], trees: [] });
