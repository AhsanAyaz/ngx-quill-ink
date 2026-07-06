import { Point, Stroke } from './types';

/** Ramer-Douglas-Peucker polyline simplification. Default ε = 0.75px. */
export function rdpSimplify(stroke: Stroke, epsilon = 0.75): Stroke {
  if (stroke.length < 3) return stroke.slice();
  const keep = new Uint8Array(stroke.length);
  keep[0] = keep[stroke.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, stroke.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = pointToSegment(stroke[i], stroke[a], stroke[b]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx > 0) {
      keep[maxIdx] = 1;
      stack.push([a, maxIdx], [maxIdx, b]);
    }
  }
  const out: Stroke = [];
  for (let i = 0; i < stroke.length; i++) if (keep[i]) out.push(stroke[i]);
  return out;
}

function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Catmull-Rom resampling: smooths a simplified polyline for pen replay.
 * Passes through every control point; `segmentsPerSpan` interpolated points
 * are inserted between each pair.
 */
export function catmullRomSmooth(stroke: Stroke, segmentsPerSpan = 4): Stroke {
  if (stroke.length < 3) return stroke.slice();
  const out: Stroke = [];
  const pts = stroke;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    out.push(p1);
    for (let s = 1; s < segmentsPerSpan; s++) {
      const t = s / segmentsPerSpan;
      out.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}
