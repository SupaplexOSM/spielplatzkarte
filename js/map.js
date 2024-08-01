//----------------------------//
// Hauptkarte und deren Layer //
//----------------------------//

import 'bootstrap/dist/css/bootstrap.min.css';
import { Popover, Toast } from 'bootstrap';

import $ from 'jquery';
import '../css/style.css';
import { Map, View } from 'ol';
import { Image as ImageLayer, Tile as TileLayer } from 'ol/layer.js';
import ImageWMS from 'ol/source/ImageWMS.js';
import XYZ from 'ol/source/XYZ.js';
import SourceOSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON.js';
import { transform, transformExtent } from 'ol/proj';
import MousePosition from 'ol/control/MousePosition.js';
import { ScaleLine, defaults as defaultControls } from 'ol/control.js';
import Overlay from 'ol/Overlay.js';
import {defaults} from 'ol/interaction/defaults';

import { getFilter } from './filter.js';
import { selectPlayground, getSelectedPlaygroundSource, getSelectionExtent, checkZoomDeselection } from './selectPlayground.js';
import { showPopup } from './popup.js';

// Anpassbare Karteneinstellungen
//--------------------------------
export const mapCenter = [13.3888, 52.5170];            // Kartenzentrum (wird auch für die Formel zur Berechnung des Sonnenstands an diesem Ort verwendet)
const mapZoom = 12;                                     // Zoomstufe bei Start
const mapMinZoom = 12;                                  // kleinste mögliche Zoomstufe
export const mapExtent = [12.9494, 52.2577, 13.8126, 52.7928]; // Kartenausdehnung

// URL des GeoServers
export const geoServer = 'https://osmbln.uber.space/'; //'http://localhost:8080/'; //'https://osmbln.uber.space/';

// Basemaps
//----------

// Datenstand an die Attribution anhängen
import dataDate from '../data/data_date.js';
const dataDateStr = ` | Datenstand Spielplätze: ${dataDate}`;

// TODO: Mit einer LayerGroup arbeiten, die alle Basemaps gruppiert?
let basemapGeofabrikBasicColor = new TileLayer({
    title: 'Geofabrik Basic Color',
    type: 'base',
    visible: false,
    source: new XYZ({
        url: 'https://tile.geofabrik.de/f4b99c53772daf077663f1032c85fb9e/{z}/{x}/{y}.png',
        attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | &copy; <a href="https://www.geofabrik.de/">Geofabrik</a>' + dataDateStr,
    })
});

let basemapCartoDBVoyager = new TileLayer({
    title: 'CartoDB Voyager',
    type: 'base',
    visible: false,
    source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | &copy; <a href="https://carto.com/attributions">CARTO</a>' + dataDateStr,
    })
});

let basemapOpenStreetMapMapnik = new TileLayer({
    title: 'OpenStreetMap Mapnik',
    type: 'base',
    visible: true,
    source: new SourceOSM({
        attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' + dataDateStr,
    }),
    opacity: 0.67 // etwas transparent, da sonst zu dunkel
});

let basemapEsriWorldImagery = new TileLayer({
    title: 'Luftbild',
    type: 'base',
    visible: false,
    source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' + dataDateStr,
    })
});

// Daten-Layer
//-------------

// Spielplatzblasen
var sourcePlaygrounds = new ImageWMS({
    url: geoServer + 'geoserver/wms',
    params: {
        'LAYERS': 'spielplatzkarte:playgrounds',
        'CQL_FILTER': getFilter()
    },
    ratio: 1,
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
});

export var dataPlaygrounds = new ImageLayer({
    title: 'Spielplätze',
    type: 'playgrounds',
    visible: true,
    source: sourcePlaygrounds,
    zIndex: 10,
});

// Datenprobleme
var sourceIssues = new ImageWMS({
    url: geoServer + 'geoserver/wms',
    params: {
        'LAYERS': 'spielplatzkarte:completeness',
        'CQL_FILTER': ""
    },
    ratio: 1,
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
});

export var dataIssues = new ImageLayer({
    title: 'Datenprobleme',
    type: 'issues',
    visible: false,
    source: sourceIssues,
    zIndex: 100,
});

// Gerätefinder
export var sourceFilteredEquipment = new ImageWMS({
    url: geoServer + 'geoserver/wms',
    params: {
        'LAYERS': 'spielplatzkarte:playground_equipment',
        'CQL_FILTER': ""
    },
    ratio: 1,
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
});

export var dataFilteredEquipment = new ImageLayer({
    title: 'Spielgerätefinder',
    type: 'equipment_filter',
    visible: false,
    source: sourceFilteredEquipment,
    zIndex: 200,
});

// Controls
//----------
// Control für Mausposition
const mousePositionControl = new MousePosition({
    coordinateFormat: customCoordinateFormat,
    projection: 'EPSG:4326',
    className: 'custom-mouse-position',
    target: $('#mouse-position')[0],
});

function customCoordinateFormat(coordinate) {
    // Koordinaten umkehren (Y, X) und auf 5 Dezimalstellen runden
    const y = coordinate[1].toFixed(5);
    const x = coordinate[0].toFixed(5);
    return y + ', ' + x;
}

// Control für Maßstab
const scaleControl = new ScaleLine({
    units: 'metric',
    bar: false,
    text: false,
    minWidth: 100
});

// Karte im DOM erzeugen
//-----------------------
var map = null; // map schon vor der View leer definieren, damit check auf die Variable in View -> calcMapCenter() funktioniert
const view = new View({
    center: calcMapCenter(),
    zoom: mapZoom,
    minZoom: mapMinZoom,
    extent: transformExtent(mapExtent, 'EPSG:4326', 'EPSG:3857')
});

// Kartenzentrum je nach Breite des Infofensters verschieben
// (sodass sich das Zentrum auf den Raum neben dem Infofenster bezieht, nicht auf die Gesamtkarte, die hinter dem Infofenster weitergeht)
function calcMapCenter() {
    var center = transform(mapCenter, 'EPSG:4326', 'EPSG:3857');
    var resolution;
    if (map) {
        resolution = map.getView().getResolution();
    } else {
        // bei Ermittlung des Kartenzentrums für View beim Starten der Seite
        var maxResolution = 156543.03392804097; // höchste Auflösung bei Zoomstufe 0 (vgl. https://openlayers.org/en/latest/apidoc/module-ol_View.html)
        resolution = maxResolution / Math.pow(2, mapZoom);
    }
    var infoWidth = $('#info')[0].offsetWidth;
    var offset = resolution * infoWidth;

    center = [center[0] + offset / 3, center[1]];
    return center;
}

var popup = new Overlay({
    element: $('#popup')[0]
});

map = new Map({
    target: 'map',
    controls: defaultControls().extend([mousePositionControl, scaleControl]),
    layers: [basemapGeofabrikBasicColor, basemapCartoDBVoyager, basemapOpenStreetMapMapnik, basemapEsriWorldImagery, dataPlaygrounds, dataIssues, dataFilteredEquipment],
    overlays: [popup],
    view: view,
    // keine Kartenrotation erlauben
    interactions: defaults({
        altShiftDragRotate: false,
        pinchRotate: false,
    }),
});

export default map;

// Push notifications
//--------------------
const toast = document.getElementById('toast');
const toastBootstrap = Toast.getOrCreateInstance(toast);

export function showNotification(message) {
    $("#toast-text").html(message);
    toastBootstrap.show();
}

// Funktionen
//------------

// Spielplatzinfos bei Klick anzeigen
map.on('click', function(evt) {
    // Selektion des Spielplatzes auslösen, wenn der Klick nicht innerhalb eines selektierten Spielplatzes stattfindet
    var coordinate = evt.coordinate;
    if (!cursorInSelection(coordinate)) {
        // Entfernung in Pixeln zwischen Bildschirmmitte und Klickposition ermitteln (beeinfusst Dauer der Fluganimation)
        var mapSize = map.getSize();
        var centerX = mapSize[0] / 2;
        var centerY = mapSize[1] / 2;
        var clickPos = evt.pixel;
        var dX = Math.abs(centerX - clickPos[0]);
        var dY = Math.abs(centerY - clickPos[1]);
        var distance = Math.sqrt(dX * dX + dY * dY);

        // TODO: Bei gedrückter Strg-Taste eine Mehrfachauswahl erzeugen
        const multiSelect = evt.originalEvent.ctrlKey;

        selectPlayground(coordinate, distance, multiSelect);

        // Popovers ausblenden
        const element = popup.getElement();
        var popover = Popover.getInstance(element);
        if (popover) {
            popover.hide();
        }
    }    
});

// Mouse-Move-Events (Popups anzeigen, Cursor ändern)
map.on('pointermove', function(evt) {

    var pixel = evt.pixel;
    var coordinate = evt.coordinate;

    // Prüfen, ob sich Mauszeiger innerhalb eines selektierten Spielplatzes befindet, um Cursor zu ändern
    if (cursorInSelection(coordinate) && !evt.dragging && !$('#map')[0].classList.contains('grabbing')) {
        $('#map')[0].classList.remove('grab');
        $('#map')[0].classList.remove('grabbing');
        $('#map')[0].classList.add('info');
    } else {
        $('#map')[0].classList.remove('info');
        if (evt.dragging) {
            $('#map')[0].classList.add('grabbing');
        } else {
            $('#map')[0].classList.add('grab');
        }
    }

    const element = popup.getElement();
    var popover = Popover.getInstance(element);
    var popupFeature = null;

    // Prüfen, ob sich an Mausposition ein Datenproblem befindet
    const data_issues = dataIssues.getData(pixel);
    const hit_issues = data_issues && data_issues[3] > 0; // transparent pixels have zero for data[3]

    // falls nicht, dann Popup mit Infos zu Spielgeräten anzeigen
    if (!hit_issues) {
        var features = [];
        var equipmentLayers = map.getLayers().getArray().filter(layer => layer.getProperties()["type"] == 'equipment');
        if (equipmentLayers) {
            map.forEachFeatureAtPixel(pixel, function(feature, layer) {
                if (!equipmentLayers.includes(layer)) {
                    return;
                }
                features.push(feature);
            });
            if (features.length) {
                const feature = features[0];
                popupFeature = feature;
            }  
        }

        // Gibt es an der Mausposition Spielplatzequipment, dann Popup erzeugen (und in jedem Fall den Cursor ändern)
        if (popupFeature) {
            map.getTargetElement().style.cursor = 'help';
            showPopup('equipment', popup, coordinate, popupFeature);
        }
    }

    // falls an Mausposition kein Spielplatzequipment vorhanden ist (oder ein Datenproblem vorhanden ist), auf Popup für Spielplatz (oder Datenproblem) prüfen
    if (!popupFeature) {
        // um Infos zum Datenproblem oder Namen des Spielplatzes als Popup anzeigen
        const data_playgrounds = dataPlaygrounds.getData(pixel);
        var active = "playgrounds";
        var data = dataPlaygrounds.getData(pixel);
        if (dataIssues.get("visible")) {
            data = dataIssues.getData(pixel);
            active = "issues";
        }
        const hit_playgrounds = data_playgrounds && data_playgrounds[3] > 0; // transparent pixels have zero for data[3]

        if (hit_playgrounds) {
            map.getTargetElement().style.cursor = 'pointer';
        }
        if (hit_issues) {
            map.getTargetElement().style.cursor = 'help';
        }
        if (hit_playgrounds | hit_issues) {
            var src;
            if (active == "playgrounds") {
                src = sourcePlaygrounds;
            } else {
                src = sourceIssues;
            }
            const url = src.getFeatureInfoUrl(
                coordinate, map.getView().getResolution(), 'EPSG:3857',
                { 'INFO_FORMAT': 'application/json' }
            );
            if (url) {
                fetch(url)
                    .then(response => response.json())
                    .then(data => {
                        if (data.features.length > 0) {

                            // Popup für WMS-Layer soll sich nicht an Mausposition, sondern in Featuremitte befinden, da WMS zu langsam reagiert
                            // -> Ausdehung der Geometrie des Features an Mausposition ermitteln / Mittelpunkt ableiten
                            const feature = data.features[0];
                            var extent = new GeoJSON().readFeature(feature).getGeometry().getExtent();

                            var x = extent[0] + (extent[2] - extent[0]) / 2;
                            var y = extent[3] - (extent[3] - extent[1]) / 5; // Popup weiter oben anzeigen, damit es möglichst nicht im Weg ist beim klicken
                            // TODO: Bei Klick auf das Popup wird ebenfalls der Spielplatz selektiert
                            coordinate = [x, y];

                            if (active == "playgrounds") {
                                showPopup('playground', popup, coordinate, feature);
                            } else {
                                showPopup('issues', popup, coordinate, feature);
                            }
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching feature info:', error);
                    });
            }    
        } else {
            map.getTargetElement().style.cursor = '';
            if (popover) {
                popover.hide();
            }
        }
    }
});

// beim Rauszoomen prüfen, ob die Auswahl entfernt werden kann, wenn man zu weit vom selektierten Spielplatz wegzoomt
map.on('moveend', function() {
    checkZoomDeselection();
});

// Steuerung der Maus-Cursor auf der Hauptkarte
map.on('pointerdown', function() {
    $('#map')[0].classList.remove('grab');
    $('#map')[0].classList.remove('info');
    $('#map')[0].classList.add('grabbing');
});
  
map.on('pointerup', function(evt) {
    $('#map')[0].classList.remove('grabbing');
    if (cursorInSelection(evt.coordinate)) {
        $('#map')[0].classList.add('info');
    } else {
        $('#map')[0].classList.add('grab');
    }
});

map.on('pointerout', function() {
    $('#map')[0].classList.remove('grabbing');
    $('#map')[0].classList.add('grab');
});

// Prüfen, ob sich Mauszeiger innerhalb eines selektierten Spielplatzes befindet
function cursorInSelection(coord) {
    var selectedPlaygroundSource = getSelectedPlaygroundSource();
    if (selectedPlaygroundSource) {
        return selectedPlaygroundSource.forEachFeature(function(feature) {
            const geometry = feature.getGeometry();
            if (geometry.intersectsCoordinate(coord)) {
                return true;
            }
            return false;
        });
    }
    return false;
}

// Kartenmaßstab ermitteln
export function getMapScale() {
    const resolution = map.getView().getResolution();
    const scale = resolution * 96 * 39.37 // merkwürdiger Faktor aus DPI und Darstellungsbreite eines Meters, grob angenähert
    return scale;
}

// Layerauswahl - Dropdown mit verfügbaren Basemaps füllen
var selectBasemap = $("#select-basemap")[0];
var mapLayers = map.getLayers().getArray();
for (let i = 0; i < mapLayers.length; i++) {
    if (mapLayers[i].getProperties()["type"] == 'base') {
        var layerTitle = mapLayers[i].getProperties()["title"];
        var option = document.createElement("option");
        option.text = layerTitle;
        selectBasemap.add(option);
        if (mapLayers[i].getProperties()["visible"] == true) {
            selectBasemap.value = layerTitle;
        };
    }
};

// Basemap bei Auswahl im Dropdown ändern
$('#select-basemap').on('change', function() {
    var mapLayers = map.getLayers().getArray();
    for (let i = 0; i < mapLayers.length; i++) {
        if (mapLayers[i].getProperties()["type"] == 'base') {
            if (mapLayers[i].getProperties()["title"] == this.value) {
                mapLayers[i].setProperties({"visible": true});
            } else {
                mapLayers[i].setProperties({"visible": false});
            }
        }
    }
});

// Klick auf Koordinaten dient als Debugging-Testbutton
$('#mouse-position').on('click', function() {
    console.log(`Zoomstufe: ${map.getView().getZoom()}\nKartenmaßstab: ${getMapScale()}\nKartengröße: ${map.getSize()} Pixel\nAusdehnung der Auswahl: ${getSelectionExtent()} (${transformExtent(getSelectionExtent(), 'EPSG:3857', 'EPSG:4326')})`);
});