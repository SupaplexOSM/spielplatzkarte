// Pure helper functions for playground display logic.
// Ported from js/selectPlayground.js.

/**
 * Build a display title from OSM name tags.
 * @param {Object} attr - feature properties
 * @param {Function} t - svelte-i18n translate function (optional)
 */
export function getPlaygroundTitle(attr, t) {
    const parts = [attr.name, attr.alt_name, attr.loc_name, attr.official_name, attr.old_name, attr.short_name]
        .filter(Boolean);
    if (!parts.length) return t ? t('nearby.defaultName') : 'Spielplatz';
    if (parts.length === 1) return parts[0];
    return `${parts[0]} (${parts.slice(1).join(', ')})`;
}

/** Build a human-readable location hint from nearest_highway or in_site tags. */
export function getPlaygroundLocation(attr, t) {
    if (attr.in_site) return attr.in_site;
    const highway = attr.nearest_highway;
    if (!highway) return '';

    const values = { values: { name: highway } };
    if (!t) return `in der Nähe von ${highway}`;

    const am = ['weg', 'platz', 'damm', 'ring', 'ufer', 'steg', 'steig', 'pfad',
                 'gestell', 'park', 'garten', 'bogen'];
    const an_der = ['straße', 'allee', 'chaussee', 'promenade', 'gasse', 'brücke',
                    'zeile', 'achse', 'schleife', 'aue', 'insel'];
    const h = highway.toLowerCase();

    if (am.some(s => h.endsWith(s) || h.startsWith(s)) && !highway.startsWith('Am '))
        return t('location.am', values);
    if (an_der.some(s => h.endsWith(s) || h.startsWith(s)) && !highway.startsWith('An der '))
        return t('location.anDer', values);
    return t('location.near', values);
}

/** Haversine distance in metres between two WGS84 points. */
export function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Format a distance in metres for display, using browser locale. */
export function formatDistance(m) {
    if (m < 1000) return `~${Math.round(m / 10) * 10} m`;
    return `~${(m / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** Bearing in degrees (0 = N, 90 = E) between two points. */
export function bearingDeg(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Returns a compass direction key suitable for $_('compass.KEY'). */
export function bearingToDir(deg) {
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}
