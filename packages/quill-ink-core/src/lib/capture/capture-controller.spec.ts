import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CaptureController, CaptureCallbacks } from './capture-controller';
import { EngineClock } from '../surface/surface-options';

/** Minimal canvas double: records listeners so tests can fire fake events. */
function fakeCanvas() {
  const listeners = new Map<string, (e: unknown) => void>();
  return {
    listeners,
    style: {} as CSSStyleDeclaration,
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    setPointerCapture: () => undefined,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 600, height: 400 }),
  };
}

function pointerEvent(x: number, y: number): unknown {
  return { isPrimary: true, pointerId: 1, clientX: x, clientY: y };
}

class TestClock implements EngineClock {
  t = 1000;
  now() {
    return this.t;
  }
  raf(cb: (t: number) => void): number {
    return setTimeout(() => cb(this.t), 0) as unknown as number;
  }
  caf(id: number) {
    clearTimeout(id);
  }
}

describe('CaptureController', () => {
  let canvas: ReturnType<typeof fakeCanvas>;
  let callbacks: CaptureCallbacks;
  let segments: number[][];
  let idleCommits: number;
  let clock: TestClock;
  let controller: CaptureController;

  beforeEach(() => {
    vi.useFakeTimers();
    canvas = fakeCanvas();
    segments = [];
    idleCommits = 0;
    callbacks = {
      onSegment: (x0, y0, x1, y1) => segments.push([x0, y0, x1, y1]),
      onDot: () => undefined,
      onIdleCommit: () => idleCommits++,
    };
    clock = new TestClock();
    controller = new CaptureController(
      canvas as unknown as HTMLCanvasElement,
      callbacks,
      clock
    );
  });

  afterEach(() => {
    controller.destroy();
    vi.useRealTimers();
  });

  const fire = (type: string, e: unknown) => canvas.listeners.get(type)?.(e);

  it('records strokes as [x, y, t] in canvas-local coords', () => {
    controller.enable();
    fire('pointerdown', pointerEvent(110, 220)); // local (100, 200)
    clock.t = 1050;
    fire('pointermove', pointerEvent(150, 220));
    clock.t = 1100;
    fire('pointermove', pointerEvent(190, 260));
    fire('pointerup', pointerEvent(190, 260));

    const strokes = controller.take();
    expect(strokes).toHaveLength(1);
    expect(strokes[0][0]).toEqual([100, 200, 0]);
    expect(strokes[0][1]).toEqual([140, 200, 50]);
    expect(strokes[0][2]).toEqual([180, 240, 100]);
  });

  it('renders segments immediately while drawing', () => {
    controller.enable();
    fire('pointerdown', pointerEvent(10, 20));
    fire('pointermove', pointerEvent(30, 40));
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual([0, 0, 20, 20]);
  });

  it('commits after the idle timeout (default 2800ms)', () => {
    controller.enable();
    fire('pointerdown', pointerEvent(10, 20));
    fire('pointermove', pointerEvent(30, 40));
    fire('pointerup', pointerEvent(30, 40));
    vi.advanceTimersByTime(2700);
    expect(idleCommits).toBe(0);
    vi.advanceTimersByTime(200);
    expect(idleCommits).toBe(1);
  });

  it('drawing again resets the idle timer', () => {
    controller.enable();
    fire('pointerdown', pointerEvent(10, 20));
    fire('pointerup', pointerEvent(10, 20));
    vi.advanceTimersByTime(2000);
    fire('pointerdown', pointerEvent(50, 60)); // resumes before timeout
    fire('pointerup', pointerEvent(50, 60));
    vi.advanceTimersByTime(2000);
    expect(idleCommits).toBe(0); // timer restarted
    vi.advanceTimersByTime(900);
    expect(idleCommits).toBe(1);
  });

  it('respects a custom commitAfterMs', () => {
    controller.enable({ commitAfterMs: 500 });
    fire('pointerdown', pointerEvent(10, 20));
    fire('pointerup', pointerEvent(10, 20));
    vi.advanceTimersByTime(600);
    expect(idleCommits).toBe(1);
  });

  it('bounds cover all recorded ink', () => {
    controller.enable();
    fire('pointerdown', pointerEvent(110, 120)); // local (100,100)
    fire('pointermove', pointerEvent(210, 320)); // local (200,300)
    fire('pointerup', pointerEvent(210, 320));
    const b = controller.bounds();
    expect(b.x).toBeLessThanOrEqual(100);
    expect(b.y).toBeLessThanOrEqual(100);
    expect(b.x + b.width).toBeGreaterThanOrEqual(200);
    expect(b.y + b.height).toBeGreaterThanOrEqual(300);
  });

  it('take() resets recorded strokes', () => {
    controller.enable();
    fire('pointerdown', pointerEvent(10, 20));
    fire('pointerup', pointerEvent(10, 20));
    expect(controller.take()).toHaveLength(1);
    expect(controller.take()).toHaveLength(0);
    expect(controller.hasInk).toBe(false);
  });

  it('disable stops listening', () => {
    controller.enable();
    controller.disable();
    expect(canvas.listeners.size).toBe(0);
  });
});
