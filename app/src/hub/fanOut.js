// Hub fan-out utility (P2 §2).
//
// Invokes a fetcher against every selected backend in parallel, surfaces
// each result as it arrives via an `onResult` callback so the map can
// repaint progressively, and returns a Promise that resolves when every
// backend has settled (success, error, or per-backend timeout).
//
// Design choices:
//   * One AbortController per fan-out — `signal.abort()` cancels every
//     in-flight request together (typical case: superseded by a new
//     moveend in the orchestrator).
//   * Per-backend timeout (default 5 s) so a single slow peer can't
//     block the merged render.
//   * One backend's failure does not reject the fan-out promise; it is
//     surfaced as `{ ok: false, error, backendUrl }` to the callback.
//   * Per-session warn-once for timeouts to avoid console spam.

const DEFAULT_TIMEOUT_MS = 5000;
const _warnedTimeoutBackends = new Set();

/**
 * @callback FanOutFetcher
 * @param {string} backendUrl
 * @param {AbortSignal} signal
 * @returns {Promise<any>}  arbitrary fetcher payload
 *
 * @callback FanOutOnResult
 * @param {{ ok: true, value: any, backendUrl: string } | { ok: false, error: Error, backendUrl: string }} entry
 * @returns {void}
 *
 * @param {Object} opts
 * @param {FanOutFetcher} opts.fetcher
 * @param {Array<{ url: string }>} opts.backends
 * @param {AbortSignal} [opts.signal]    parent signal (e.g. orchestrator-wide AbortController)
 * @param {FanOutOnResult} [opts.onResult]  invoked once per backend as soon as that backend settles
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<Array<{ ok: boolean, value?: any, error?: Error, backendUrl: string }>>}
 *   resolves with every backend's outcome in arrival order
 */
export async function fanOut({
  fetcher,
  backends,
  signal,
  onResult,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (typeof fetcher !== 'function') {
    throw new TypeError('fanOut: `fetcher` must be a function');
  }
  if (!backends?.length) return [];

  const controller = new AbortController();
  const onParentAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onParentAbort, { once: true });
  }

  const results = [];

  const tasks = backends.map((b) => {
    // Per-backend AbortController is load-bearing: a single slow peer's
    // per-request timeout aborts only its own request without cancelling
    // every other backend's in-flight fetch (which `controller.abort()`
    // would do). Don't fold this into `controller`.
    const perBackendController = new AbortController();
    const onCancel = () => perBackendController.abort(controller.signal.reason);
    if (controller.signal.aborted) perBackendController.abort(controller.signal.reason);
    else controller.signal.addEventListener('abort', onCancel, { once: true });

    // Single timer covers both warn-once and per-backend abort. Two timers
    // at the same delay race each other in the macrotask queue and can
    // produce spurious warns when one observes the other's not-yet-aborted
    // state.
    const timer = setTimeout(() => {
      if (perBackendController.signal.aborted) return;
      if (!_warnedTimeoutBackends.has(b.url)) {
        _warnedTimeoutBackends.add(b.url);
        console.warn(`[fanOut] backend ${b.url} timed out after ${timeoutMs} ms (warn-once)`);
      }
      perBackendController.abort(new Error('per-backend timeout'));
    }, timeoutMs);

    return fetcher(b.url, perBackendController.signal)
      .then(value => {
        const entry = { ok: true, value, backendUrl: b.url };
        results.push(entry);
        onResult?.(entry);
      })
      .catch(error => {
        const entry = { ok: false, error, backendUrl: b.url };
        results.push(entry);
        onResult?.(entry);
      })
      .finally(() => {
        clearTimeout(timer);
      });
  });

  try {
    await Promise.all(tasks);
  } finally {
    if (signal) signal.removeEventListener('abort', onParentAbort);
  }

  return results;
}
