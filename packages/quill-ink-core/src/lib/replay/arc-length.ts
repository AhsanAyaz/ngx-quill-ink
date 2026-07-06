import { Point, Stroke } from '../pipeline/types';

export interface ArcPath {
  points: Stroke;
  /** Cumulative length up to points[i]. */
  cumulative: number[];
  totalLength: number;
}

export function buildArcPath(points: Stroke): ArcPath {
  const cumulative = new Array<number>(points.length);
  cumulative[0] = 0;
  for (let i = 1; i < points.length; i++) {
    cumulative[i] =
      cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return { points, cumulative, totalLength: cumulative[points.length - 1] ?? 0 };
}

/** Point at arc distance d (clamped). */
export function pointAt(path: ArcPath, d: number): Point {
  const { points, cumulative, totalLength } = path;
  if (d <= 0 || points.length === 1) return points[0];
  if (d >= totalLength) return points[points.length - 1];
  // binary search for the segment containing d
  let lo = 0;
  let hi = points.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= d) lo = mid;
    else hi = mid;
  }
  const segLen = cumulative[hi] - cumulative[lo];
  const t = segLen > 0 ? (d - cumulative[lo]) / segLen : 0;
  return {
    x: points[lo].x + (points[hi].x - points[lo].x) * t,
    y: points[lo].y + (points[hi].y - points[lo].y) * t,
  };
}

/** Index of the last point with cumulative length <= d. */
export function indexAt(path: ArcPath, d: number): number {
  const { cumulative } = path;
  let lo = 0;
  let hi = cumulative.length - 1;
  if (d >= path.totalLength) return hi;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= d) lo = mid;
    else hi = mid;
  }
  return lo;
}
