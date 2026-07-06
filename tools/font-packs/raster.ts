/**
 * Pure-TS glyph rasterizer for the font-pack generator: flattens an
 * opentype.js path (move/line/quad/cubic) to polygon contours, then fills
 * with non-zero winding scanline coverage. No native canvas dependency —
 * runs anywhere Node runs.
 */

export interface PathCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

type Contour = Array<[number, number]>;

const CURVE_STEPS = 16;

export function flattenPath(commands: PathCommand[]): Contour[] {
  const contours: Contour[] = [];
  let current: Contour = [];
  let startX = 0;
  let startY = 0;
  let x = 0;
  let y = 0;
  const push = (px: number, py: number) => {
    current.push([px, py]);
    x = px;
    y = py;
  };
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        if (current.length > 1) contours.push(current);
        current = [];
        startX = cmd.x as number;
        startY = cmd.y as number;
        push(startX, startY);
        break;
      case 'L':
        push(cmd.x as number, cmd.y as number);
        break;
      case 'Q': {
        const x0 = x;
        const y0 = y;
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS;
          const mt = 1 - t;
          push(
            mt * mt * x0 + 2 * mt * t * (cmd.x1 as number) + t * t * (cmd.x as number),
            mt * mt * y0 + 2 * mt * t * (cmd.y1 as number) + t * t * (cmd.y as number)
          );
        }
        break;
      }
      case 'C': {
        const x0 = x;
        const y0 = y;
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS;
          const mt = 1 - t;
          push(
            mt * mt * mt * x0 +
              3 * mt * mt * t * (cmd.x1 as number) +
              3 * mt * t * t * (cmd.x2 as number) +
              t * t * t * (cmd.x as number),
            mt * mt * mt * y0 +
              3 * mt * mt * t * (cmd.y1 as number) +
              3 * mt * t * t * (cmd.y2 as number) +
              t * t * t * (cmd.y as number)
          );
        }
        break;
      }
      case 'Z':
        if (current.length) push(startX, startY);
        break;
    }
  }
  if (current.length > 1) contours.push(current);
  return contours;
}

/**
 * Non-zero winding scanline fill. Samples at pixel centers; returns a
 * single-channel alpha buffer (0 or 255) of size width*height.
 */
export function fillContours(contours: Contour[], width: number, height: number): Uint8Array {
  const alpha = new Uint8Array(width * height);
  interface Edge {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    dir: number;
  }
  const edges: Edge[] = [];
  for (const contour of contours) {
    for (let i = 0; i < contour.length - 1; i++) {
      const [ax, ay] = contour[i];
      const [bx, by] = contour[i + 1];
      if (ay === by) continue;
      edges.push(ay < by ? { x0: ax, y0: ay, x1: bx, y1: by, dir: 1 } : { x0: bx, y0: by, x1: ax, y1: ay, dir: -1 });
    }
  }
  const crossings: Array<{ x: number; dir: number }> = [];
  for (let py = 0; py < height; py++) {
    const sy = py + 0.5;
    crossings.length = 0;
    for (const e of edges) {
      if (sy >= e.y0 && sy < e.y1) {
        const t = (sy - e.y0) / (e.y1 - e.y0);
        crossings.push({ x: e.x0 + t * (e.x1 - e.x0), dir: e.dir });
      }
    }
    if (!crossings.length) continue;
    crossings.sort((a, b) => a.x - b.x);
    let winding = 0;
    for (let c = 0; c < crossings.length - 1; c++) {
      winding += crossings[c].dir;
      if (winding === 0) continue;
      // pixel centers inside [crossings[c].x, crossings[c+1].x)
      const xStart = Math.max(0, Math.ceil(crossings[c].x - 0.5));
      const xEnd = Math.min(width - 1, Math.ceil(crossings[c + 1].x - 0.5) - 1);
      for (let px = xStart; px <= xEnd; px++) alpha[py * width + px] = 255;
    }
  }
  return alpha;
}
