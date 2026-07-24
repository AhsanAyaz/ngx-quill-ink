import {
  CaptureResult,
  DEFAULTS,
  EngineClock,
  InkSurfaceOptions,
  NibStyle,
  ResolvedOptions,
  Unsubscribe,
  WET_INK_MS,
  WriteHandle,
  resolveFontPack,
} from './surface-options';
import { CommittedLayer } from './committed-layer';
import { drawPaper } from './paper';
import { LayoutEngine } from '../layout/layout-engine';
import { Tokenizer, WordToken } from '../layout/tokenizer';
import { PenScheduler, StrokeJob, WordJob } from '../replay/scheduler';
import { buildArcPath } from '../replay/arc-length';
import { drawStroke, jitterColor } from '../replay/pen-renderer';
import { valueNoise1D, baselineWobble, rotationJitter, lightnessJitter, Noise1D } from '../util/noise';
import { hashString } from '../util/rng';
import { PackLoader } from '../fonts/pack-loader';
import { CaptureController, CapturedStroke } from '../capture/capture-controller';
import { runDissolve } from '../capture/dissolve';
import { exportSurfacePNG } from '../capture/export-png';
import { isBrowser } from '../util/env';
import { Point } from '../pipeline/types';

interface WordMeta {
  baselineY: number;
}

const browserClock: EngineClock = {
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
};

const noopClock: EngineClock = {
  now: () => 0,
  raf: () => 0,
  caf: () => undefined,
};

/**
 * The ink surface: streaming text renders as animated handwriting (write
 * path); pointer strokes are recorded and "drunk" by the page (capture
 * path). SSR-safe: constructing off-browser yields an inert surface.
 */
export class InkSurface {
  private readonly opts: ResolvedOptions;
  private readonly clock: EngineClock;
  private readonly alive: boolean;
  private width = 0;
  private height = 0;
  private dpr = 1;

  private ctx: CanvasRenderingContext2D | null = null;
  private committed!: CommittedLayer;
  private captureLayer!: CommittedLayer;
  private layout!: LayoutEngine;
  private scheduler!: PenScheduler;
  private loader!: PackLoader;
  private capture: CaptureController | null = null;

  private readonly noise: Noise1D;
  private scrollY = 0;
  private glyphCounter = 0;
  private nextWriteId = 1;
  private buildChain: Promise<void> = Promise.resolve();
  private writeResolvers = new Map<number, () => void>();
  private cancelledWrites = new Set<number>();
  private wet: Array<{ stroke: StrokeJob; at: number; scrollY: number }> = [];
  private lastActive: { stroke: StrokeJob; dist: number } | null = null;
  private wetRafId: number | null = null;
  private captureListeners = new Set<(r: CaptureResult) => void>();
  private committing = false;
  private destroyed = false;

  constructor(options: InkSurfaceOptions, clock?: EngineClock) {
    const fontPack = resolveFontPack(options.font);
    this.opts = {
      canvas: options.canvas,
      fontPack,
      fontSize: options.fontSize ?? DEFAULTS.fontSize,
      inkColor: options.inkColor ?? DEFAULTS.inkColor,
      penSpeed: options.penSpeed ?? DEFAULTS.penSpeed,
      jitter: options.jitter ?? DEFAULTS.jitter,
      paper: options.paper ?? DEFAULTS.paper,
      seed: options.seed ?? DEFAULTS.seed,
      onPageFull: options.onPageFull ?? DEFAULTS.onPageFull,
    };
    this.alive = isBrowser() && !!options.canvas;
    this.clock = clock ?? (this.alive ? browserClock : noopClock);
    this.noise = valueNoise1D(this.opts.seed);
    if (!this.alive) return;

    const canvas = this.opts.canvas;
    const rect = canvas.getBoundingClientRect();
    this.width = rect.width || canvas.width || 600;
    this.height = rect.height || canvas.height || 400;
    this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(this.width * this.dpr);
    canvas.height = Math.round(this.height * this.dpr);

    this.ctx = canvas.getContext('2d');
    this.committed = new CommittedLayer(this.width, this.height, this.dpr);
    this.captureLayer = new CommittedLayer(this.width, this.height, this.dpr);
    this.layout = new LayoutEngine(this.opts.fontPack, this.opts.fontSize, this.width);
    this.loader = new PackLoader(this.opts.fontPack);
    this.scheduler = new PenScheduler(
      {
        onWordStart: (w) => this.handleWordStart(w),
        onStrokeCommitted: (s) => this.commitStroke(s),
        onFrame: (active) => {
          this.lastActive = active;
          this.render();
        },
        onWriteDone: (id) => {
          this.writeResolvers.get(id)?.();
          this.writeResolvers.delete(id);
        },
        onIdle: () => undefined,
      },
      this.opts.penSpeed,
      this.clock
    );
    this.render();
  }

  // ------------------------------------------------------------- write path

  write(text: string | AsyncIterable<string>): WriteHandle {
    const writeId = this.nextWriteId++;
    if (!this.alive) {
      return { done: Promise.resolve(), skip: () => undefined, cancel: () => undefined };
    }
    const done = new Promise<void>((resolve) => this.writeResolvers.set(writeId, resolve));
    this.scheduler.openWrite(writeId);

    const tokenizer = new Tokenizer();
    if (typeof text === 'string') {
      const tokens = [...tokenizer.push(text), ...tokenizer.flush()];
      for (const t of tokens) this.enqueueToken(t, writeId);
      this.buildChain = this.buildChain.then(() => this.scheduler.closeWrite(writeId));
    } else {
      void (async () => {
        try {
          for await (const chunk of text) {
            if (this.destroyed || this.cancelledWrites.has(writeId)) break;
            for (const t of tokenizer.push(chunk)) this.enqueueToken(t, writeId);
          }
          for (const t of tokenizer.flush()) this.enqueueToken(t, writeId);
        } finally {
          this.buildChain = this.buildChain.then(() => this.scheduler.closeWrite(writeId));
        }
      })();
    }

    return {
      done,
      skip: () => {
        this.cancelledWrites.add(writeId);
        this.scheduler.closeWrite(writeId);
        this.scheduler.skip(writeId);
      },
      cancel: () => {
        this.cancelledWrites.add(writeId);
        this.scheduler.closeWrite(writeId);
        this.scheduler.cancel(writeId);
      },
    };
  }

  private enqueueToken(token: WordToken, writeId: number): void {
    this.buildChain = this.buildChain.then(async () => {
      if (this.destroyed || this.cancelledWrites.has(writeId)) return;
      const job = await this.buildWordJob(token, writeId);
      if (job && !this.cancelledWrites.has(writeId)) this.scheduler.enqueue(job);
    });
  }

  private async buildWordJob(token: WordToken, writeId: number): Promise<WordJob | null> {
    const chars = [...token.text];
    // ensure glyphs exist (pack or runtime fallback) before measuring
    for (const ch of chars) {
      if (!this.loader.fromPack(ch)) await this.loader.fromRuntime(ch);
    }
    const measured = this.layout.measure(token.text);
    const placement = this.layout.place(measured, token.newlinesBefore, Number.MAX_SAFE_INTEGER);
    const scale = this.layout.scale;
    const wordNoiseBase = hashString(token.text, this.opts.seed) % 1000;

    const strokes: StrokeJob[] = [];
    for (let i = 0; i < chars.length; i++) {
      const glyph = this.loader.fromPack(chars[i]) ?? (await this.loader.fromRuntime(chars[i]));
      if (!glyph || !glyph.strokes.length) continue;
      const penX = placement.x + measured.glyphOffsets[i];
      const glyphIndex = this.glyphCounter++;
      const wobble = baselineWobble(this.noise, wordNoiseBase + penX, this.opts.jitter);
      const rot = rotationJitter(this.noise, glyphIndex, this.opts.jitter);
      const color = jitterColor(this.opts.inkColor, lightnessJitter(this.noise, glyphIndex, this.opts.jitter));
      const baseWidth = 2.2 * (this.opts.fontSize / 28);

      // glyph bbox center for rotation
      let cx = 0, cy = 0, n = 0;
      for (const flat of glyph.strokes) {
        for (let k = 0; k < flat.length; k += 2) {
          cx += flat[k];
          cy += flat[k + 1];
          n++;
        }
      }
      cx = (cx / Math.max(1, n)) * scale + penX;
      cy = (cy / Math.max(1, n)) * scale + placement.baselineY + wobble;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      for (const flat of glyph.strokes) {
        const pts: Point[] = new Array(flat.length / 2);
        for (let k = 0; k < flat.length; k += 2) {
          const px = penX + flat[k] * scale;
          const py = placement.baselineY + wobble + flat[k + 1] * scale;
          // rotate around glyph center
          const dx = px - cx;
          const dy = py - cy;
          pts[k / 2] = { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
        }
        strokes.push({
          path: buildArcPath(pts),
          baseWidth,
          color,
          noiseOffset: (glyphIndex * 137) % 10000,
        });
      }
    }
    const meta: WordMeta = { baselineY: placement.baselineY };
    return { strokes, pauseAfterMs: token.pauseAfterMs, writeId, meta };
  }

  // --------------------------------------------------------------- scrolling

  private handleWordStart(word: WordJob): void {
    const meta = word.meta as WordMeta | undefined;
    if (!meta) return;
    const descent = (this.opts.fontPack.descent / this.opts.fontPack.unitsPerEm) * this.opts.fontSize;
    const bottom = meta.baselineY + descent - this.scrollY;
    if (bottom <= this.height - 8) return;

    if (this.opts.onPageFull === 'page-turn') {
      // current ink fades to sepia and the page yields to fresh paper
      this.committed.fadeToSepia(0.2);
      const usable = this.height - this.opts.fontSize * 2;
      this.committed.scrollUp(usable);
      this.scrollY += usable;
      // may still need line-level scroll below
    }
    while (meta.baselineY + descent - this.scrollY > this.height - 8) {
      const dy = this.layout.lineHeight;
      this.committed.scrollUp(dy);
      this.scrollY += dy;
    }
  }

  // ------------------------------------------------------------- rendering

  private commitStroke(stroke: StrokeJob): void {
    const ctx = this.committed.ctx;
    ctx.save();
    ctx.translate(0, -this.scrollY);
    drawStroke(ctx, stroke, this.noise, this.opts.jitter);
    ctx.restore();
    this.wet.push({ stroke, at: this.clock.now(), scrollY: this.scrollY });
    this.ensureWetLoop();
  }

  private render(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    drawPaper(ctx, this.width, this.height, this.opts.paper, this.opts.seed, this.layout.lineHeight, 16, this.opts.fontSize);
    ctx.drawImage(this.committed.bitmap, 0, 0, this.width, this.height);
    ctx.drawImage(this.captureLayer.bitmap, 0, 0, this.width, this.height);

    // wet ink: freshly drawn strokes read darker for 400ms, then settle
    const now = this.clock.now();
    for (const w of this.wet) {
      const age = now - w.at;
      if (age >= WET_INK_MS) continue;
      ctx.save();
      ctx.globalAlpha = 0.15 * (1 - age / WET_INK_MS);
      ctx.translate(0, -w.scrollY);
      drawStroke(ctx, w.stroke, this.noise, this.opts.jitter, undefined, '#000000');
      ctx.restore();
    }

    if (this.lastActive) {
      ctx.save();
      ctx.translate(0, -this.scrollY);
      // wet pass on the active stroke too: 15% darker while flowing
      drawStroke(ctx, this.lastActive.stroke, this.noise, this.opts.jitter, this.lastActive.dist);
      ctx.globalAlpha = 0.15;
      drawStroke(ctx, this.lastActive.stroke, this.noise, this.opts.jitter, this.lastActive.dist, '#000000');
      ctx.restore();
    }
  }

  private ensureWetLoop(): void {
    if (this.wetRafId !== null || !this.alive) return;
    const step = (): void => {
      const now = this.clock.now();
      this.wet = this.wet.filter((w) => now - w.at < WET_INK_MS);
      this.render();
      this.wetRafId = this.wet.length ? this.clock.raf(step) : null;
    };
    this.wetRafId = this.clock.raf(step);
  }

  // ------------------------------------------------------------ public API

  async clear(mode: 'instant' | 'dissolve' = 'instant'): Promise<void> {
    if (!this.alive) return;
    this.scheduler.skipAll();
    if (mode === 'dissolve') {
      // CSS px — the layer ctx is dpr-scaled already.
      const bounds = { x: 0, y: 0, width: this.width, height: this.height };
      await Promise.all([
        runDissolve(this.committed.bitmap as HTMLCanvasElement, bounds, this.clock, this.opts.seed, () => this.render()),
        runDissolve(this.captureLayer.bitmap as HTMLCanvasElement, bounds, this.clock, this.opts.seed + 1, () => this.render()),
      ]);
    }
    this.committed.clear();
    this.captureLayer.clear();
    this.layout.reset();
    this.scrollY = 0;
    this.wet = [];
    this.lastActive = null;
    this.render();
  }

  enableCapture(opts?: { commitAfterMs?: number; nib?: NibStyle }): void {
    if (!this.alive) return;
    this.capture ??= new CaptureController(
      this.opts.canvas,
      {
        onSegment: (x0, y0, x1, y1, nib) => {
          const ctx = this.captureLayer.ctx;
          ctx.strokeStyle = nib.color;
          ctx.lineWidth = nib.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          this.render();
        },
        onDot: (x, y, nib) => {
          const ctx = this.captureLayer.ctx;
          ctx.fillStyle = nib.color;
          ctx.beginPath();
          ctx.arc(x, y, nib.width * 0.7, 0, Math.PI * 2);
          ctx.fill();
          this.render();
        },
        onIdleCommit: () => void this.commitCapture(),
      },
      this.clock
    );
    this.capture.enable(opts);
  }

  disableCapture(): void {
    this.capture?.disable();
  }

  async commitCapture(): Promise<CaptureResult> {
    if (!this.alive || !this.capture) {
      throw new Error('quill-ink: capture is not enabled');
    }
    if (this.committing) throw new Error('quill-ink: capture commit already in progress');
    this.committing = true;
    try {
      const boundsBox = this.capture.bounds();
      const strokes: CapturedStroke[] = this.capture.take();
      const png = await exportSurfacePNG([this.captureLayer.bitmap], this.width, this.height, 2);
      const result: CaptureResult = {
        png,
        strokes,
        bounds: new DOMRect(boundsBox.x, boundsBox.y, boundsBox.width, boundsBox.height),
      };
      // the page drinks the ink — bounds in CSS px: the layer ctx already
      // carries the dpr scale, so device-px coords would land at dpr².
      await runDissolve(
        this.captureLayer.bitmap as HTMLCanvasElement,
        boundsBox,
        this.clock,
        this.opts.seed,
        () => this.render()
      );
      this.captureLayer.clear();
      this.render();
      for (const cb of this.captureListeners) cb(result);
      return result;
    } finally {
      this.committing = false;
    }
  }

  onCapture(cb: (r: CaptureResult) => void): Unsubscribe {
    this.captureListeners.add(cb);
    return () => this.captureListeners.delete(cb);
  }

  async exportPNG(scale = 2): Promise<Blob> {
    if (!this.alive) throw new Error('quill-ink: exportPNG is browser-only');
    return exportSurfacePNG([this.committed.bitmap, this.captureLayer.bitmap], this.width, this.height, scale);
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.alive) return;
    this.scheduler.destroy();
    this.loader.destroy();
    this.capture?.destroy();
    if (this.wetRafId !== null) this.clock.caf(this.wetRafId);
    this.writeResolvers.forEach((resolve) => resolve());
    this.writeResolvers.clear();
    this.captureListeners.clear();
  }
}
