// Mangrove.reviews integration — pure functions (no DOM).
// Identity is a P-256 keypair stored in localStorage.
// Subject URI: geo:{lat},{lon}?u=50  (50 m uncertainty for a polygon)
// Rating scale: 0–100 (we show 1–5 stars = 20/40/60/80/100)

const MANGROVE_API = 'https://api.mangrove.reviews';
const LS_KEY = 'spieli-mangrove-keypair';
const LS_KEY_LEGACY = 'spielplatzkarte-mangrove-keypair';

// ── Key management ─────────────────────────────────────────────────────────

function migrateLegacyKey() {
    const legacy = localStorage.getItem(LS_KEY_LEGACY);
    if (legacy && !localStorage.getItem(LS_KEY)) {
        localStorage.setItem(LS_KEY, legacy);
        localStorage.removeItem(LS_KEY_LEGACY);
    }
}

export async function loadOrGenerateKeypair() {
    migrateLegacyKey();
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
        const { priv, pub } = JSON.parse(stored);
        const privateKey = await crypto.subtle.importKey(
            'jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
        const publicKey  = await crypto.subtle.importKey(
            'jwk', pub,  { name: 'ECDSA', namedCurve: 'P-256' }, true,  ['verify']);
        return { privateKey, publicKey };
    }
    // Generate extractable only long enough to export to localStorage, then
    // re-import with extractable:false so the in-memory key cannot be re-exported.
    // The JWK in localStorage is an accepted risk for pseudonymous Mangrove identity.
    const tempKp = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const priv = await crypto.subtle.exportKey('jwk', tempKp.privateKey);
    const pub  = await crypto.subtle.exportKey('jwk', tempKp.publicKey);
    localStorage.setItem(LS_KEY, JSON.stringify({ priv, pub }));
    const privateKey = await crypto.subtle.importKey(
        'jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const publicKey  = await crypto.subtle.importKey(
        'jwk', pub,  { name: 'ECDSA', namedCurve: 'P-256' }, true,  ['verify']);
    return { privateKey, publicKey };
}

async function publicKeyToPem(publicKey) {
    const spki = await crypto.subtle.exportKey('spki', publicKey);
    const b64  = btoa(String.fromCharCode(...new Uint8Array(spki)));
    return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
}

// ── JWT helpers ────────────────────────────────────────────────────────────

function b64url(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    return btoa(String.fromCharCode(...bytes))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlBytes(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// ── Subject URI ────────────────────────────────────────────────────────────

export function mangroveSubject(lat, lon, osmId) {
    const q = osmId ? `osm_playground_${osmId}` : 'playground';
    return `geo:${lat.toFixed(5)},${lon.toFixed(5)}?q=${q}&u=50`;
}

// ── Fetch reviews ──────────────────────────────────────────────────────────

export async function fetchReviews(lat, lon, osmId, signal) {
    const sub = mangroveSubject(lat, lon, osmId);
    const url = `${MANGROVE_API}/reviews?sub=${encodeURIComponent(sub)}&latest_edits_only=true`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.reviews ?? []).filter(r => !r.payload?.action);
}

// ── Submit review ──────────────────────────────────────────────────────────

export async function submitReview(lat, lon, osmId, rating100, opinion) {
    const kp  = await loadOrGenerateKeypair();
    const pem = await publicKeyToPem(kp.publicKey);
    const sub = mangroveSubject(lat, lon, osmId);

    const header  = { alg: 'ES256', typ: 'JWT', kid: pem };
    const payload = { iat: Math.floor(Date.now() / 1000), sub, rating: rating100 };
    if (opinion) payload.opinion = opinion;

    const msg = `${b64url(header)}.${b64url(payload)}`;
    const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        kp.privateKey,
        new TextEncoder().encode(msg),
    );
    const jwt = `${msg}.${b64urlBytes(sig)}`;

    const res = await fetch(
        `${MANGROVE_API}/submit/${encodeURIComponent(jwt)}`,
        { method: 'PUT' },
    );
    return res.ok;
}

// ── Display helpers ────────────────────────────────────────────────────────

export function starsHtml(rating100, color = '#f59e0b') {
    const n = Math.max(1, Math.min(5, Math.round(rating100 / 20)));
    return `<span style="color:${color}">${'★'.repeat(n)}</span>`
        + `<span style="color:#d1d5db">${'☆'.repeat(5 - n)}</span>`;
}

export function relativeDate(iat, t) {
    const diff = Math.floor(Date.now() / 1000 - iat);
    if (!t) {
        if (diff < 86400) return 'heute';
        const days = Math.floor(diff / 86400);
        if (days < 7)    return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
        const weeks = Math.floor(days / 7);
        if (weeks < 5)   return `vor ${weeks} Woche${weeks === 1 ? '' : 'n'}`;
        const months = Math.floor(days / 30);
        if (months < 12) return `vor ${months} Monat${months === 1 ? '' : 'en'}`;
        const years = Math.floor(days / 365);
        return `vor ${years} Jahr${years === 1 ? '' : 'en'}`;
    }
    if (diff < 86400) return t('reviews.today');
    const days = Math.floor(diff / 86400);
    if (days < 7)    return t('reviews.daysAgo', { values: { count: days } });
    const weeks = Math.floor(days / 7);
    if (weeks < 5)   return t('reviews.weeksAgo', { values: { count: weeks } });
    const months = Math.floor(days / 30);
    if (months < 12) return t('reviews.monthsAgo', { values: { count: months } });
    const years = Math.floor(days / 365);
    return t('reviews.yearsAgo', { values: { count: years } });
}
