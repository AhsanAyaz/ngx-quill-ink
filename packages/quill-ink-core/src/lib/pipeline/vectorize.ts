import { Bitmap, Point, Stroke } from './types';

/**
 * Vectorize a 1px skeleton into polyline strokes.
 *
 * Builds an 8-neighbor pixel graph, then traces paths starting at endpoints
 * (1 neighbor). At junctions (3+ neighbors) the trace continues along the
 * neighbor with the smallest turning angle relative to the incoming
 * direction — this keeps natural pen strokes together through crossings
 * like 't' or 'x'. Remaining cycles (e.g. 'o') are traced last.
 */
export function vectorize(skeleton: Bitmap): Stroke[] {
  const { data, width, height } = skeleton;
  const idx = (x: number, y: number) => y * width + x;

  // 8-neighborhood, clockwise
  const N8 = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ] as const;

  const inked = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && data[idx(x, y)] !== 0;

  const neighbors = (i: number): number[] => {
    const x = i % width;
    const y = (i / width) | 0;
    const out: number[] = [];
    for (const [dx, dy] of N8) {
      const xx = x + dx;
      const yy = y + dy;
      if (!inked(xx, yy)) continue;
      // prune redundant diagonal edges: if an orthogonal step covers the
      // same connection, skip the diagonal — avoids phantom mini-strokes
      // at junctions and corners.
      if (dx !== 0 && dy !== 0 && (inked(x + dx, y) || inked(x, y + dy))) continue;
      out.push(idx(xx, yy));
    }
    return out;
  };

  const degree = new Map<number, number>();
  const endpoints: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue;
    const d = neighbors(i).length;
    degree.set(i, d);
    if (d === 1) endpoints.push(i);
    if (d === 0) degree.set(i, 0); // isolated dot
  }

  // visited undirected edges, encoded as min*len+max is unsafe for large maps;
  // use string-free numeric pairing: a * data.length + b with a<b.
  const visitedEdges = new Set<number>();
  const edgeKey = (a: number, b: number) => (a < b ? a * data.length + b : b * data.length + a);

  const toPoint = (i: number): Point => ({ x: i % width, y: (i / width) | 0 });

  const strokes: Stroke[] = [];

  const trace = (start: number, first: number): void => {
    const stroke: Stroke = [toPoint(start)];
    visitedEdges.add(edgeKey(start, first));
    let prev = start;
    let cur = first;
    for (;;) {
      stroke.push(toPoint(cur));
      const dirX = (cur % width) - (prev % width);
      const dirY = ((cur / width) | 0) - ((prev / width) | 0);
      const candidates = neighbors(cur).filter(
        (n) => n !== prev && !visitedEdges.has(edgeKey(cur, n))
      );
      if (candidates.length === 0) break;
      // continuation with smallest turning angle vs incoming direction
      let best = candidates[0];
      let bestDot = -Infinity;
      for (const n of candidates) {
        const nx = (n % width) - (cur % width);
        const ny = ((n / width) | 0) - ((cur / width) | 0);
        const dot =
          (dirX * nx + dirY * ny) /
          (Math.hypot(dirX, dirY) * Math.hypot(nx, ny));
        if (dot > bestDot) {
          bestDot = dot;
          best = n;
        }
      }
      visitedEdges.add(edgeKey(cur, best));
      prev = cur;
      cur = best;
      // stop when we arrive at an endpoint
      if ((degree.get(cur) ?? 0) === 1) {
        stroke.push(toPoint(cur));
        break;
      }
    }
    if (stroke.length > 1) strokes.push(dedupe(stroke));
  };

  // 1) trace from endpoints
  for (const e of endpoints) {
    for (const n of neighbors(e)) {
      if (!visitedEdges.has(edgeKey(e, n))) trace(e, n);
    }
  }

  // 2) remaining unvisited edges (cycles and junction stubs)
  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue;
    for (const n of neighbors(i)) {
      if (!visitedEdges.has(edgeKey(i, n))) trace(i, n);
    }
  }

  // 3) isolated single pixels become dot strokes (e.g. 'i' dot at low res)
  for (const [i, d] of degree) {
    if (d === 0) strokes.push([toPoint(i), toPoint(i)]);
  }

  return strokes;
}

function dedupe(stroke: Stroke): Stroke {
  const out: Stroke = [stroke[0]];
  for (let i = 1; i < stroke.length; i++) {
    const last = out[out.length - 1];
    if (stroke[i].x !== last.x || stroke[i].y !== last.y) out.push(stroke[i]);
  }
  return out;
}
