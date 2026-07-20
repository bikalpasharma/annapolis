// Boundary selection for the site-plan editor.
//
// Leasing site plans are laid out as bright unit cells (white/orange fills with
// colored logos inside) sitting on a dark background and separated by dark
// divider/frame lines. So rather than matching "the color you clicked" — which
// breaks the moment you click a logo, or a unit's white margin is too small to
// hit — we flood the *cell*: grow outward from the seed across bright pixels and
// stop at the dark walls. Interior logos/text are then filled back in as holes,
// so it no longer matters where inside a unit you click.
//
// Two entry points share this model:
//   • wandPolygon — flood a cell from one or more seed clicks.
//   • snapRect    — take a hand-drawn rectangle and snap its edges to the
//                   nearest divider lines.
// Both return a polygon in the editor's percentage-based coordinate space.

import type { Point } from "./types";

/** A pixel coordinate [x, y] in the working image's resolution. */
export type PixelPoint = [number, number];

export interface WandOptions {
  /** Luminance (0–255) below which a pixel is treated as a wall (divider /
   *  frame / background). Higher = fainter lines still count as walls, giving
   *  tighter selections. Defaults to 110. */
  threshold?: number;
  /** Radius (px) of the morphological close that seals hairline gaps and
   *  bridges thin dividers between separately clicked regions. */
  closeRadius?: number;
  /** Polygon simplification tolerance in pixels. */
  epsilon?: number;
}

const DEFAULT_THRESHOLD = 110;

/** Integer luminance*1000 of pixel index `i` (avoids float work in hot loops). */
function lum1000(data: Uint8ClampedArray, i: number): number {
  const o = i * 4;
  return data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114;
}

/** Returns the selection boundary as percentage coordinates (the editor's
 *  polygon format), or null if the seeds produced no usable region. */
export function wandPolygon(
  img: ImageData,
  seeds: PixelPoint[],
  opts: WandOptions = {},
): Point[] | null {
  const { width: w, height: h, data } = img;
  if (seeds.length === 0) return null;

  const threshold = (opts.threshold ?? DEFAULT_THRESHOLD) * 1000;
  const closeRadius = opts.closeRadius ?? Math.max(1, Math.round(w * 0.0015));
  const epsilon = opts.epsilon ?? Math.max(2, w * 0.0015);

  const bright = (i: number) => lum1000(data, i) >= threshold;

  let mask: Uint8Array = new Uint8Array(w * h);
  for (const [sx, sy] of seeds) {
    const start = seedIndex(bright, w, h, sx, sy);
    if (start < 0) continue; // clicked deep in a wall with no cell nearby
    if (mask[start]) continue; // already covered by an earlier seed
    floodBright(bright, w, h, start, mask);
  }

  // Guard against a leak: if a gap in the frame let the flood escape into the
  // parking field / background, the fill balloons to most of the image.
  let filled = 0;
  for (let i = 0; i < mask.length; i++) filled += mask[i];
  if (filled === 0 || filled > w * h * 0.5) return null;

  if (closeRadius > 0) mask = close(mask, w, h, closeRadius);
  fillHoles(mask, w, h); // absorb interior logos / text
  mask = largestComponent(mask, w, h);

  let contour = traceOuterContour(mask, w, h);
  if (contour.length < 3) return null;

  // Pixel-resolution contours can run to hundreds of thousands of points;
  // decimate before simplification to bound RDP cost.
  const step = Math.max(1, Math.floor(contour.length / 5000));
  if (step > 1) contour = contour.filter((_, i) => i % step === 0);

  return finalize(contour, epsilon, w, h);
}

/** Snap a hand-drawn rectangle (pixel coords, any corner order) to the nearest
 *  divider lines, and return it as a 4-corner polygon in percentage coords. */
export function snapRect(
  img: ImageData,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: WandOptions = {},
): Point[] | null {
  const { width: w, height: h, data } = img;
  const threshold = (opts.threshold ?? DEFAULT_THRESHOLD) * 1000;
  const dark = (x: number, y: number) => lum1000(data, y * w + x) < threshold;

  let x0 = clamp(Math.min(ax, bx), 0, w - 1);
  let x1 = clamp(Math.max(ax, bx), 0, w - 1);
  let y0 = clamp(Math.min(ay, by), 0, h - 1);
  let y1 = clamp(Math.max(ay, by), 0, h - 1);
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;

  // Search window: look a little inside/outside each edge for the strongest
  // run of dark (wall) pixels and snap the edge to it.
  const win = Math.max(4, Math.round(w * 0.02));

  // vertical edges: score each candidate column by how much of the span is dark
  const scoreCol = (x: number) => {
    let n = 0;
    for (let y = y0; y <= y1; y++) if (dark(x, y)) n++;
    return n / (y1 - y0 + 1);
  };
  const scoreRow = (y: number) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (dark(x, y)) n++;
    return n / (x1 - x0 + 1);
  };

  x0 = snapEdge(x0, win, 0, w - 1, scoreCol);
  x1 = snapEdge(x1, win, 0, w - 1, scoreCol);
  y0 = snapEdge(y0, win, 0, h - 1, scoreRow);
  y1 = snapEdge(y1, win, 0, h - 1, scoreRow);
  if (x1 <= x0 || y1 <= y0) return null;

  return [
    pct(x0, y0, w, h),
    pct(x1, y0, w, h),
    pct(x1, y1, w, h),
    pct(x0, y1, w, h),
  ];
}

/** Move an edge to the nearby position with the strongest wall signal, but keep
 *  it put if nothing convincing is found (avoids drifting on open edges). */
function snapEdge(
  pos: number,
  win: number,
  lo: number,
  hi: number,
  score: (p: number) => number,
): number {
  let best = pos;
  let bestScore = 0.35; // require a real line, not stray noise
  for (let p = Math.max(lo, pos - win); p <= Math.min(hi, pos + win); p++) {
    const s = score(p);
    // Prefer stronger lines; on ties prefer the one closest to the drawn edge.
    if (s > bestScore || (s === bestScore && Math.abs(p - pos) < Math.abs(best - pos))) {
      bestScore = s;
      best = p;
    }
  }
  return best;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function pct(x: number, y: number, w: number, h: number): Point {
  return [
    Math.round((x / w) * 1000) / 10,
    Math.round((y / h) * 1000) / 10,
  ];
}

// --- seed resolution ----------------------------------------------------------

/** Resolve a seed click to a bright pixel: if the click landed on a wall (a
 *  divider line, or dark logo text), spiral outward to the nearest cell pixel
 *  so the flood still catches the surrounding unit. Returns -1 if none nearby. */
function seedIndex(
  bright: (i: number) => boolean,
  w: number,
  h: number,
  sx: number,
  sy: number,
): number {
  const x = clamp(Math.round(sx), 0, w - 1);
  const y = clamp(Math.round(sy), 0, h - 1);
  if (bright(y * w + x)) return y * w + x;
  const maxR = Math.max(4, Math.round(w * 0.01));
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      const dx = r - Math.abs(dy);
      for (const nx of [x - dx, x + dx]) {
        if (nx < 0 || nx >= w) continue;
        if (bright(ny * w + nx)) return ny * w + nx;
      }
    }
  }
  return -1;
}

// --- flood fill ---------------------------------------------------------------

/** 4-connected flood from `start` across bright (non-wall) pixels. */
function floodBright(
  bright: (i: number) => boolean,
  w: number,
  h: number,
  start: number,
  mask: Uint8Array,
): void {
  const stack = new Int32Array(w * h);
  let top = 0;
  stack[top++] = start;
  mask[start] = 1;
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    if (x > 0 && !mask[i - 1] && bright(i - 1)) (mask[i - 1] = 1), (stack[top++] = i - 1);
    if (x < w - 1 && !mask[i + 1] && bright(i + 1)) (mask[i + 1] = 1), (stack[top++] = i + 1);
    if (i >= w && !mask[i - w] && bright(i - w)) (mask[i - w] = 1), (stack[top++] = i - w);
    if (i < w * (h - 1) && !mask[i + w] && bright(i + w))
      (mask[i + w] = 1), (stack[top++] = i + w);
  }
}

// --- hole filling -------------------------------------------------------------

/** Fill enclosed holes (interior logos / text) within the mask's bounding box:
 *  any non-mask pixel not reachable from the box border is interior → set it. */
function fillHoles(mask: Uint8Array, w: number, h: number): void {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return;

  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = minX; x <= maxX; x++) {
    push(x, minY);
    push(x, maxY);
  }
  for (let y = minY; y <= maxY; y++) {
    push(minX, y);
    push(maxX, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > minX) push(x - 1, y);
    if (x < maxX) push(x + 1, y);
    if (y > minY) push(x, y - 1);
    if (y < maxY) push(x, y + 1);
  }
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = y * w + x;
      if (!mask[i] && !outside[i]) mask[i] = 1;
    }
  }
}

// --- morphology (box structuring element, separable via prefix sums) ---------

/** Dilate then erode: seals hairline gaps and bridges thin dividers between
 *  separately clicked regions. */
function close(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  return boxPass(boxPass(mask, w, h, radius, "any"), w, h, radius, "all");
}

function boxPass(
  src: Uint8Array,
  w: number,
  h: number,
  r: number,
  mode: "any" | "all",
): Uint8Array {
  const horiz = new Uint8Array(w * h);
  const prefix = new Int32Array(Math.max(w, h) + 1);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + src[row + x];
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, x - r);
      const b = Math.min(w - 1, x + r);
      const sum = prefix[b + 1] - prefix[a];
      horiz[row + x] = mode === "any" ? (sum > 0 ? 1 : 0) : sum === b - a + 1 ? 1 : 0;
    }
  }

  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + horiz[y * w + x];
    for (let y = 0; y < h; y++) {
      const a = Math.max(0, y - r);
      const b = Math.min(h - 1, y + r);
      const sum = prefix[b + 1] - prefix[a];
      out[y * w + x] = mode === "any" ? (sum > 0 ? 1 : 0) : sum === b - a + 1 ? 1 : 0;
    }
  }
  return out;
}

// --- connected components ------------------------------------------------------

/** Keeps only the largest 4-connected component of the mask. */
function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h); // 0 = unlabeled
  const stack = new Int32Array(w * h);
  let bestLabel = 0;
  let bestSize = 0;
  let next = 0;

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i]) continue;
    const cur = ++next;
    let size = 0;
    let top = 0;
    stack[top++] = i;
    label[i] = cur;
    while (top > 0) {
      const j = stack[--top];
      size++;
      const x = j % w;
      if (x > 0 && mask[j - 1] && !label[j - 1]) (label[j - 1] = cur), (stack[top++] = j - 1);
      if (x < w - 1 && mask[j + 1] && !label[j + 1]) (label[j + 1] = cur), (stack[top++] = j + 1);
      if (j >= w && mask[j - w] && !label[j - w]) (label[j - w] = cur), (stack[top++] = j - w);
      if (j < w * (h - 1) && mask[j + w] && !label[j + w])
        (label[j + w] = cur), (stack[top++] = j + w);
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = cur;
    }
  }

  const out = new Uint8Array(w * h);
  if (bestLabel === 0) return out;
  for (let i = 0; i < label.length; i++) out[i] = label[i] === bestLabel ? 1 : 0;
  return out;
}

// --- contour tracing (Moore neighborhood, 8-connected) ------------------------

const DX = [1, 1, 0, -1, -1, -1, 0, 1]; // E SE S SW W NW N NE (clockwise, y-down)
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
/** dir index by (dy+1)*3 + (dx+1); center (0,0) unused. */
const DIR_LOOKUP = [5, 6, 7, 4, -1, 0, 3, 2, 1];

function traceOuterContour(mask: Uint8Array, w: number, h: number): PixelPoint[] {
  let startIdx = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return [];

  const sx = startIdx % w;
  const sy = Math.floor(startIdx / w);
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;

  const contour: PixelPoint[] = [[sx, sy]];
  let cx = sx;
  let cy = sy;
  // Backtrack = last background pixel visited. Start is the topmost-leftmost
  // mask pixel, so its west neighbor is guaranteed background.
  let bx = sx - 1;
  let by = sy;

  const cap = Math.min(w * h, 2_000_000);
  for (let steps = 0; steps < cap; steps++) {
    const bd = DIR_LOOKUP[(by - cy + 1) * 3 + (bx - cx + 1)];
    let found = -1;
    let px = bx;
    let py = by;
    for (let k = 1; k <= 8; k++) {
      const d = (bd + k) % 8;
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (at(nx, ny)) {
        found = d;
        break;
      }
      px = nx;
      py = ny;
    }
    if (found < 0) return contour; // isolated single pixel

    const nx = cx + DX[found];
    const ny = cy + DY[found];
    // Jacob's stopping criterion: we re-enter the start pixel with the same
    // backtrack configuration we began with.
    if (nx === sx && ny === sy && px === sx - 1 && py === sy) break;

    contour.push([nx, ny]);
    bx = px;
    by = py;
    cx = nx;
    cy = ny;
  }
  return contour;
}

// --- polygon simplification (Ramer–Douglas–Peucker, iterative) ----------------

/** Simplify a pixel contour, cap its point count, and convert to percentage
 *  coords, dropping collapsed duplicate points. */
function finalize(
  contour: PixelPoint[],
  epsilon: number,
  w: number,
  h: number,
): Point[] | null {
  let simplified = simplifyRdp(contour, epsilon);
  let eps = epsilon;
  while (simplified.length > 100) {
    eps *= 1.5;
    simplified = simplifyRdp(contour, eps);
  }
  if (simplified.length < 3) return null;

  const points = simplified.map(([x, y]) => pct(x, y, w, h));
  const out = points.filter(
    (p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1],
  );
  if (out.length >= 2) {
    const [f, l] = [out[0], out[out.length - 1]];
    if (f[0] === l[0] && f[1] === l[1]) out.pop();
  }
  return out.length >= 3 ? out : null;
}

function simplifyRdp(points: PixelPoint[], epsilon: number): PixelPoint[] {
  const n = points.length;
  if (n <= 3) return points.slice();

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const eps2 = epsilon * epsilon;
  const stack: Array<[number, number]> = [[0, n - 1]];

  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;

    let maxD2 = -1;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = points[i];
      let d2: number;
      if (len2 === 0) {
        const ex = x - ax;
        const ey = y - ay;
        d2 = ex * ex + ey * ey;
      } else {
        const cross = dx * (y - ay) - dy * (x - ax);
        d2 = (cross * cross) / len2;
      }
      if (d2 > maxD2) {
        maxD2 = d2;
        maxI = i;
      }
    }
    if (maxD2 > eps2) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }

  const out: PixelPoint[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}
