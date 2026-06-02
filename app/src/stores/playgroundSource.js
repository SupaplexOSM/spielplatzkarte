// Exposes the standalone playground VectorSource so other components can
// find features by osm_id without reaching into the Map component.
import { writable } from 'svelte/store';
export const playgroundSourceStore = writable(null);
