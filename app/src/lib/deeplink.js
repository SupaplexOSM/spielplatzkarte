// URL hash parser / writer supporting two forms:
//
//   #W<osm_id>             — legacy; no backend slug
//   #<slug>/W<osm_id>      — new; <slug> identifies a backend in registry.json
//
// Standalone ignores any slug (there is only one backend). Hub uses the slug
// to scope selection to a specific backend, falling back to broadcast search
// when the slug is absent.
//
// Slug format: [a-z0-9-]+ (lowercase ASCII, digits, hyphens).

const SLUG_RE = /^[a-z0-9-]+$/;
const WITH_SLUG_RE = /^#([a-z0-9-]+)\/W(\d+)$/;
const LEGACY_RE = /^#W(\d+)$/;

/**
 * Parse a URL hash into `{ slug, osmId }`, or return `null` if the hash does
 * not match either supported form.
 *
 * @param {string} hash
 * @returns {{ slug: string | null, osmId: number } | null}
 */
export function parseHash(hash) {
  if (!hash) return null;
  const h = hash.startsWith('#') ? hash : `#${hash}`;

  const withSlug = h.match(WITH_SLUG_RE);
  if (withSlug) {
    return { slug: withSlug[1], osmId: parseInt(withSlug[2], 10) };
  }

  const legacy = h.match(LEGACY_RE);
  if (legacy) {
    return { slug: null, osmId: parseInt(legacy[1], 10) };
  }

  return null;
}

/**
 * Build a URL hash for a selected playground. Emits the legacy form when the
 * slug is missing or invalid; otherwise the prefixed form.
 *
 * @param {{ slug?: string | null, osmId: number }} selection
 * @returns {string} the full hash including the leading `#`
 */
export function writeHash({ slug, osmId }) {
  if (slug && SLUG_RE.test(slug)) {
    return `#${slug}/W${osmId}`;
  }
  return `#W${osmId}`;
}

/** Returns true if `value` is a valid registry slug. */
export function isValidSlug(value) {
  return typeof value === 'string' && SLUG_RE.test(value);
}
