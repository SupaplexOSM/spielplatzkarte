// Hub-tier load progress (P2 §3.5).
//
// Written by the hub orchestrator on each fan-out:
//   { loaded: number, total: number, settling: boolean }
//
// `total` = number of backends in the current fan-out (after bbox + health
// filtering); `loaded` increments per-backend as `onResult` fires; `settling`
// is true between the start of a fan-out and its `Promise.all` resolution.
//
// Consumed by InstancePanel to surface partial-load state in the pill
// ("3/5 regions loaded") so users see federation responsiveness.

import { writable } from 'svelte/store';
export const hubLoadingStore = writable({ loaded: 0, total: 0, settling: false });
