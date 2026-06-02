// OL vector styles for playground polygons and equipment points.
// Ported from style/VectorStyles.js; import path updated for the new app layout.

import { Icon, Style } from 'ol/style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Circle from 'ol/style/Circle.js';

import { objDevices, objFeatures } from './objPlaygroundEquipment.js';
import { playgroundCompleteness } from './completeness.js';

// ── Playground completeness colours ──────────────────────────────────────────

function makeHatchPattern(color, bgColor) {
    const size = 10;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();
    return ctx.createPattern(canvas, 'repeat');
}

// Lazily initialised — canvas only available in browser context
let _hatchComplete, _hatchPartial, _hatchMissing;
function getHatch(type) {
    if (!_hatchComplete) {
        _hatchComplete = makeHatchPattern('rgba(34,139,34,0.55)',  'rgba(34,139,34,0.08)');
        _hatchPartial  = makeHatchPattern('rgba(180,130,0,0.55)',  'rgba(234,179,8,0.08)');
        _hatchMissing  = makeHatchPattern('rgba(200,50,50,0.55)',  'rgba(239,68,68,0.06)');
    }
    return type === 'complete' ? _hatchComplete
         : type === 'partial'  ? _hatchPartial
         : _hatchMissing;
}

const _styleComplete = new Style({
    fill: new Fill({ color: 'rgba(34, 139, 34, 0.22)' }),
    stroke: new Stroke({ color: '#155215', width: 1.5 })
});
const _stylePartial = new Style({
    fill: new Fill({ color: 'rgba(234, 179, 8, 0.22)' }),
    stroke: new Stroke({ color: '#92400e', width: 1.5 })
});
const _styleMissing = new Style({
    fill: new Fill({ color: 'rgba(239, 68, 68, 0.18)' }),
    stroke: new Stroke({ color: '#991b1b', width: 1.5 })
});

function makeHatchStyle(type) {
    const colors = {
        complete: { stroke: '#155215' },
        partial:  { stroke: '#92400e' },
        missing:  { stroke: '#991b1b' },
    };
    return new Style({
        fill: new Fill({ color: getHatch(type) }),
        stroke: new Stroke({ color: colors[type].stroke, width: 1.5, lineDash: [6, 3] })
    });
}

function isRestrictedAccess(props) {
    return props.access === 'private' || props.access === 'customers';
}

/** Style function for the playground polygon layer. */
export function playgroundStyleFn(feature) {
    const props = feature.getProperties();
    const c = playgroundCompleteness(props);
    if (isRestrictedAccess(props)) return makeHatchStyle(c);
    if (c === 'complete') return _styleComplete;
    if (c === 'partial')  return _stylePartial;
    return _styleMissing;
}

// ── Selected playground highlight ────────────────────────────────────────────

export const selectionStyle = new Style({
    fill: new Fill({ color: 'rgba(255, 0, 0, 0.15)' }),
    stroke: new Stroke({ color: '#ff0000', width: 3 })
});

// ── Equipment point / polygon styles ─────────────────────────────────────────

const circleRadius = 3.5;
const strokeWidth  = 3.5;
const fillAlpha    = 0.4;
const strokeAlpha  = 1;
const featureColor = '#394240';

// Colours by equipment category
export const objColors = {
    stationary:       '#825c46',
    structure_parts:  '#825c46',
    sand:             '#d6a52c',
    water:            '#0fa1fb',
    swing:            '#ee4b9e',
    motion:           '#ee4b9e',
    balance:          '#5ab2ae',
    climbing:         '#5ab2ae',
    rotating:         '#5ab2ae',
    activity:         '#5ab2ae',
    fallback:         '#40474a',
};

const objOpacity = { sandpit: 0.3 };

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Tree style ────────────────────────────────────────────────────────────────

export const treeStyle = new Style({
    image: new Circle({
        radius: 4,
        fill: new Fill({ color: 'rgba(34, 139, 34, 0.5)' }),
        stroke: new Stroke({ color: '#155215', width: 1.5 })
    })
});

const treeRowStyle = new Style({
    stroke: new Stroke({ color: '#155215', width: 2 })
});

export function treeStyleFn(feature) {
    const type = feature.getGeometry()?.getType();
    return type === 'LineString' || type === 'MultiLineString' ? treeRowStyle : treeStyle;
}

// ── Tiered-delivery styles (P1 §3 / §4) ───────────────────────────────────────

// Cluster tier (zoom ≤ clusterMaxZoom) — canvas-rendered ring with
// complete/partial/missing segments and the count in the centre.
// Single-child clusters (count === 1) render as a solid completeness dot.
// See app/src/lib/clusterStyle.js for the renderer + bitmap cache.
export { clusterRingStyleFn as clusterTierStyleFn } from './clusterStyle.js';

/** Style function for the equipment overlay layer. Never uses icon image files. */
export function equipmentLayerStyleFn(feature) {
    const geomType = feature.getGeometry()?.getType();
    // Suppress only the *point* dots of grouped child devices — the structure
    // polygon itself still renders, and any non-Point child (e.g. a sandpit
    // polygon contained inside a structure) keeps its visible geometry.
    if (feature.get('_groupId') && geomType === 'Point') return null;
    const playground = feature.get('playground');
    const leisure    = feature.get('leisure');

    let color;
    if (playground && playground !== 'yes' && playground in objDevices) {
        const cat = objDevices[playground].category;
        color = objColors[cat] ?? objColors.fallback;
    } else if (leisure === 'fitness_station') {
        color = objColors.activity;
    } else if (leisure === 'pitch') {
        color = '#4a7c3f';
    } else {
        color = objColors.stationary;
    }

    const [r, g, b] = hexToRgb(color);
    const fillColor   = `rgba(${r},${g},${b},0.5)`;
    const strokeColor = `rgba(${r},${g},${b},1)`;

    const radius = (leisure === 'pitch') ? 8 : (leisure === 'fitness_station') ? 7 : 5;
    if (geomType === 'Point' || geomType === 'MultiPoint') {
        return new Style({
            image: new Circle({
                radius,
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({ color: strokeColor, width: 2 })
            })
        });
    }
    if (geomType === 'LineString' || geomType === 'MultiLineString') {
        return new Style({ stroke: new Stroke({ color: strokeColor, width: 3 }) });
    }
    return new Style({
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({ color: strokeColor, width: 2 })
    });
}

/** Style function for equipment vector features (points and polygons). */
export function styleFunction(feature, mode, isPoint) {
    const playground = feature.get('playground');
    let color = objColors.fallback;
    let icon = null;
    let icon_size = null;

    if (mode === 'select') {
        color = '#ff0000';
    } else if (playground in objDevices) {
        const cat = objDevices[playground].category;
        if (cat in objColors) color = objColors[cat];
    } else {
        color = featureColor;
        outer: for (const feat in objFeatures) {
            const tags = objFeatures[feat].tags;
            for (const key in tags) {
                if (feature.get(key) !== tags[key]) continue outer;
            }
            icon = objFeatures[feat].icon;
            icon_size = objFeatures[feat].size;
            break;
        }
    }

    const alpha = playground in objOpacity ? objOpacity[playground] : fillAlpha;
    const [r, g, b] = hexToRgb(color);
    const fill   = `rgba(${r},${g},${b},${alpha})`;
    const stroke = `rgba(${r},${g},${b},${strokeAlpha})`;

    let radius = circleRadius;
    let width  = strokeWidth;
    if (mode === 'select') { radius += 2; width += 2; }
    if (playground === 'sandpit') width -= 1;

    if (isPoint) {
        if (icon) {
            return new Style({
                image: new Icon({ src: `/img/icons/${icon}.png`, width: icon_size })
            });
        }
        return new Style({
            image: new Circle({
                radius,
                fill: new Fill({ color: fill }),
                stroke: new Stroke({ color: stroke, width })
            })
        });
    }
    return new Style({
        fill: new Fill({ color: fill }),
        stroke: new Stroke({ color: stroke, width })
    });
}
