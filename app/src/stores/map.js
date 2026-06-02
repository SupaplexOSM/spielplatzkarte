// Svelte store holding the OpenLayers Map instance.
// Components that need to interact with the map (e.g. fit to extent, add layers)
// import this store and call get(mapStore) after onMount.

import { writable } from 'svelte/store';

export const mapStore = writable(null);
