import { Stroke } from './types';

/**
 * Order strokes for natural writing: by min-x of bounding box, ties broken
 * by min-y. (A real ductus model is out of scope for v1.)
 */
export function orderStrokes(strokes: Stroke[]): Stroke[] {
  const keyed = strokes.map((s) => {
    let minX = Infinity;
    let minY = Infinity;
    for (const p of s) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
    }
    return { s, minX, minY };
  });
  keyed.sort((a, b) => a.minX - b.minX || a.minY - b.minY);
  return keyed.map((k) => k.s);
}
