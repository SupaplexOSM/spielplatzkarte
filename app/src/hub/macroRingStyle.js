// Canvas renderer for the country-level macro view (P2 §5).
//
// Macro rings represent an entire backend's catalogue at zoom ≤ macroMaxZoom.
// They differ from cluster-tier rings in two ways:
//
//   1. Always rendered as rings, never as the cluster-tier single-child dot
//      (a backend with one playground is still a "region", not a singleton).
//   2. Four visual variants — healthy (filled segments + count), offline
//      (dashed outline, muted, "offline" label, last known count), importing
//      (solid blue ring, "updating" label — osm2pgsql actively running), and
//      degraded (amber ring, "no data" label — backend reachable but empty).
//
// The bitmap cache from clusterStyle.js isn't reused here: macro features are
// at most one per registered backend (typically <20), so per-frame redraws
// cost <1 ms and the cache key complexity isn't worth it.

import Style from 'ol/style/Style.js';
import { radiusForCount } from '../lib/clusterStyle.js';

const COLOR = {
  complete:   '#228b22', // legend "complete"  fill base
  partial:    '#eab308', // legend "partial"   fill base
  missing:    '#ef4444', // legend "missing"   fill base
  restricted: '#9ca3af', // tailwind gray-400 — also used for unknown-completeness rings
};
const RING_WIDTH      = 14; // slightly thicker than cluster (12) for country-scale prominence
const CENTER_FILL     = 'rgba(255, 255, 255, 0.95)';
const CENTER_STROKE   = '#1f2937';
const CENTER_TEXT     = '#1f2937';
const OFFLINE_STROKE   = '#9ca3af';
const OFFLINE_FILL     = 'rgba(255, 255, 255, 0.85)';
const OFFLINE_TEXT     = '#6b7280';
const DEGRADED_STROKE  = '#d97706'; // amber-600
const DEGRADED_FILL    = 'rgba(255, 251, 235, 0.92)'; // amber-50
const DEGRADED_TEXT    = '#92400e'; // amber-800
const IMPORTING_STROKE = '#3b82f6'; // blue-500
const IMPORTING_FILL   = 'rgba(239, 246, 255, 0.92)'; // blue-50
const IMPORTING_TEXT   = '#1e40af'; // blue-800
const COUNT_FONT      = 'bold 22px ui-monospace, "SF Mono", Menlo, system-ui, -apple-system, sans-serif';
const LABEL_FONT      = '600 11px system-ui, -apple-system, "Helvetica Neue", sans-serif';

function quantiseSegments(complete, partial, missing, restricted) {
  const total = complete + partial + missing + restricted || 1;
  const c10 = Math.round((complete   / total) * 10);
  const p10 = Math.round((partial    / total) * 10);
  const m10 = Math.round((missing    / total) * 10);
  // Rounding can over- or under-shoot 10; clamp the residual into the
  // restricted bucket so the four arcs always sum to a full circle.
  const r10 = Math.max(0, 10 - c10 - p10 - m10);
  return [c10, p10, m10, r10];
}

function renderHealthyMacroRing(pixelCoords, state) {
  const [x, y]     = pixelCoords;
  const f          = state.feature;
  const count      = f.get('count')      ?? 0;
  const complete   = f.get('complete')   ?? 0;
  const partial    = f.get('partial')    ?? 0;
  const missing    = f.get('missing')    ?? 0;
  const restricted = f.get('restricted') ?? 0;
  const ctx        = state.context;
  const radius     = radiusForCount(count);

  const tenths = quantiseSegments(complete, partial, missing, restricted);
  const colors = [COLOR.complete, COLOR.partial, COLOR.missing, COLOR.restricted];

  ctx.lineWidth = RING_WIDTH;
  ctx.lineCap   = 'butt';
  let start = -Math.PI / 2; // 12 o'clock
  for (let i = 0; i < 4; i++) {
    if (tenths[i] === 0) continue;
    const end = start + (tenths[i] / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, start, end);
    ctx.strokeStyle = colors[i];
    ctx.stroke();
    start = end;
  }

  // Inner disc + count
  ctx.beginPath();
  ctx.arc(x, y, radius - RING_WIDTH / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle   = CENTER_FILL;
  ctx.strokeStyle = CENTER_STROKE;
  ctx.lineWidth   = 1;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle    = CENTER_TEXT;
  ctx.font         = COUNT_FONT;
  if ('fontFeatureSettings' in ctx) ctx.fontFeatureSettings = '"tnum" 1';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatCount(count), x, y + 0.5);
}

function renderOfflineMacroRing(pixelCoords, state) {
  const [x, y]   = pixelCoords;
  const f        = state.feature;
  const count    = f.get('count') ?? 0;
  const ctx      = state.context;
  const radius   = radiusForCount(count);

  // Dashed outline ring — no segment colours since the data is stale.
  ctx.lineWidth   = RING_WIDTH;
  ctx.lineCap     = 'butt';
  ctx.strokeStyle = OFFLINE_STROKE;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Inner disc — keeps the count + label legible against the basemap.
  ctx.beginPath();
  ctx.arc(x, y, radius - RING_WIDTH / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle   = OFFLINE_FILL;
  ctx.strokeStyle = OFFLINE_STROKE;
  ctx.lineWidth   = 1;
  ctx.fill();
  ctx.stroke();

  // Last-known count, shifted up to make room for the "offline" label.
  ctx.fillStyle    = OFFLINE_TEXT;
  ctx.font         = COUNT_FONT;
  if ('fontFeatureSettings' in ctx) ctx.fontFeatureSettings = '"tnum" 1';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatCount(count), x, y - 7);

  ctx.font = LABEL_FONT;
  ctx.fillText('offline', x, y + 11);
}

function renderDegradedMacroRing(pixelCoords, state) {
  const [x, y] = pixelCoords;
  const ctx    = state.context;
  const radius = 26; // minimum — count is 0

  ctx.lineWidth   = RING_WIDTH;
  ctx.lineCap     = 'butt';
  ctx.strokeStyle = DEGRADED_STROKE;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, radius - RING_WIDTH / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle   = DEGRADED_FILL;
  ctx.strokeStyle = DEGRADED_STROKE;
  ctx.lineWidth   = 1;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle    = DEGRADED_TEXT;
  ctx.font         = LABEL_FONT;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('no data', x, y);
}

function renderImportingMacroRing(pixelCoords, state) {
  const [x, y]   = pixelCoords;
  const f        = state.feature;
  const count    = f.get('count') ?? 0;
  const ctx      = state.context;
  const radius   = radiusForCount(count);

  ctx.lineWidth   = RING_WIDTH;
  ctx.lineCap     = 'butt';
  ctx.strokeStyle = IMPORTING_STROKE;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, radius - RING_WIDTH / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle   = IMPORTING_FILL;
  ctx.strokeStyle = IMPORTING_STROKE;
  ctx.lineWidth   = 1;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle    = IMPORTING_TEXT;
  ctx.font         = COUNT_FONT;
  if ('fontFeatureSettings' in ctx) ctx.fontFeatureSettings = '"tnum" 1';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatCount(count), x, y - 7);

  ctx.font = LABEL_FONT;
  ctx.fillText('updating', x, y + 11);
}

// Compact display: 65000 → "65k", 1500 → "1.5k", <1000 unchanged. Spec
// scenario uses 65000 directly but at radius 44 the digit string blows
// outside the inner disc; the "k" suffix keeps it inside.
function formatCount(n) {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

const healthyStyle   = new Style({ renderer: renderHealthyMacroRing });
const offlineStyle   = new Style({ renderer: renderOfflineMacroRing });
const degradedStyle  = new Style({ renderer: renderDegradedMacroRing });
const importingStyle = new Style({ renderer: renderImportingMacroRing });

export function macroRingStyleFn(feature) {
  if (feature.get('_offline'))   return offlineStyle;
  if (feature.get('_importing')) return importingStyle;
  if (feature.get('_degraded'))  return degradedStyle;
  return healthyStyle;
}
