// Federation health — polls /federation-status.json (written by the hub
// container's 60-second cron) and merges per-backend status into the
// registry store via the `applyFederationStatus` callback.
//
// The two exported functions preserve the signatures that hubOrchestrator.js
// already depends on — no call-site changes required.

import { hubPollInterval } from '../lib/config.js';

// Browser-side cadence: re-fetch the federation-status snapshot at the
// same cadence as the registry poll (default 300 s). Design D5 forbids
// coupling UX freshness to ops freshness — the server-side cron runs at
// its own 60 s cadence; the browser reads at the slower registry cadence
// and the cached `generated_at` keeps aging in real time so the
// staleness banner still surfaces within a single poll window.
const POLL_INTERVAL_MS = hubPollInterval * 1000;
// Show "stale observation" banner when generated_at is older than this
// (kept as a multiplier of `data.poll_interval_seconds` from the JSON
// payload so the threshold tracks the server's own configured cadence).
const STALE_THRESHOLD_MULTIPLIER = 2;

let _applyStatus       = null;
let _pollTimer         = null;
// One-time `console.warn` per session for absent/unparseable
// federation-status.json — task 3.6 of `add-federation-health-exposition`
// requires the warn-once + fail-open path so a deploy without FHE is
// observable in devtools without flooding the console on every poll.
let _absentWarned      = false;

/**
 * Starts polling /federation-status.json and applies each update to the
 * registry store. Safe to call multiple times — subsequent calls replace
 * the callback and restart the poll cycle.
 *
 * @param {(statusBySlug: Record<string, object>) => void} applyFn
 *   Called on every successful fetch with a slug-keyed map of backend status
 *   objects from federation-status.json. The registry merges these into its
 *   per-backend entries via `patchBackend`.
 */
export function startFederationHealthPoll(applyFn) {
  _applyStatus = applyFn;
  if (_pollTimer) clearTimeout(_pollTimer);
  _fetchAndApply();
}

/** Stop background polling (e.g. on component teardown). */
export function stopFederationHealthPoll() {
  if (_pollTimer) clearTimeout(_pollTimer);
  _pollTimer = null;
  _applyStatus = null;
}

async function _fetchAndApply() {
  try {
    const res = await fetch('/federation-status.json');
    if (res.ok) {
      const data = await res.json();
      if (_applyStatus && data.backends) {
        const generatedAt = data.generated_at ? new Date(data.generated_at) : null;
        const pollInterval = data.poll_interval_seconds ?? 60;
        const observationStale = generatedAt
          ? (Date.now() - generatedAt.getTime()) / 1000 > pollInterval * STALE_THRESHOLD_MULTIPLIER
          : true;
        _applyStatus(data.backends, observationStale);
      }
    } else if (!_absentWarned) {
      _absentWarned = true;
      console.warn(
        `[federation-health] /federation-status.json returned ${res.status}; ` +
        `degrading to per-session health (all backends optimistic).`
      );
    }
  } catch (err) {
    // Network error — federation-status.json absent or unreachable.
    // Fail open: all backends remain as-is (no patch applied), health unknown.
    if (!_absentWarned) {
      _absentWarned = true;
      console.warn(
        `[federation-health] /federation-status.json unreachable (${err.message}); ` +
        `degrading to per-session health (all backends optimistic).`
      );
    }
  }

  _pollTimer = setTimeout(_fetchAndApply, POLL_INTERVAL_MS);
}

/**
 * Returns true if the backend should be queried by the hub orchestrator.
 * A backend is considered down only when federation-status has been fetched
 * AND the backend is explicitly marked `up: false`. The fallback while the
 * poll hasn't run yet (or the endpoint is absent) is "healthy" so the first
 * page load always fan-outs to all backends.
 *
 * @param {{ healthUp?: boolean|null }} backend
 * @returns {boolean}
 */
export function isBackendHealthy(backend) {
  // `healthUp === null` → no status yet → optimistic (treat as healthy)
  return backend.healthUp !== false;
}

/**
 * Filter a backends list to only the healthy ones, applied AFTER the bbox
 * router so the orchestrator's fan-out skips known-down peers entirely.
 */
export function filterHealthy(backends) {
  return backends.filter(isBackendHealthy);
}
