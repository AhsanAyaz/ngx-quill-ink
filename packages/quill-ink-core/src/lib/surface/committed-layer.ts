/**
 * Persistent offscreen bitmap holding committed ink. The rAF loop only
 * redraws the active stroke; committed ink is a single drawImage. Resize
 * and scroll are cheap bitmap operations.
 */
export class CommittedLayer {
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor(public width: number, public height: number, private readonly dpr: number) {
    this.canvas = createCanvas(width * dpr, height * dpr);
    this.ctx = get2d(this.canvas);
    this.ctx.scale(dpr, dpr);
  }

  get bitmap(): CanvasImageSource {
    return this.canvas as CanvasImageSource;
  }

  /** Shift committed ink up by dy CSS px (page scroll). */
  scrollUp(dy: number): void {
    const next = createCanvas(this.width * this.dpr, this.height * this.dpr);
    const nctx = get2d(next);
    nctx.drawImage(this.canvas as CanvasImageSource, 0, -dy * this.dpr);
    this.canvas = next;
    (this as { ctx: unknown }).ctx = nctx;
    nctx.scale(this.dpr, this.dpr);
  }

  /** Fade committed ink to `alpha` with a sepia tint (page-turn). */
  fadeToSepia(alpha = 0.2): void {
    const next = createCanvas(this.width * this.dpr, this.height * this.dpr);
    const nctx = get2d(next);
    nctx.globalAlpha = alpha;
    nctx.filter = 'sepia(0.8)';
    nctx.drawImage(this.canvas as CanvasImageSource, 0, 0);
    nctx.filter = 'none';
    nctx.globalAlpha = 1;
    this.canvas = next;
    (this as { ctx: unknown }).ctx = nctx;
    nctx.scale(this.dpr, this.dpr);
  }

  resize(width: number, height: number): void {
    const old = this.canvas;
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width * this.dpr, height * this.dpr);
    (this as { ctx: unknown }).ctx = get2d(this.canvas);
    this.ctx.drawImage(old as CanvasImageSource, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
  }

  clear(): void {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
    this.ctx.restore();
  }
}

function createCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

function get2d(c: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('quill-ink: could not acquire 2d context');
  return ctx;
}
