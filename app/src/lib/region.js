// Fetch region metadata from Nominatim based on the OSM relation ID.
export async function fetchRegionInfo(relationId) {
    const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=R${relationId}&format=json&accept-language=de`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim lookup failed: ${res.status}`);
    const [result] = await res.json();
    const [minLat, maxLat, minLon, maxLon] = result.boundingbox.map(Number);
    return {
        name: result.name,
        extent: [minLon, minLat, maxLon, maxLat], // EPSG:4326 [minLon, minLat, maxLon, maxLat]
        center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],  // EPSG:4326
    };
}
