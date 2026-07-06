import { mulberry32 } from '../util/rng';

/**
 * Renders the paper background: procedural grain (~3% opacity noise) and an
 * optional faint ruled baseline. Transparent by default so the surface
 * composes over any app background.
 */
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: 'none' | 'grain' | 'ruled',
  seed: number,
  lineHeight: number,
  padding = 16,
  fontSize = 28
): void {
  if (mode === 'none') return;
  const rng = mulberry32(seed ^ 0x9a9a);

  // grain: sparse random specks at ~3% opacity
  ctx.save();
  ctx.fillStyle = 'rgba(60, 45, 20, 0.03)';
  const specks = Math.floor((width * height) / 160);
  for (let i = 0; i < specks; i++) {
    const x = rng() * width;
    const y = rng() * height;
    const r = 0.4 + rng() * 1.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (mode === 'ruled') {
    ctx.strokeStyle = 'rgba(70, 100, 160, 0.12)';
    ctx.lineWidth = 1;
    // baselines sit slightly below the text baseline
    for (let y = padding + fontSize + 2; y < height; y += lineHeight) {
      ctx.beginPath();
      ctx.moveTo(padding * 0.5, y);
      ctx.lineTo(width - padding * 0.5, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
