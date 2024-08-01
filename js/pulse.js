//--------------------------------------------------//
// Erzeugt ein pulsierendes Signal an einem Zielort //
//--------------------------------------------------//

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Fill from 'ol/style/Fill.js';
import { Circle, Stroke, Style } from 'ol/style.js';
import { Vector as VectorSource } from 'ol/source.js';
import { Vector as VectorLayer } from 'ol/layer.js';

import map from './map.js';

var pulseFeature = new Feature();
const pulseLayer = new VectorLayer({
    map: map,
    title: 'Puls',
    type: 'pulse',
    visible: false,
    source: new VectorSource({
        features: [pulseFeature],
    }),
});

var counter = 0;
var interval = null;

export function pulse(coordinates) {
    pulseFeature.setGeometry(coordinates ? new Point(coordinates) : null);
    pulseFeature.setStyle(
        new Style({
            image: new Circle({
                radius: 4,
                fill: new Fill({
                    color: [46, 67, 215, 0.4],
                }),
                stroke: new Stroke({
                    color: [46, 67, 215, 1],
                    width: 3,
                }),
            }),
        }),
    );
    pulseLayer.setProperties({"visible": true});
    counter = 0;
    interval = setInterval(fadeFeature, 24);
}

function fadeFeature() {
    ++counter;
    if (counter * 0.01 >= 1) {
        clearInterval(interval);
        pulseLayer.setProperties({"visible": false});
        return;
    }
    pulseFeature.setStyle(
        new Style({
            image: new Circle({
                radius: 4 + counter,
                fill: new Fill({
                    color: [46, 67, 215, Math.max(0.4 - counter * 0.01, 0)],
                }),
                stroke: new Stroke({
                    color: [46, 67, 215, Math.max(1 - counter * 0.01, 0)],
                    width: 2,
                }),
            }),
        }),
    );
}