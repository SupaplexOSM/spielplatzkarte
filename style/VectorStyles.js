//---------------------------------------------------------------
// Generiert Styles für Vektordaten in der Spielgerätekarte 
// (dynamisch, abhängig vom Spielgerät, Selektion und Geometrie)
//---------------------------------------------------------------

// import Style from 'ol/style/Style.js';
import {Icon, Style} from 'ol/style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Circle from 'ol/style/Circle.js';

import { objDevices, objFeatures } from '../js/objPlaygroundEquipment.js';

// Standardeinstellungen für Stile
const circleRadius = 3.5;
const strokeWidth = 3.5;
const fillAlpha = 0.4;
const strokeAlpha = 1;
const selectionColor = '#ff0000'; // Farbliche Hervorhebung ausgewählter Spielgeräte
const featureColor = '#394240'; // Farbe von Ausstattungsmerkmalen, wenn sie nicht mit einem Icon dargestellt werden (insbesondere Flächen)

// Farben für Spielgerätgruppen
export const objColors = {
    stationary: '#825c46', // braun
    structure_parts: '#825c46',

    sand: '#d6a52c', // orange

    water: '#0fa1fb', // blau

    swing: '#ee4b9e', // magenta
    motion: '#ee4b9e',

    balance: '#5ab2ae', // türkis
    climbing: '#5ab2ae',
    rotating: '#5ab2ae',
    activity: '#5ab2ae',

    fallback: '#40474a' // schwarz
}

// Vom default abweichende Transparenzen für bestimmte Features
const objOpacity = {
    sandpit: 0.3
}

// Hex-Farbwert in RGB-Array umwandeln
function hexToRgb(hex) {
    hex = hex.replace('#', '');
  
    var bigint = parseInt(hex, 16);
    var r = (bigint >> 16) & 255;
    var g = (bigint >> 8) & 255;
    var b = bigint & 255;
  
    return [r, g, b];
}

// Style für jedes Objekt generieren
export function styleFunction(feature, mode, isPoint) {
    var playground = feature.get('playground');
    var category;
    var color = objColors["fallback"];
    var icon = null;
    var icon_size = null;

    if (mode == "select") {
        // ausgewählte Features sind immer knallrot
        color = selectionColor;
    } else {
        if (playground in objDevices) {
        
            // Spielgeräte: Geometrie wird farblich dargestellt
            category = objDevices[playground]['category'];
            if (category in objColors) {
                color = objColors[category];
            }
        } else {
            color = featureColor;
            featLoop: for (var feat in objFeatures) {
                var objTags = objFeatures[feat]["tags"];
                for (var key in objTags) {
                    if (feature.get(key) != objTags[key]) {
                        continue featLoop;
                    }
                }
                icon = objFeatures[feat]["icon"];
                icon_size = objFeatures[feat]["size"];
                break;
            }
        }
    }

    // Transparenz
    var alpha = fillAlpha;
    if (playground in objOpacity) {
        alpha = objOpacity[playground];
    }

    var colorRGBaFill = `rgba(${hexToRgb(color)[0]}, ${hexToRgb(color)[1]}, ${hexToRgb(color)[2]}, ${alpha})`;
    var colorRGBaStroke = `rgba(${hexToRgb(color)[0]}, ${hexToRgb(color)[1]}, ${hexToRgb(color)[2]}, ${strokeAlpha})`;
    // console.log(playground, category, color, hexToRgb(color), alpha, colorRGBaFill, colorRGBaStroke);

    // ausgewählte Features etwas dicker darstellen
    var radius = circleRadius;
    var width = strokeWidth;
    if (mode == "select") {
        radius += 2;
        width += 2;
    }

    // Sandkästen etwas schmaler umranden
    if (playground == "sandpit") {
        width -= 1;
    }

    // Stile zurückgeben
    if (isPoint) {
        if (icon) {
            return new Style({
                image: new Icon({
                    src: '../img/icons/' + icon + '.png',
                    width: icon_size,
                }),
            });
        }
        return new Style({
            image: new Circle({
                radius: radius,
                fill: new Fill({
                    color: colorRGBaFill
                }),
                stroke: new Stroke({
                    color: colorRGBaStroke,
                    width: width
                })
            })
        });
    }
    return new Style({
        fill: new Fill({
            color: colorRGBaFill
        }),
        stroke: new Stroke({
            color: colorRGBaStroke,
            width: width
        })
    });
}