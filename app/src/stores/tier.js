// Active zoom-tier for the playground renderer.
//
// Written by the orchestrator on moveend; read by Map.svelte to toggle
// layer visibility. Values:
//   null       — orchestrator hasn't run yet (boot state)
//   'cluster'  — cluster layer visible (server-bucketed rings)
//   'polygon'  — polygon layer visible (full GeoJSON polygons)
//   'macro'    — hub-only: macro view visible, no cluster/polygon fetches
//                (P2 — country-level rings rendered from cached get_meta)
//
// Default is null so Map.svelte can hide all layers until the orchestrator
// has run at least once. This avoids a flash of the empty polygon layer on
// first paint at low zoom.
import { writable } from 'svelte/store';
export const activeTierStore = writable(null);
