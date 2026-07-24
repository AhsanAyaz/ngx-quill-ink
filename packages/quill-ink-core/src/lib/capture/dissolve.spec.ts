import { describe, expect, it } from 'vitest';
import { runDissolve, DISSOLVE_MS } from './dissolve';
import { EngineClock } from '../surface/surface-options';

/**
 * Records every erase op so tests can assert *where* the dissolve painted.
 * The real layer context carries a devicePixelRatio scale, so `runDissolve`
 * must receive CSS-pixel bounds — passing device pixels would place the
 * specks at dpr² and erase nothing visible.
 */
function fakeLayer() {
  const arcs: Array<{ x: number; y: number; r: number }> = [];
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    arc: (x: number, y: number, r: number) => arcs.push({ x, y, r }),
    fill: () => undefined,
    fillRect: (x: number, y: number, w: number, h: number) =>
      rects.push({ x, y, w, h }),
  };
  return {
    arcs,
    rects,
    canvas: { getContext: () => ctx } as unknown as HTMLCanvasElement,
  };
}

/** Advances only when the dissolve asks for a frame — no real rAF. */
class StepClock implements EngineClock {
  t = 0;
  private queue: Array<(t: number) => void> = [];
  now() {
    return this.t;
  }
  raf(cb: (t: number) => void): number {
    this.queue.push(cb);
    return this.queue.length;
  }
  caf() {
    return undefined;
  }
  /** Run pending frames, advancing the clock by `dt` before each. */
  tick(dt: number): void {
    const due = this.queue;
    this.queue = [];
    this.t += dt;
    for (const cb of due) cb(this.t);
  }
}

const BOUNDS = { x: 100, y: 50, width: 200, height: 40 };

describe('runDissolve', () => {
  it('erases inside the bounds it was given', async () => {
    const layer = fakeLayer();
    const clock = new StepClock();
    const done = runDissolve(layer.canvas, BOUNDS, clock, 1, () => undefined);

    // sweep to completion
    for (let i = 0; i < 20; i++) clock.tick(DISSOLVE_MS / 8);
    await done;

    expect(layer.arcs.length).toBeGreaterThan(0);
    // Regression: every speck must land within the bounds (plus its radius).
    // The dpr-scaled-bounds bug put these at 2–3× and erased nothing.
    for (const a of layer.arcs) {
      expect(a.x).toBeGreaterThanOrEqual(BOUNDS.x - a.r);
      expect(a.x).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width + a.r);
      expect(a.y).toBeGreaterThanOrEqual(BOUNDS.y - a.r);
      expect(a.y).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.height + a.r);
    }
  });

  it('sweeps gradually rather than wiping at once', async () => {
    const layer = fakeLayer();
    const clock = new StepClock();
    const done = runDissolve(layer.canvas, BOUNDS, clock, 1, () => undefined);

    clock.tick(DISSOLVE_MS * 0.25);
    const early = layer.arcs.length;
    clock.tick(DISSOLVE_MS * 0.25);
    const mid = layer.arcs.length;

    expect(early).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(early); // ink keeps being absorbed

    for (let i = 0; i < 20; i++) clock.tick(DISSOLVE_MS / 8);
    await done;
    // final wipe guarantees a clean page
    expect(layer.rects.length).toBe(1);
  });

  it('leaves the layer alone when there is nothing drawn', async () => {
    const layer = fakeLayer();
    const clock = new StepClock();
    await runDissolve(
      layer.canvas,
      { x: 0, y: 0, width: 0, height: 0 },
      clock,
      1,
      () => undefined,
    );
    expect(layer.arcs).toHaveLength(0);
    expect(layer.rects).toHaveLength(0);
  });
});
