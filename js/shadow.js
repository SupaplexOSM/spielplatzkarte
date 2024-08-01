//------------------------------------------//
// Einstellungen für die Schattenberechnung //
//------------------------------------------//

import $ from 'jquery';

import ImageWMS from 'ol/source/ImageWMS.js';
import { Image as ImageLayer } from 'ol/layer.js';

import map from './map.js';
import { mapCenter } from './map.js';
import { showNotification } from './map.js';
import { sourceSelected } from './selectPlayground.js';

import { geoServer } from './map.js';

// Slider auf aktuellen Monat und Uhrzeit einstellen
export function setCurrentDate() {
    $('#shadow-slider-month').val(getCurrentMonth()).trigger('input');
    $('#shadow-slider-hour').val(getCurrentHour()).trigger('input');
}

// Aktuellen Tag und Tageszeit ermitteln
function getCurrentMonth() {
    return new Date().getMonth() + 1;
}

function getCurrentHour() {
    return getRoundedHour(new Date().getHours());
}

export function getSliderMonth() {
    return $('#shadow-slider-month')[0].value;
}

export function getSliderHour() {
    return $('#shadow-slider-hour')[0].value;
}

function getRoundedHour(hour) {
    const allowedHours = [9, 11, 13, 15, 17, 19];
    for (let i = 0; i < allowedHours.length; i++) {
        if (hour <= allowedHours[i]) {
            return allowedHours[i];
        }
    }
    return allowedHours[allowedHours.length - 1];
}

function getValidHour(hour, month, notification) {
    const validHours = {
        1: [11, 13, 15],
        2: [9, 11, 13, 15],
        3: [9, 11, 13, 15, 17],
        4: [9, 11, 13, 15, 17],
        5: [9, 11, 13, 15, 17, 19],
        6: [9, 11, 13, 15, 17, 19],
    }
    var validMonth = getValidMonth(month);
    var validHour = getRoundedHour(hour);
    var firstHour = validHours[validMonth][0];
    var lastHour = validHours[validMonth][validHours[validMonth].length - 1];
    if (firstHour > validHour) {
        if (notification) {
            showNotification(`Um ${hour} Uhr steht die Sonne im ${objMonth[month]} noch zu tief.`);
        }
        return firstHour;
    } else if (lastHour < validHour) {
        if (notification) {
            showNotification(`Um ${hour} Uhr steht die Sonne im ${objMonth[month]} bereits zu tief.`);
        }
        return lastHour;
    } else {
        return validHour;
    }
}

export function getValidMonth(month) {
    // Dezember wird pragmatisch wie Januar/November behandelt
    if (month == 12) {
        return 1;
    }
    // Monate der zweiten Jahreshälfte entsprechen ihren gespiegelten Monaten der ersten Jahreshälfte (Juli -> Mai, August -> April etc.)
    if (month > 6) {
        return 6 - (month - 6);
    } else {
        return Math.max(1, month);
    }
}

const objMonth = {
    1: 'Januar',
    2: 'Februar',
    3: 'März',
    4: 'April',
    5: 'Mai',
    6: 'Juni',
    7: 'Juli',
    8: 'August',
    9: 'September',
    10: 'Oktober',
    11: 'November',
    12: 'Dezember'
}

var matrixMonth = null;
var matrixHour = null;

// Change-Events für Schieberegler zu Jahres- und Tageszeit
$('#shadow-slider-month').on('input', function() {
    const value = Number(this.value);
    const month_str = objMonth[value];
    $('#shadow-slider-month-label').text(month_str);
    $('#shadow-slider-hour').val(getValidHour(getSliderHour(), this.value, true)).trigger('input');
    removeMatrixBorder(matrixMonth, matrixHour);
    shadowSliderUpdate();
    matrixMonth = getSliderMonth();
});

$('#shadow-slider-hour').on('input', function() {
    var hour = getValidHour(this.value, getSliderMonth(), true);
    $('#shadow-slider-hour').val(hour);
    $('#shadow-slider-hour-label').text(`${hour} Uhr`);
    shadowSliderUpdate();
    matrixHour = getSliderHour();
});

function shadowSliderUpdate() {
    removeMatrixBorder(matrixMonth, matrixHour);
    setMatrixBorder(getSliderMonth(), getSliderHour());
    updateShadow();

    // falls ein Schattigkeitsfilter aktiviert ist, diesen ans neue Datum anpassen
    if ($('#filterShadow').is(':checked')) {
        $('#filterShadow').trigger('change');
    }
}

// Rahmen in der Schattenmatrix an Stelle der Schieber-Auswahl anzeigen
function setMatrixBorder(month, hour) {
    var matrixElement = `#shadow-matrix-${hour}-${month}`;
    $(matrixElement).css("border", '2px solid red');
}

// Bestehenden Rahmen entfernen
function removeMatrixBorder(month, hour) {
    var matrixElement = `#shadow-matrix-${hour}-${month}`;
    $(matrixElement).css("border", '0px');
}

// Popup mit Schattenangabe bei Hover über Schattenmatrix und Zeitachse hervorheben
var popup = $('#mini-popup');
$('.matrix').on('mouseover', function(event) {

    // Schattenanteil aus der Schattenmatrix über die ID des gehoverten Elements abfragen
    var id = $(this).attr('id');
    id = id.replace("shadow-matrix-", "").split('-');
    var shadowShare = shadowMatrix[id[0]][id[1] - 1];
    popup.text(`${Math.round(shadowShare)}%`).show();

    // Zeitachse an der Stelle fett hervorheben
    var axisElementHour = `#matrix-hour-${id[0]}`;
    var axisElementMonth = `#matrix-month-${id[1]}`;
    $(axisElementHour).html(`<b>${$(axisElementHour).text()}</b>`);
    $(axisElementMonth).html(`<b>${$(axisElementMonth).text()}</b>`);
});

// Popup-Position anpassen
$('.matrix').on('mousemove', function(event) {
    popup.css({
        left: event.pageX + 10,
        top: event.pageY + 10
    });
});

// Popup entfernen und Zeitachsenhervorhebung entfernen
$('.matrix').on('mouseout', function() {
    popup.hide();
    var id = $(this).attr('id');
    id = id.replace("shadow-matrix-", "").split('-');
    var axisElementHour = `#matrix-hour-${id[0]}`;
    var axisElementMonth = `#matrix-month-${id[1]}`;
    var hourStr = $(axisElementHour).text().replace("<b>", "").replace("</b>", "");
    var monthStr = $(axisElementMonth).text().replace("<b>", "").replace("</b>", "");
    $(axisElementHour).html(hourStr);
    $(axisElementMonth).html(monthStr);
});

// Über die Schattenmatrix zu einem bestimmten Zeitpunkt springen
$('.matrix').on('click', function() {
    var id = $(this).attr('id');
    id = id.replace("shadow-matrix-", "").split('-');
    $('#shadow-slider-hour').val(id[0]).trigger('input');
    $('#shadow-slider-month').val(id[1]).trigger('input');
});

// Sonnenstand berechnen - Sonnenhöhe und Azimuth 
//------------------------------------------------
// derzeit unbenutzt, da Schatten vorberechnet werden
// vgl. u.a. http://www.geoastro.de/SME/tk/index.htm und https://www.omnicalculator.com/physics/sun-angle

function getSunParam(day, hour) {
    // Deklination der Sonne
    const lat = mapCenter[1];
    const lon = mapCenter[0];
    const K = Math.PI / 180;

    const deklination = 23.45 * Math.sin(((360 * K) / 365) * (day - 81));

    const zeitgleichung = 60 * (-0.171 * Math.sin(0.0337 * day + 0.465) - 0.1299 * Math.sin(0.01787 * day - 0.168));
    const stundenwinkel = 15 * (hour - (15 - lon) / 15 - 12 + zeitgleichung / 60);

    const x = Math.sin(K * lat) * Math.sin(K * deklination) + Math.cos(K * lat) * Math.cos(K * deklination) * Math.cos(K * stundenwinkel);
    const sonnenhoehe = Math.asin(x) / K;
    const y = -(Math.sin(K * lat) * Math.sin(K * sonnenhoehe) - Math.sin(K * deklination)) / (Math.cos(K * lat) * Math.sin(Math.acos(Math.sin(K * sonnenhoehe))));
    var azimut = Math.acos(y) / K;
    if (stundenwinkel >= 0) {
        azimut = 360 - (Math.acos(y) / K);
    }

    console.log(`Sonnenhöhe: ${sonnenhoehe.toFixed(0)}, Azimut: ${azimut.toFixed(0)}`);
}

var shadowSource;

// Schattenlayer anzeigen
// TODO: Vorbild "Erfrischungskarte": https://erfrischungskarte.odis-berlin.de/ - z.B. hellere Hintergrundfarbe mittags, etwas dunkler Morgens und Abends
export function addShadowLayer() {
    // Layer zur Karte hinzufügen (falls es noch keinen gibt)
    var shadowLayers = map.getLayers().getArray().filter(layer => (layer.getProperties()["type"] == 'shadow'));
    if (shadowLayers.length > 0) {
        return;
    }
    var layerString = getLayerString(getSliderMonth(), getSliderHour());
    shadowSource = new ImageWMS({
        url: geoServer + 'geoserver/wms',
        params: {
            'LAYERS': layerString,
            'DUMMY': 0 // Dummy-Variable, die bei Bedarf verändert werden kann, um den Schatten nach Berechnung zu aktualisieren
        },
        ratio: 1,
        serverType: 'geoserver',
        crossOrigin: 'anonymous'
    });
    var layer = new ImageLayer({
        title: 'Schatten',
        type: 'shadow',
        visible: true,
        opacity: 0.25,
        source: shadowSource,
        zIndex: 30,
    });
    map.addLayer(layer);
}

function getLayerString(month, hour) {
    var validMonth = getValidMonth(month);
    var validHour = getValidHour(hour, month);
    var subs = "";
    if (validHour == 9) {
        subs = "0";
    }
    var layerString = `spielplatzkarte:shadow_0${validMonth}_${subs}${validHour}`;
    return layerString;
}

const objShadowDescription = {
    0: 'fast gar kein Schatten',
    10: 'sehr wenig Schatten',
    20: 'wenig Schatten',
    30: 'eher wenig Schatten',
    40: 'mäßig viel Schatten',
    50: 'mittel viel Schatten',
    60: 'eher viel Schatten',
    70: 'viel Schatten',
    80: 'sehr viel Schatten',
    90: 'fast nur Schatten',
    100: 'nur Schatten'
}

function updateShadow() {
    // Schattenbalken/-statistik entsprechend der Auswahl setzen
    var validHour = getValidHour(getSliderHour(), getSliderMonth());
    var validMonth = getValidMonth(getSliderMonth());
    var shadowShare = shadowMatrix[validHour][validMonth - 1];
    $('#shadow-bar').css("width", shadowShare + "%");
    $('#shadow-percent-value').text(Math.round(shadowShare));

    var shadowRoundShare = Math.floor(Math.round(shadowShare) / 10) * 10;
    var shadowDescription = objShadowDescription[shadowRoundShare];
    if (shadowShare == 0) {
        shadowDescription = 'gar kein Schatten';
    }
    $('#shadow-percent-description').text(shadowDescription);

    // Schattenlayer aktualisieren
    if (!shadowSource) {
        return;
    }
    var layerString = getLayerString(validMonth, validHour);
    shadowSource.getParams()['LAYERS'] = layerString;
    shadowSource.getParams()['DUMMY']++; // Dummy-Variable stets erhöhen, damit mit Sicherheit eine Parameter-Änderung stattfindet
    shadowSource.updateParams();
}

const objShadowMatrixColor = {
    0: '#fff889',
    10: '#fff65c',
    20: '#fef32f',
    30: '#e8de15',
    40: '#c2bb07',
    50: '#a59d00',
    60: '#8c8700',
    70: '#746f00',
    80: '#5d5800',
    90: '#474300'
}

var shadowMatrix = {
    //  [ J  , F  , M  , A  , M  , J  , J  , A  , S  , O  , N  , D  ]
     9: [null, 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 ,null,null],
    11: [ 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 ],
    13: [ 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 ],
    15: [ 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 , 99 ],
    17: [null,null, 99 , 99 , 99 , 99 , 99 , 99 , 99 ,null,null,null],
    19: [null,null,null,null, 99 , 99 , 99 ,null,null,null,null,null]
}

export function fillShadowMatrix(attr) {
    for (let month = 1; month <= 12; month ++) {
        for (let hour = 1; hour <= 19; hour += 2) {
            if (getValidHour(hour, month) != hour) {
                continue;
            }
            var validMonth = getValidMonth(month);
            var layerString = getLayerString(month, hour);
            var shadowString = layerString.replace("spielplatzkarte:", "");
            var shadowShare = attr[shadowString];
            shadowMatrix[hour][month - 1] = shadowShare;
            var color = '#e0e0e0';
            for (const step in objShadowMatrixColor) {
                if (Number(step) + 10 >= shadowShare) {
                    color = objShadowMatrixColor[step];
                    break;
                }
            }
            var htmlStr = `#shadow-matrix-${hour}-${month}`;
            $(htmlStr).css("background-color", color);
        }
    }

    // mittleren Schatten vor-/nachmittags ermitteln
    var valuesMorning = shadowMatrix[9].filter(val => !isNaN(val) && val !== null).concat(shadowMatrix[11].filter(val => !isNaN(val) && val !== null));   
    var valuesAfternoon = shadowMatrix[15].filter(val => !isNaN(val) && val !== null).concat(shadowMatrix[17].filter(val => !isNaN(val) && val !== null));

    var sumMorning = 0;
    valuesMorning.forEach(val => {
        sumMorning += val;
    });
    var sumAfternoon = 0;
    valuesAfternoon.forEach(val => {
        sumAfternoon += val;
    });
    var shareMorning = Math.round(sumMorning / valuesMorning.length);
    var shareAfternoon = Math.round(sumAfternoon / valuesAfternoon.length);
    var roundMorning = Math.floor(shareMorning / 10) * 10;
    var roundAfternoon = Math.floor(shareAfternoon / 10) * 10;
    var descMorning = objShadowDescription[roundMorning];
    var descAfternoon = objShadowDescription[roundAfternoon];
    if (shareMorning == 0) {
        descMorning = 'gar kein Schatten';
    }
    if (shareAfternoon == 0) {
        descAfternoon = 'gar kein Schatten';
    }
    $('#shadow-description-morning').text(descMorning);
    $('#shadow-description-afternoon').text(descAfternoon);

    updateShadow();
}