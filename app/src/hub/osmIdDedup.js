// Cross-backend osm_id deduplication for the polygon tier.
//
// When two backends serve the same playground (same osm_id, e.g. a region
// boundary runs through a park), the polygon source would otherwise contain
// two overlapping features. This module keeps exactly one: the feature whose
// backend ran the most recent import.
//
// Tie-breaking rules (priority order, matching `add-cross-backend-osm-id-dedup`
// design D2):
//   1. Both timestamps parseable, strictly different → newer wins.
//   2. Exactly one is parseable → the parseable one wins.
//   3. Otherwise (both unparseable, or equal-numeric — e.g. same instant
//      emitted in different ISO TZ formats) → URL alphabetical:
//        - prefer the side with a non-empty `_backendUrl` over one missing
//          it (defensive — post-fan-out features are always stamped, but
//          this guards against any future code path that injects features
//          via a different code path)
//        - identity collision (same `_backendUrl`) → existing wins
//          (first-write — sanctioned by spec task 2.1)
//        - else raw JS `<` compare on the unmodified URL string (no
//          case-folding, no scheme/trailing-slash normalisation)
//
// "Parseable" matches the spec's `parseable(v) ≡ v != null &&
// Number.isFinite(Date.parse(v))` predicate exactly — no shape gate.
// PostgreSQL `timestamptz` serialised through PostgREST always emits an
// ISO-8601 date+time, but partial forms like `"2026"` or `"2026-04-25"`
// (date-only) are accepted by V8's `Date.parse` and would also be treated
// as parseable here; we trust the upstream wire format rather than gating
// on a regex that disagrees with valid Postgres outputs (e.g. the
// space-separated form `"2026-04-25 12:00:00+00"` that some
// PostgREST configurations emit).
//
// Features without an `osm_id` property (shouldn't happen in practice) are
// always added — no dedup attempted.

/**
 * Test whether a `_lastImportAt` value is parseable into a valid Date.
 * Returns `{ ok, ms }` where `ms` is the parsed numeric (avoids re-parsing
 * in `dedupWinner`).
 */
function parseTimestamp(v) {
  if (v == null) return { ok: false, ms: NaN };
  const ms = Date.parse(v);
  return { ok: Number.isFinite(ms), ms };
}

function urlAlphaWinner(a, b) {
  const aUrl = a.get('_backendUrl') ?? '';
  const bUrl = b.get('_backendUrl') ?? '';
  // When one side has no _backendUrl (shouldn't happen post-fan-out, but
  // defensive against any future injection path), prefer the side with a
  // real URL — never let an unstamped feature beat a stamped one.
  if (aUrl !== '' && bUrl === '') return a;
  if (aUrl === '' && bUrl !== '') return b;
  // Identity collision: same backend serving the same osm_id twice in one
  // batch (osm2pgsql artefact for some multipolygon relations). Existing
  // wins; the second occurrence is silently dropped.
  if (aUrl === bUrl) return a;
  return aUrl < bUrl ? a : b;
}

/**
 * Given two OL Features for the same osm_id, return the one that should
 * survive. Pure function — no side effects.
 *
 * @param {import('ol/Feature.js').default} a
 * @param {import('ol/Feature.js').default} b
 * @returns {import('ol/Feature.js').default}
 */
export function dedupWinner(a, b) {
  const ta = parseTimestamp(a.get('_lastImportAt'));
  const tb = parseTimestamp(b.get('_lastImportAt'));

  // Step 1: both parseable, strictly different → newer wins.
  if (ta.ok && tb.ok) {
    if (tb.ms > ta.ms) return b;
    if (ta.ms > tb.ms) return a;
    // equal-numeric (e.g. same instant in different TZ formats) → step 3
    return urlAlphaWinner(a, b);
  }
  // Step 2: exactly one parseable → it wins.
  if (ta.ok) return a;
  if (tb.ok) return b;
  // Step 3: both unparseable → URL alphabetical.
  return urlAlphaWinner(a, b);
}

/**
 * Merge an incoming batch of features into `dedupMap`, updating the map in
 * place and returning which OL Features to add to / remove from the source.
 *
 * @param {import('ol/Feature.js').default[]} incoming
 * @param {Map<string, import('ol/Feature.js').default>} dedupMap
 *   Caller-owned map of osm_id (string) → current winning OL Feature.
 *   Modified in place.
 * @returns {{ toAdd: import('ol/Feature.js').default[], toRemove: import('ol/Feature.js').default[] }}
 */
export function applyDedup(incoming, dedupMap) {
  const toAdd    = [];
  const toRemove = [];

  for (const f of incoming) {
    const osmId = f.get('osm_id');
    if (osmId == null) {
      toAdd.push(f);
      continue;
    }
    const key      = String(osmId);
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, f);
      toAdd.push(f);
    } else {
      const winner = dedupWinner(existing, f);
      if (winner === f) {
        // Incoming beats the current winner — swap.
        dedupMap.set(key, f);
        toRemove.push(existing);
        toAdd.push(f);
      }
      // else: existing still wins, incoming is silently dropped.
    }
  }

  return { toAdd, toRemove };
}
