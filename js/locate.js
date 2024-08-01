//-----------------------------------//
// Standortverfolgung de-/aktivieren //
//-----------------------------------//

import $ from 'jquery';

import Feature from 'ol/Feature.js';
import Geolocation from 'ol/Geolocation.js';
import Point from 'ol/geom/Point.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import { Vector as VectorSource } from 'ol/source.js';
import { Vector as VectorLayer } from 'ol/layer.js';

import map from './map.js';

const btnLocator = $('#btn-location')[0];
var btnLocatorActive = false;

// Standort verfolgen de-/aktivieren
$('#btn-location').on('click', function() {
    btnLocatorActive = !btnLocatorActive;
    if (btnLocatorActive) {
        btnLocator.classList.add("buttonActive");
        showLocation();
    } else {
        btnLocator.classList.remove("buttonActive");
        hideLocation();
    }
});

// Standortverfolgung aktivieren
export function showLocation() {
    geolocation.setTracking(true);
    locatorLayer.setProperties({"visible": true});
}

// Standortverfolgung deaktivieren
export function hideLocation() {
    geolocation.setTracking(false);
    locatorLayer.setProperties({"visible": false});
    locatorLayer.getSource().changed();
}

// Geolocation-Handling
const geolocation = new Geolocation({
    // enableHighAccuracy must be set to true to have the heading value.
    trackingOptions: {
        enableHighAccuracy: true,
    },
    projection: map.getView().getProjection(),
});

geolocation.on('error', function (error) {
    console.log("Standortverfolgung nicht möglich.");
});

const accuracyFeature = new Feature();

geolocation.on('change:accuracyGeometry', function () {
    accuracyFeature.setGeometry(geolocation.getAccuracyGeometry());
});

const positionFeature = new Feature();
positionFeature.setStyle(
    new Style({
        image: new CircleStyle({
            radius: 6,
            fill: new Fill({
                color: '#3399CC',
            }),
            stroke: new Stroke({
                color: '#fff',
                width: 2,
            }),
        }),
    }),
);

geolocation.on('change:position', function () {
    const coordinates = geolocation.getPosition();
    positionFeature.setGeometry(coordinates ? new Point(coordinates) : null);
    map.getView().animate({ center: coordinates });
});

const locatorLayer = new VectorLayer({
    map: map,
    title: 'Standort',
    type: 'location',
    visible: true,
    source: new VectorSource({
        features: [accuracyFeature, positionFeature],
    }),
});