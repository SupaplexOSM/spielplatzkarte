//---------------------------------------------------------------//
// Spielplatzinformationen für ein ausgewähltes Feature anzeigen //
//---------------------------------------------------------------//

import $ from 'jquery';
import { Vector as VectorLayer } from 'ol/layer.js';
import Vector from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import fetchJsonp from 'fetch-jsonp/build/fetch-jsonp.js';

import Select from 'ol/interaction/Select.js';
import { pointerMove } from 'ol/events/condition.js';
import { bbox } from 'ol/loadingstrategy';
import { styleFunction } from '../style/VectorStyles.js';

import map from './map.js';
import { dataPlaygrounds } from './map.js';
import { addFilter, removeFilter } from './filter.js';
import { addShadowLayer, fillShadowMatrix } from './shadow.js';
import { objDevices } from './objPlaygroundEquipment.js';
import { objColors } from '../style/VectorStyles.js';

import { geoServer } from './map.js';

export var sourceSelected; // globale Variable, in der der jeweils ausgewählte Spielplatz enthalten ist

var targetZoom;
export function selectPlayground(coord, distance, multiSelect) {
    // GeoJSON der selektierten Spielplatzgeometrie erzeugen, um zu dessen Extent zu zoomen und dessen Attribute in der Infobox anzuzeigen
    // TODO multiSelect
    return getPlaygroundGeom(coord)
    .then((geojson) => {
        if (geojson) {
            // Spielplatzgeometrie in der source-Variable speichern
            sourceSelected = new Vector({
                features: new GeoJSON().readFeatures(geojson),
            });

            // Spielplatzattribute in der Infobox anzeigen
            showPlaygroundInfo(geojson);

            // Animationsdauer ermittln (abhängig von Entfernung zwischen Klick und Kartenmitte sowie der Differenz der Vorher-Nachher-Zoomstufe)
            // Zoomstufendifferenz ermitteln
            var extent = getSelectionExtent(30);
            var resolution = map.getView().getResolutionForExtent(extent, map.getSize());
            targetZoom = map.getView().getZoomForResolution(resolution);
            var zoomDifference = Math.abs(map.getView().getZoom() - targetZoom);

            // Animationsdauer ermitteln: 0,1 Sek. pro 150 Pixel Entfernung + 0,1 Sek pro Zoomstufe
            var duration = (distance / 150) * 100 + zoomDifference * 100;
            duration = Math.min(Math.max(duration, 0), 3000); // sicherheitshalber Extremwerte abfangen

            // zum Spielplatz zoomen
            map.getView().fit(extent, {
                size: map.getSize(),
                duration: duration,
                callback: function() {
                    // nach Abschluss der Zoom-Animation Spielplatzgeometrie anzeigen
                    showSelection(getSelectionCenter(), geojson);
                }
            });
            return geojson;
        } else {
            // Wenn nichts ausgewählt wird, Selektion entfernen und Infofenster leeren
            removeSelection(true);
            return false
        }
    });
}

// Spielplatz, Spielgeräte und Spielplatzdetails anzeigen (Aufruf üblicherweise nach dem zu diesem Spielplatz geflogen wurde)
function showSelection(coord, backupGeojson) {
    // Spielplatzgeometrie nochmal neu in aktueller Auflösung erzeugen
    // TODO: Spielplatz nach ID neu laden statt nach Position, da das Ergebnis theoretisch ein anderer Spielplatz sein könnte
    getPlaygroundGeom(coord)
    .then((geojson) => {
        // für den Fall, dass sich im Zentrum des (evtl. schlecht aufgelösten) geojsons gar keine Geometrie findet, die schlecht aufgelöste Vor-Variante zum Zeitpunkt des Klicks anzeigen
        var change = false;
        if (!geojson) {
            geojson = backupGeojson;
            change = true;
        }
        // Spielplatzgeometrie in der Source speichern
        sourceSelected = new Vector({
            features: new GeoJSON().readFeatures(geojson),
        });
        // bestehende Auswahl entfernen
        removeSelection(false);
        // Spielplatzgeometrie als Selektionsrahmen anzeigen
        showPlaygroundGeometry();
        // Spielgerätelayer anzeigen
        addEquipmentLayer(expandExtent(sourceSelected.getExtent(), 20), "spielplatzkarte:playground_equipment_polygon,spielplatzkarte:playground_equipment_way");
        addEquipmentLayer(expandExtent(sourceSelected.getExtent(), 20), "spielplatzkarte:playground_equipment_node");
        // Ausstattungs-Switch anschalten, da nach Selektion sets mindestens die Spielplatzausstattung sichtbar sein soll
        $('#layer-switch-ausstattung').prop('checked', true);
        // Schattenlayer anzeigen, falls aktiviert
        if ($('#layer-switch-schattigkeit').prop('checked')) {
            addShadowLayer();
        }
        // den selektierten Spielplatz aus dem WMS-Layer herausfiltern
        var osm_id = geojson.features[0].properties["osm_id"];
        addFilter("playgrounds", "selection", `osm_id <> ${osm_id}`);
        // Spielplatzattribute erneuern, falls es doch ein anderes geojson sein sollte
        if (change) {
            showPlaygroundInfo(geojson);
        }
    });
}

// Einen Extent um einen Betrag vergrößern
function expandExtent(extent, amount) {
    var minX = extent[0]; var minY = extent[1];
    var maxX = extent[2]; var maxY = extent[3];
    minX -= amount; maxX += amount;
    minY -= amount; maxY += amount;
    return [minX, minY, maxX, maxY];
}

// Feature eines Kartenlayers an einer bestimmten Position als JSON zurückgeben
function getPlaygroundGeom(coord) {
    // getFeatureInfo-Request an der Stelle der Mausposition
    const url = dataPlaygrounds.getSource().getFeatureInfoUrl(
        coord,
        map.getView().getResolution(),
        map.getView().getProjection(),
        {'INFO_FORMAT': 'application/json'}, // Mögliche Formate: text/plain, application/vnd.ogc.gml, text/xml, application/vnd.ogc.gml/3.1.1, text/xml; subtype=gml/3.1.1, text/html, application/json
    );
    // getFeatureInfo-Request auflösen und in ein GeoJSON umwandeln (falls es Daten/Features enthält)
    if (url) {
        return fetch(url)
        .then((response) => response.text())
        .then((json) => {
            var geoJSON = JSON.parse(json);
            if (geoJSON.features[0]) {
                return geoJSON;
            } else {
                return false;
            }
        });
    } else {
        return false;
    }
}

// Spielgerätelayer anzeigen
function addEquipmentLayer(extent, typename) {
    var isPoint = false;
    if (typename.includes("_node")) {
        isPoint = true;
    }

    var source = new Vector({
        format: new GeoJSON(),
        url: geoServer + 'geoserver/ows?' +
            'service=WFS&' +
            'version=1.1.0&' +
            'request=GetFeature&' +
            'typename=' + typename + '&' +
            'outputFormat=application/json&' +
            'srsname=EPSG:3857&' +
            'bbox=' + extent.join(',') + ',EPSG:3857',
            strategy: bbox
    });
    var layer = new VectorLayer({
        title: 'Spielplatzausstattung',
        type: 'equipment',
        typename: typename,
        visible: true,
        source: source,
        zIndex: 50,
        style: styleFunctionWrapper("default", isPoint)
    });
    map.addLayer(layer);
    // TODO: Bei move über nodes, die auf Flächen liegen, wird auch die Fläche ausgewählt
    var interaction = new Select({
        condition: pointerMove,
        layers: [layer],
        style: styleFunctionWrapper("select", isPoint)
    });
    map.addInteraction(interaction);
    return layer;
}

// das bei der Interaktion übergebene Feature mit an die Style-Funktion übergeben
var styleFunctionWrapper = function(mode, isPoint) {
    return function(feature) {
        return styleFunction(feature, mode, isPoint);
    };
};

// Auswahl aufheben, wenn herausgezoomt wird
export function checkZoomDeselection() {
    // zunächst Spielgerätelayer ausblenden, wenn etwas herausgezoomt wird
    if (sourceSelected && map.getView().getZoom() < targetZoom - 2) {
        removeSelection(true);
        // TODO Popup entfernen, falls es eins geben sollte, und Mauszeiger zurücksetzen
    }
}

// Spielplatzauswahl aufheben und seine Attribute im Infofenster ausblenden
function removeSelection(clearSource) {
    removeLayer('equipment');
    removeLayer('shadow');
    removeLayer('selection');
    removeFilter("playgrounds", 'selection');
    if (clearSource) {
        showAttributes(false);
        sourceSelected = null;
    }
}

export function removeLayer(type) {
    var selectionLayers = map.getLayers().getArray().filter(layer => (layer.getProperties()["type"] == type));
    selectionLayers.forEach(layer => {
        map.removeLayer(layer)
    });
}

// Mittelpunkt des ausgewählten Spielplatzes abfragen
function getSelectionCenter() {
    if (sourceSelected) {
        var extent = sourceSelected.getExtent()
        var center_x = extent[0] + (extent[2] - extent[0]) / 2
        var center_y = extent[1] + (extent[3] - extent[1]) / 2
        return [center_x, center_y];
    } else {
        return false;
    }
}

// Ausdehnung des ausgewählten Spielplatzes abfragen
export function getSelectionExtent(padding) {
    if (sourceSelected) {
        var extent = sourceSelected.getExtent();

        // Hinter dem Infobereich ist ebenfalls noch Karte – Selektion soll jedoch im Bereich neben dem Infofenster zentriert werden
        // also Extent rechts um den relativen Anteil des Infofensters an der Kartengröße erweitern
        // TODO Responsiv gestalten/an schmale Bildschirme anpassen
        var mapWidth = map.getSize()[0];
        var infoWidth = $('#info')[0].offsetWidth;
        var overhangPercent = infoWidth / mapWidth;
        var overhangExtent = (extent[2] - extent[0]) * overhangPercent;
        extent = [extent[0] + overhangExtent / 2, extent[1], extent[2] + overhangExtent, extent[3]];

        // als Parameter kann ein Wert in Metern übergeben werden, der um die Spielplatzgeometrie herum zum Kartenrand den Extent vergrößert
        // (um die Auswahl mittig zu halten/nicht die ganze Karte auszufüllen)
        if (padding) {
            extent = [extent[0] - padding, extent[1] - padding, extent[2] + padding, extent[3] + padding];
        }        
        return extent;
    } else {
        return false;
    }
}

// angeklickten Spielplatz in der Karte sichtbar machen
var layerSelectedPlayground = null;
function showPlaygroundGeometry() {
    var style = {
        'stroke-color': '#ff0000',
        'stroke-width': 6
    }

    layerSelectedPlayground = new VectorLayer({
        title: 'Ausgewählter Spielplatz',
        type: 'selection',
        visible: true,
        source: sourceSelected,
        zIndex: 40,

        // Styling der Spielplatzauswahl
        style: style
    });
    map.addLayer(layerSelectedPlayground);
}

export function getSelectedPlaygroundSource() {
    return sourceSelected;
}

function showPlaygroundInfo(json) {
    if (!json) {
        showAttributes(false);
        return false;
    }

    // Attribute in der Spielplatzinfo anzeigen
    var attr = json.features[0].properties;
    //console.log(attr);

    // Attribut-Elemente sichtbar machen und zu Beginn immer Ausstattung aufklappen
    showAttributes(true);
    if ($('.collapse.show').length === 0) {
        $("#accordion-ausstattung").collapse('show');
    }

    // Spielplatzname (aus verschiedenen Attributen zusammengesetzt)
    var playgroundName = getPlaygroundTitle(attr);
    $("#info-name").text(playgroundName);

    // Lagebeschreibung
    var location_str = getPlaygroundLocation(attr);
    $("#info-location").html(`<i>${location_str}</i>`);

    // Beschreibung / Bemerkungen
    var description = attr["description"];
    var description_de = attr["description:de"];
    var note = attr["note"];
    var fixme = attr["fixme"];
    var playgroundDescription = "";
    if (description_de) {
        if (!description) {
            playgroundDescription = description_de;
        } else if (description != description_de) {
            playgroundDescription = description + ' | ' + description_de;
        }
    } else if (description) {
        playgroundDescription = description;
    }
    if (note) {
        if (playgroundDescription) { playgroundDescription += "<br>"; }
        playgroundDescription += `<span class="bi bi-pencil-square"> ${note}`
    }
    if (fixme) {
        if (playgroundDescription) { playgroundDescription += "<br>"; }
        playgroundDescription += `<span class="bi bi-tools"> ${fixme}`
    }
    if (playgroundDescription) {
        playgroundDescription = `<i>${playgroundDescription}</i>`
    }
    $("#info-description").html(playgroundDescription);

    // Größe (m², gerundet auf 10m²)
    var area = attr["area"];
    var playgroundArea;
    if (area) {
        playgroundArea = `Größe: ${Math.round(area / 10) * 10}m²`;
    } else {
        playgroundArea = 'Größe: unbekannt';
    }
    $("#info-area").html(playgroundArea);

    // Zugänglichkeit
    var access = attr["access"];
    var priv = attr["private"];
    var accessDict = {
        yes: "öffentlich",
        private: "privat",
        customers: "nur für Gäste",
        no: "nicht zugänglich",
        permissive: "öffentlich geduldet",
        destination: "nur für Anlieger",
        residents: "nur für Anwohnende",
    };
    var privateDict = {
        residents: "nur für Anwohnende",
        students: "nur für Schule",
        employees: "nur für Mitarbeitende"
    };
    var playgroundAccess = "unbekannt";
    if (access in accessDict) {
        playgroundAccess = accessDict[access];
    }
    playgroundAccess = `Zugänglichkeit: ${playgroundAccess}`;
    if (priv in privateDict) {
        playgroundAccess = `Zugänglichkeit: ${privateDict[priv]}`;
    }
    $("#info-access").html(playgroundAccess);

    // Anzahl Spielgeräte
    var device_count = attr["device_count"];
    var equipment_str = "<ul>";
    if (device_count) {
        switch (device_count) {
            case 1:
                equipment_str += "<li>1 Spielgerät</li>";
                break;
            default:
                equipment_str += `<li>${device_count} Spielgeräte</li>`;
                break;
        }
    } else {
        equipment_str += "<li>noch keine Spielgeräte erfasst</li>";
    }

    // Anzahl Sitzbänke
    var bench_count = attr["bench_count"];
    if (bench_count) {
        switch (bench_count) {
            case 1:
                equipment_str += "<li>1 Sitzbank</li>";
                break;
            default:
                equipment_str += `<li>${bench_count} Sitzbänke</li>`;
                break;
        }
    } else {
        equipment_str += "<li>keine Sitzbänke <small>(oder noch keine erfasst)</small></li>";
    }

    // Anzahl Unterstände
    var shelter_count = attr["shelter_count"];
    if (shelter_count) {
        switch (shelter_count) {
            case 1:
                equipment_str += "<li>1 Unterstand</li>";
                break;
            default:
                equipment_str += `<li>${shelter_count} Unterstände</li>`;
                break;
        }
    }

    // Anzahl Picknicktische
    var picnic_count = attr["picnic_count"];
    if (picnic_count) {
        switch (picnic_count) {
            case 1:
                equipment_str += "<li>1 Picknicktisch</li>";
                break;
            default:
                equipment_str += `<li>${picnic_count} Picknicktische</li>`;
                break;
        }
    }

    // Anzahl Tischtennisplatten
    var table_tennis_count = attr["table_tennis_count"];
    if (table_tennis_count) {
        switch (table_tennis_count) {
            case 1:
                equipment_str += "<li>1 Tischtennisplatte</li>";
                break;
            default:
                equipment_str += `<li>${table_tennis_count} Tischtennisplatten</li>`;
                break;
        }
    }
    
    // mit Bolzplatz
    var has_soccer = attr["has_soccer"];
    if (has_soccer) {
        equipment_str += "<li>mit Bolzplatz</li>";
    }

    // mit Basketballkorb
    var has_basketball = attr["has_basketball"];
    if (has_basketball) {
        equipment_str += "<li>mit Basketballkorb</li>";
    }
    
    // Hinweis bei geringer Spielgerätedichte
    var device_note_str = "";
    if (device_count) {
        if (area / device_count > 500) {
            device_note_str = "<i>Die Anzahl der Spielgeräte ist recht gering im Vergleich zur Spielplatzgröße. Möglicherweise sind auf diesem Spielplatz noch nicht alle Spielgeräte erfasst.</i>";
        }     
    }

    equipment_str += "</ul>";
    $("#info-equipment").html(equipment_str);
    $("#info-device-note").html(device_note_str);

    // Bei Spielplätzen mit mindestens 8 Spielgeräten: Erstelle Liste der häufigsten Gerätegruppen
    if (device_count >= 8) {
        $("#info-device-list-title").text("Häufigste Spielgerätearten:");
        var device_list = parseDevices(attr["playground_devices"]);
        var objDeviceGroups = {
            stationary: 0,
            structure_parts: 0,
            swing: 0,
            balance: 0,
            climbing: 0,
            rotating: 0,
            sand: 0,
            water: 0,
            activity: 0,
            motion: 0
        }
        for (const device of device_list) {
            if (device in objDevices) {
                var category = objDevices[device]['category'];
                if (category in objDeviceGroups) {
                    objDeviceGroups[category]++;
                }
            }
        }
        const entries = Object.entries(objDeviceGroups);
        entries.sort(([, value1], [, value2]) => value2 - value1);
        const topThree = entries.slice(0, 3);

        var objDeviceGroupsDict = {
            stationary: "Klassische Spielgeräte",
            structure_parts: "Spielstruktur-Elemente",
            swing: "Schaukeln",
            balance: "Balancier-Elemente",
            climbing: "Kletter-Elemente",
            rotating: "Dreh- und Rotationsgeräte",
            sand: "Sandspiel-Elemente",
            water: "Wasserspiel-Elemente",
            activity: "Turn-Elemente",
            motion: "Bewegungs-Elemente"
        }
        var device_string = "";
        for (const i in topThree) {
            var category = topThree[i][0];
            var color = objColors["fallback"];
            if (category in objColors) {
                color = objColors[category];
            }
            device_string += '<p class="m-0 p-0">';
            device_string += `<span style="color: ${color}; font-size: 30px; line-height: 15px; vertical-align: sub;">●</span> `
            device_string += objDeviceGroupsDict[topThree[i][0]];
            device_string += `  <span class="badge rounded-pill text-bg-primary">${topThree[i][1]}x</span>`
            device_string += "</p>";
        }
        $("#info-device-list").html(device_string);
    } else {
        $("#info-device-list-title").text("");
        $("#info-device-list").html("");
    }

    // Spielplatzfoto(s)
    var wikimedia_commons = attr["wikimedia_commons"];
    var image = attr["image"];
    var imageURL = []; // Array, um Foto-URL's zu speichern
    var apiCall = false;

    for (const link of [wikimedia_commons, image]) {
        if (link) {
            if (link.match(/^File:.*/)) {
                // Link beginnt mit "File:" -> Bild-URL erstellen
                var url = `https://commons.wikimedia.org/wiki/Special:FilePath/${link.replace(/ /g, "_")}?width=350&height=350`;
                imageURL.push(url);
            } else if (link.match(/.*commons\.wikimedia\.org\/wiki\/File:.*/)) {
                // Link zu einer Wikimedia-File-Ressource -> in Bild-URL umwandeln
                var file = link.split("commons.wikimedia.org/wiki/")[1];
                var url = `https://commons.wikimedia.org/wiki/Special:FilePath/${file.replace(/ /g, "_")}?width=350&height=350`;
                imageURL.push(url);
            } else if (link.match(/^Category:.*/)) {
                // Link beginnt mit "Category:" -> Wikimedia-Category-URL erstellen
                // und einzelne Dateien in dieser Kategorie über Wikimedia-API abfragen
                // API-Doku: https://www.mediawiki.org/wiki/API:Categorymembers
                var url = `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${link}&cmprop=title&cmlimit=50&cmtype=file&format=json`;
                apiCall = true;

                fetchJsonp(url)
                .then((response) => response.json())
                .then((json) => {
                    // Wikimedia-API gibt ein json-Objekt mit den Titeln der enthaltenen Dateien zurück -> Bilder heraussuchen und zum Bilder-Array hinzufügen
                    for (var i = 0; i < json.query.categorymembers.length; i++) {
                        var file = json.query.categorymembers[i].title;
                        var fileUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${file.replace(/ /g, "_")}?width=350&height=350`;
                        imageURL.push(fileUrl);
                    }
                    return imageURL;
                })
                .then(() => {
                    // Sobald alle Daten angekommen sind, die Bildergalerie erstellen
                    showGalery(imageURL)
                });
            } else {
                imageURL.push(link);
            }
        }
    }
    if (!apiCall) {
        showGalery(imageURL);
    }

    // Schattigkeit
    fillShadowMatrix(attr);

    // Link zum OSM-Objekt
    var osm_id = attr["osm_id"];
    var osm_type = attr["osm_type"];
    var url;
    var typeDict = {
        N: "node",
        W: "way",
        R: "relation"
    };
    if (osm_type in typeDict) {
        osm_type = typeDict[osm_type];
        url = `https://www.openstreetmap.org/${osm_type}/${osm_id}`;
        $("#info-osm-url").attr("href", url);
    } else {
        $("#info-osm-url").hide();
    }
}

// Spielplatzname (bei Bedarf alternative Namen in Klammern ergänzen)
export function getPlaygroundTitle(attr) {
    var name = attr["name"];
    var alt_name = attr["alt_name"];
    var loc_name = attr["loc_name"];
    var official_name = attr["official_name"];
    var old_name = attr["old_name"];
    var short_name = attr["short_name"];

    var playgroundName = 'Spielplatz';
    var nameCount = 0;
    for (const n of [name, alt_name, loc_name, official_name, old_name, short_name]) {
        if (n) {
            if (!nameCount) {
                    playgroundName = n;
                } else if (nameCount == 1) {
                    playgroundName += ` (${n}`;
                } else {
                    playgroundName += `, ${n}`;
                }
            nameCount ++;
        }
    }
    if (nameCount > 1) {
        playgroundName += ")";
    }

    return playgroundName;
}

// Lagebeschreibung
export function getPlaygroundLocation(attr) {
    var site = attr["in_site"];
    var location_str = '';
    if (site) {
        location_str = site;
    } else {
        var highway = attr["nearest_highway"];
        var prefix = 'in der Nähe von';

        // Straßennamen nach Möglichkeit um eine Präposition ergänzen ("am XY-Platz", "an der XY-Straße" etc.)
        const am_list = ['weg', 'platz', 'damm', 'ring', 'ufer', 'steg', 'steig', 'pfad', 'gestell', 'park', 'garten', 'bogen'];
        for (var str of am_list) {
            if ((highway.toLowerCase().endsWith(str) | highway.toLowerCase().startsWith(str)) && !highway.startsWith('Am ')) {
                prefix = 'am';
                break;
            }
        }
        if (prefix == 'in der Nähe von') {
            const an_der_list = ['straße', 'allee', 'chaussee', 'promenade', 'gasse', 'brücke', 'zeile', 'achse', 'schleife', 'aue', 'insel'];
            for (var str of an_der_list) {
                if ((highway.toLowerCase().endsWith(str) | highway.toLowerCase().startsWith(str)) && !highway.startsWith('An der ')) {
                    prefix = 'an der';
                    break;
                }
            }    
        }
        location_str = `${prefix} ${highway}`;
    }
    return location_str;
}

function parseDevices(equipment) {
    if (!equipment) {
        return null;
    } else {
        var equipmentList = equipment.split(";").filter(element => element != "");
        return equipmentList;
    }
}

// Bildergalerie für Spielplatz erstellen und anzeigen
function showGalery(imageURL) {
    if (!imageURL.length) {
        imageURL = ['./img/image_missing.png'];
        $("#info-image-missing").show();
    } else {
        $("#info-image-missing").hide();
    }
    // Bildergalerie leeren, falls er bereits ausgewählt war
    $('#info-galery-items').empty();
    $('#info-galery-indicators').empty();

    // Duplikate aus dem Array entfernen (durch Umwandlung in ein Set/Rückumwandlung in Array)
    imageURL = [...new Set(imageURL)];
                
    // Bilder zur Galerie hinzufügen
    for (var i = 0; i < imageURL.length; i++) {
        $(`<div class="carousel-item"><img src="${imageURL[i]}" class="d-block w-100" alt="Spielplatzfoto"></div>`).appendTo('#info-galery-items');
        $(`<button type="button" data-bs-target="#info-galery" data-bs-slide-to="${i}"></button>`).appendTo('#info-galery-indicators');
    }

    // Galerie initialisieren / sichtbare Elemente aktiv setzen
    $('.carousel-item').first().addClass('active');
    $('.carousel-indicators > button').first().addClass('active');

    // Galerie-Controls ausblenden, wenn sich nur ein (oder kein) Bild in der Galerie befindet
    // TODO: Falls sich nur ein Bild in der Galerie befindet und das im Breitformat ist, sollte sich der Bilderrahmen an dessen Größe anpassen
    if (imageURL.length < 2) {
        $('#info-galery-prev').hide();
        $('#info-galery-next').hide();
        $('#info-galery-indicators').hide();
    } else {
        $('#info-galery-prev').show();
        $('#info-galery-next').show();
        $('#info-galery-indicators').show();
    }

    // Galerie sichtbar machen
    $("#info-galery").show();
}

// Attributfenster leeren, z.B. wenn ins "nichts" geklickt wird
function showAttributes(visibility) {
    if (visibility) {
        // "Klicke, um mehr zu erfahren" ausblenden
        $("#info-more").hide();

        // Attribut-Elemente einblenden
        $("#info-base").show();
        $("#info-accordion").show();
    } else {
        $("#info-more").show();

        $("#info-base").hide();
        $("#info-accordion").hide();
    
        // Bildergalerie leeren und ausblenden
        $('#info-galery-items').empty();
        $('#info-galery-indicators').empty();
        $("#info-galery").hide();
        $("#info-image-missing").hide();
    }
}

// Layer über Switch an-/abwählen
$('#layer-switch-ausstattung').on('change', function() {
    if ($(this).is(':checked')) {
        addEquipmentLayer(expandExtent(sourceSelected.getExtent(), 20), "spielplatzkarte:playground_equipment_polygon,spielplatzkarte:playground_equipment_way");
        addEquipmentLayer(expandExtent(sourceSelected.getExtent(), 20), "spielplatzkarte:playground_equipment_node");
    } else {
        removeLayer('equipment');
    }
});

$('#layer-switch-schattigkeit').on('change', function() {
    if ($(this).is(':checked')) {
        addShadowLayer();
    } else {
        removeLayer('shadow');
    }
});

// Beim ersten Klick auf die Schattigkeitsansicht den Schattenlayer in jedem Fall togglen/anzeigen
var shadowFirstActivated = false
$('#accordion-btn-schattigkeit').on('click', function() {
    if (!shadowFirstActivated) {
        $('#layer-switch-schattigkeit').prop('checked', true).trigger('change');
        shadowFirstActivated = true;
    }
});