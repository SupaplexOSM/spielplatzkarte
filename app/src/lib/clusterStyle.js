// Canvas renderer for the cluster-tier ring style.
//
// Server buckets ship `{count, complete, partial, missing}` per grid cell.
// The ring is divided into three arcs proportional to those counts, with
// the total drawn in the centre. Bitmaps are cached by
// `(count_bucket, c_frac, p_frac, m_frac)` so pans and zooms don't redraw.
// The cache has bounded size because count is bucketed and fractions are
// rounded to tenths → ~400 distinct shapes at the upper bound.

import Style from 'ol/style/Style.js';

// Ring segment colours match the CompletenessLegend fill palette
// (vectorStyles.js fills) so the ring visually echoes the legend swatches
// rather than the darker polygon strokes. Access-restricted playgrounds
// render as a hatched gray segment — same "not public" visual vocabulary
// as the legend's hatched swatch.
const COLOR = {
  complete: '#228b22', // rgb(34, 139, 34)  — legend "complete" fill base
  partial:  '#eab308', // rgb(234, 179, 8)  — legend "partial"  fill base
  missing:  '#ef4444', // rgb(239, 68, 68)  — legend "missing"  fill base
};
const RESTRICTED_DOT = '#9ca3af';     // tailwind gray-400 — small dots can't show hatching
const HATCH_BG       = 'rgba(156, 163, 175, 0.30)';
const HATCH_LINE     = '#6b7280';     // tailwind gray-500
const CENTER_FILL   = 'rgba(255, 255, 255, 0.94)';
const CENTER_STROKE = '#1f2937';
const CENTER_TEXT   = '#1f2937';
const RING_WIDTH    = 12;

const bitmapCache = new Map();

// Radii bumped substantially for strong visual prominence at zoom ≤ 13
// (two-tier design — no centroid tier). Original spec values were
// 12/14/18/22; here we roughly double them.
//
// Exported for macro-view reuse (P2 §5) — the spec scenario
// "Macro ring position and sizing" requires that backend rings use the same
// size scale as cluster rings.
export function radiusForCount(count) {
  if (count <   10) return 26;
  if (count <  100) return 32;
  if (count < 1000) return 38;
  return 44;
}

// Buckets count into a small set of representative values so visual size
// jumps are coarse but bitmap keys are few.
function countBucket(count) {
  if (count <   10) return count;              // 1..9 exact
  if (count <  100) return Math.round(count / 10) * 10;
  if (count < 1000) return Math.round(count / 100) * 100;
  return Math.round(count / 500) * 500;
}

// Quantise a cluster's (count, complete, partial, missing, restricted) to
// the tuple the bitmap cache is keyed on. Both the cache key AND the
// subsequent draw use the same quantised fractions so the cached bitmap is
// always consistent with its key.
function quantise(count, complete, partial, missing, restricted) {
  const total = complete + partial + missing + restricted || 1;
  const c10 = Math.round((complete   / total) * 10);
  const p10 = Math.round((partial    / total) * 10);
  const m10 = Math.round((missing    / total) * 10);
  const r10 = Math.max(0, 10 - c10 - p10 - m10);
  return { bucket: countBucket(count), c10, p10, m10, r10 };
}

function makeHatchPattern(ctx) {
  const size = 6;
  const pat = document.createElement('canvas');
  pat.width  = size;
  pat.height = size;
  const pctx = pat.getContext('2d');
  pctx.fillStyle = HATCH_BG;
  pctx.fillRect(0, 0, size, size);
  pctx.strokeStyle = HATCH_LINE;
  pctx.lineWidth = 1.5;
  pctx.beginPath();
  pctx.moveTo(0, size);
  pctx.lineTo(size, 0);
  pctx.stroke();
  return ctx.createPattern(pat, 'repeat');
}

function drawStackedRing(canvas, count, c10, p10, m10, r10, pixelRatio) {
  const radius    = radiusForCount(count);
  const centre    = radius + RING_WIDTH + 2;
  const sizePx    = Math.ceil(centre * 2 * pixelRatio);
  canvas.width    = sizePx;
  canvas.height   = sizePx;
  canvas.style.width  = `${centre * 2}px`;
  canvas.style.height = `${centre * 2}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  ctx.lineWidth = RING_WIDTH;
  ctx.lineCap   = 'butt';

  const hatch = r10 > 0 ? makeHatchPattern(ctx) : null;
  const segments = [
    { tenths: c10, stroke: COLOR.complete },
    { tenths: p10, stroke: COLOR.partial  },
    { tenths: m10, stroke: COLOR.missing  },
    { tenths: r10, stroke: hatch          },
  ];
  let start = -Math.PI / 2; // 12-o'clock
  for (const seg of segments) {
    if (seg.tenths === 0) continue;
    const end = start + (seg.tenths / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(centre, centre, radius, start, end);
    ctx.strokeStyle = seg.stroke;
    ctx.stroke();
    start = end;
  }

  // Inner disc
  ctx.beginPath();
  ctx.arc(centre, centre, radius - RING_WIDTH / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle   = CENTER_FILL;
  ctx.strokeStyle = CENTER_STROKE;
  ctx.lineWidth   = 1;
  ctx.fill();
  ctx.stroke();

  // Count in the centre — tabular digits per spec. ui-monospace ships
  // tabular-by-default; the `tnum` OpenType feature is set where supported
  // (Canvas2D fontFeatureSettings, Chrome/Firefox recent) as a belt-and-
  // braces fallback for proportional fonts further down the stack.
  ctx.fillStyle    = CENTER_TEXT;
  ctx.font         = 'bold 22px ui-monospace, "SF Mono", Menlo, system-ui, -apple-system, sans-serif';
  if ('fontFeatureSettings' in ctx) ctx.fontFeatureSettings = '"tnum" 1';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(count), centre, centre + 0.5);
}

function getOrCreateBitmap(count, complete, partial, missing, restricted, pixelRatio) {
  const q = quantise(count, complete, partial, missing, restricted);
  const key = `${q.bucket}:${q.c10}:${q.p10}:${q.m10}:${q.r10}@${pixelRatio}`;
  let canvas = bitmapCache.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    drawStackedRing(canvas, q.bucket, q.c10, q.p10, q.m10, q.r10, pixelRatio);
    bitmapCache.set(key, canvas);
  }
  return canvas;
}

function renderStackedRing(pixelCoords, state) {
  const [x, y]     = pixelCoords;
  const feature    = state.feature;
  const count      = feature.get('count')      ?? 0;
  const complete   = feature.get('complete')   ?? 0;
  const partial    = feature.get('partial')    ?? 0;
  const missing    = feature.get('missing')    ?? 0;
  const restricted = feature.get('restricted') ?? 0;

  // §4.4 — a cluster of one renders as a solid dot. Access-restricted
  // single children use light gray (hatching is hard to read at ~10 px dia).
  if (count <= 1) {
    const color = restricted > 0 ? RESTRICTED_DOT
                : complete   > 0 ? COLOR.complete
                : partial    > 0 ? COLOR.partial
                :                  COLOR.missing;
    const ctx = state.context;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1;
    ctx.fill();
    ctx.stroke();
    return;
  }

  const pixelRatio = state.pixelRatio || 1;
  const bitmap = getOrCreateBitmap(count, complete, partial, missing, restricted, pixelRatio);
  const w = bitmap.width  / pixelRatio;
  const h = bitmap.height / pixelRatio;
  state.context.drawImage(bitmap, x - w / 2, y - h / 2, w, h);
}

// The cluster-tier Style — a single reusable instance; OL invokes the
// renderer with per-feature state (state.feature) so one Style serves all.
const clusterStyle = new Style({ renderer: renderStackedRing });

export function clusterRingStyleFn(_feature) {
  return clusterStyle;
}

// Exposed for tests / bitmap-pool diagnostics.
export function _clearBitmapCache() {
  bitmapCache.clear();
}
