// Panoramax — helper functions for street-level photos.

// Thumbnail URL for a Panoramax photo UUID (stable redirect to S3).
export function panoramaxThumbUrl(uuid) {
    return `https://api.panoramax.xyz/api/pictures/${uuid}/thumb.jpg`;
}

// Viewer URL for a Panoramax photo UUID.
export function panoramaxViewerUrl(uuid) {
    return `https://api.panoramax.xyz/?pic=${uuid}&nav=none&focus=pic`;
}
