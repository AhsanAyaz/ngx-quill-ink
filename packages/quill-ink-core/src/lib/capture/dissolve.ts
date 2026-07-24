import { mulberry32 } from '../util/rng';
import { EngineClock } from '../surface/surface-options';

/**
 * "The page drinks the ink": directional dissolve of a bitmap layer in
 * stroke-draw order — an alpha noise mask sweeps across over ~1.2s, as if
 * the paper absorbs the ink.
 *
 * Implementation: the layer is redrawn each frame through a destination-out
 * noise mask whose density advances left-to-right along the drawn bounds.
 */
export const DISSOLVE_MS = 1200;

export function runDissolve(
  layer: HTMLCanvasElement | OffscreenCanvas,
  bounds: { x: number; y: number; width: number; height: number },
  clock: EngineClock,
  seed: number,
  onFrame: () => void,
  durationMs = DISSOLVE_MS
): Promise<void> {
  const ctx = layer.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx || bounds.width <= 0 || bounds.height <= 0) return Promise.resolve();

  const rng = mulberry32(seed ^ 0xd15501);
  // pre-generate noise specks across the bounds (CSS px — the layer context
  // is expected to carry the devicePixelRatio scale)
  const specks: Array<{ x: number; y: number; r: number; jitterT: number }> = [];
  const count = Math.ceil((bounds.width * bounds.height) / 26);
  for (let i = 0; i < count; i++) {
    specks.push({
      x: bounds.x + rng() * bounds.width,
      y: bounds.y + rng() * bounds.height,
      r: 1.5 + rng() * 4,
      jitterT: rng() * 0.35, // per-speck sweep offset → ragged edge
    });
  }

  const start = clock.now();
  return new Promise<void>((resolve) => {
    const step = (): void => {
      const t = Math.min(1, (clock.now() - start) / durationMs);
      // sweep front moves left -> right (stroke-draw order approximation)
      const front = bounds.x + (bounds.width + 60) * t;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      for (const s of specks) {
        const local = front - s.jitterT * 60;
        if (s.x < local) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * (0.6 + t), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      onFrame();
      if (t >= 1) {
        // final wipe to guarantee a clean page
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
        ctx.restore();
        onFrame();
        resolve();
        return;
      }
      clock.raf(step);
    };
    clock.raf(step);
  });
}
