//-------------------//
// Suche (Nominatim) //
//-------------------//

import $ from 'jquery';
import { fromLonLat, transform } from 'ol/proj';
import map from './map.js';
import { mapExtent } from './map.js';
import { showNotification } from './map.js';
import { pulse } from './pulse.js';

// Suchanfragen starten
$('#inputSearch').on('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = $('#inputSearch')[0].value;
        if (query) {
            searchLocation(query);
        }
    }
});

$('#inputSearchIcon').on('click', function() {
    const query = $('#inputSearch')[0].value;
    if (query) {
        searchLocation(query);
    }
});

var coord = null;

// Funktion zur Suche
export async function searchLocation(query) {
    // Suche auf mapExtent beschränken und zum ersten Treffer zoomen
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&viewbox=${mapExtent[0]},${mapExtent[1]},${mapExtent[2]},${mapExtent[3]}`;
    try {
        const response = await fetch(url);
        const results = await response.json();
        if (results.length > 0) {
            const result = results[0];
            coord = fromLonLat([parseFloat(result.lon), parseFloat(result.lat)]);

            // zur gefundenen Position fliegen
            map.getView().animate({ center: coord, zoom: 18 }, searchPulse);

            // Notification zum gesuchten Ort ausgeben
            var coord_4326 = transform(coord, 'EPSG:3857', 'EPSG:4326');
            coord_4326 = `${coord_4326[0].toFixed(5)}, ${coord_4326[1].toFixed(5)}`;
            var notification = `"${query}" gefunden`;
            var addr_suburb = result.address.suburb;
            if (addr_suburb) {
                notification += ` in ${addr_suburb}`;
            }
            notification += ` (${coord_4326}).`;
            showNotification(notification);
        } else {
            showNotification("Kein Suchergebnis gefunden!");
        }
    } catch (error) {
        console.error('Fehler bei der Suchanfrage:', error);
    }
}

function searchPulse() {
    pulse(coord);
}