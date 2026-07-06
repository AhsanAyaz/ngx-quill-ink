import { Noise1D, pressureAt } from '../util/noise';
import { pointAt, indexAt, ArcPath } from './arc-length';
import { StrokeJob } from './scheduler';

/**
 * Draws a stroke (fully or partially) with nib physics: pressure-modulated
 * width, a heavier ink dot at the start, a taper at the end.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  stroke: StrokeJob,
  noise: Noise1D,
  jitter: number,
  upToDist?: number,
  colorOverride?: string
): void {
  const { path, baseWidth, color, noiseOffset } = stroke;
  const total = path.totalLength;
  const end = upToDist === undefined ? total : Math.min(upToDist, total);
  ctx.strokeStyle = colorOverride ?? color;
  ctx.fillStyle = colorOverride ?? color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // dot stroke (isolated point, e.g. an 'i' dot)
  if (total === 0) {
    const p = path.points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, baseWidth * 0.65, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // ink dot at stroke start
  const start = path.points[0];
  ctx.beginPath();
  ctx.arc(start.x, start.y, (baseWidth / 2) * 1.25, 0, Math.PI * 2);
  ctx.fill();

  // walk in ~2.5px steps, segment width from low-frequency pressure noise
  const step = 2.5;
  let prev = pointAt(path, 0);
  for (let d = step; d <= end + step - 0.001; d += step) {
    const dd = Math.min(d, end);
    const p = pointAt(path, dd);
    let w = baseWidth * pressureAt(noise, noiseOffset + dd, jitter);
    // taper over the final 15% of the full path
    const taperStart = total * 0.85;
    if (dd > taperStart && total > 8) {
      const t = (dd - taperStart) / (total - taperStart);
      w *= 1 - 0.45 * t;
    }
    ctx.beginPath();
    ctx.lineWidth = Math.max(0.4, w);
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    prev = p;
    if (dd >= end) break;
  }
  void indexAt;
}

/** Apply lightness jitter to a hex/rgb color; returns a css color string. */
export function jitterColor(base: string, deltaLightness: number): string {
  const rgb = parseColor(base);
  if (!rgb) return base;
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const nl = Math.max(0, Math.min(1, l + deltaLightness));
  return `hsl(${(h * 360).toFixed(1)} ${(s * 100).toFixed(1)}% ${(nl * 100).toFixed(1)}%)`;
}

function parseColor(c: string): [number, number, number] | null {
  const hex = c.trim();
  const m3 = /^#([0-9a-f]{3})$/i.exec(hex);
  if (m3) {
    const [r, g, b] = m3[1].split('');
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  const m6 = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m6) {
    return [
      parseInt(m6[1].slice(0, 2), 16),
      parseInt(m6[1].slice(2, 4), 16),
      parseInt(m6[1].slice(4, 6), 16),
    ];
  }
  const mrgb = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(hex);
  if (mrgb) return [Number(mrgb[1]), Number(mrgb[2]), Number(mrgb[3])];
  return null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

export type { ArcPath };
