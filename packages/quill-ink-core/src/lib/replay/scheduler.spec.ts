import { describe, expect, it, vi } from 'vitest';
import { PenScheduler, StrokeJob, WordJob, SchedulerCallbacks } from './scheduler';
import { buildArcPath } from './arc-length';
import { EngineClock, PAUSE_SENTENCE_MS } from '../surface/surface-options';

/** Manual clock: advance() drives ticks deterministically. */
class FakeClock implements EngineClock {
  t = 0;
  private cbs: Array<(t: number) => void> = [];
  now(): number {
    return this.t;
  }
  raf(cb: (t: number) => void): number {
    this.cbs.push(cb);
    return this.cbs.length;
  }
  caf(): void {
    /* noop */
  }
  /** advance time and fire one pending frame */
  frame(dtMs: number): void {
    this.t += dtMs;
    const cbs = this.cbs;
    this.cbs = [];
    for (const cb of cbs) cb(this.t);
  }
  get pendingFrames(): number {
    return this.cbs.length;
  }
}

function stroke(len: number): StrokeJob {
  return {
    path: buildArcPath([
      { x: 0, y: 0 },
      { x: len, y: 0 },
    ]),
    baseWidth: 2,
    color: '#000',
    noiseOffset: 0,
  };
}

function word(strokeLens: number[], writeId = 1, pauseAfterMs = 0): WordJob {
  return { strokes: strokeLens.map(stroke), pauseAfterMs, writeId };
}

function setup(penSpeed = 100) {
  const clock = new FakeClock();
  const committed: StrokeJob[] = [];
  const writeDone = vi.fn();
  const frames: Array<{ dist: number } | null> = [];
  const callbacks: SchedulerCallbacks = {
    onStrokeCommitted: (s) => committed.push(s),
    onFrame: (a) => frames.push(a ? { dist: a.dist } : null),
    onWriteDone: writeDone,
    onIdle: () => undefined,
  };
  const scheduler = new PenScheduler(callbacks, penSpeed, clock);
  return { clock, committed, writeDone, frames, scheduler };
}

describe('PenScheduler', () => {
  it('advances distance = penSpeed × dt and commits strokes in order', () => {
    const { clock, committed, scheduler } = setup(100); // 100 px/s
    scheduler.openWrite(1);
    scheduler.enqueue(word([10, 10]));
    scheduler.closeWrite(1);

    clock.frame(0); // first tick: dt 0
    clock.frame(50); // 50ms → 5px into stroke 1 (below 10px)
    expect(committed).toHaveLength(0);
    clock.frame(60); // +6px → stroke 1 (10px) commits, 1px into stroke 2
    expect(committed).toHaveLength(1);
    clock.frame(100); // +10px → stroke 2 commits
    expect(committed).toHaveLength(2);
  });

  it('resolves write when its words are done', () => {
    const { clock, writeDone, scheduler } = setup(1000);
    scheduler.openWrite(1);
    scheduler.enqueue(word([5], 1));
    scheduler.closeWrite(1);
    clock.frame(0);
    clock.frame(100); // plenty of budget
    expect(writeDone).toHaveBeenCalledWith(1);
  });

  it('pauses after sentence punctuation', () => {
    const { clock, committed, scheduler } = setup(1000);
    scheduler.openWrite(1);
    scheduler.enqueue(word([5], 1, PAUSE_SENTENCE_MS));
    scheduler.enqueue(word([5], 1));
    scheduler.closeWrite(1);
    clock.frame(0);
    clock.frame(20); // word 1 done → pause armed
    expect(committed).toHaveLength(1);
    clock.frame(100); // still inside the 220ms pause
    expect(committed).toHaveLength(1);
    clock.frame(150); // pause over (270ms since) → word 2 progresses
    clock.frame(50);
    expect(committed).toHaveLength(2);
  });

  it('hurries when the queue grows (up to 2.5x)', () => {
    const { clock, committed, scheduler } = setup(100);
    scheduler.openWrite(1);
    // 20 queued words → hurry capped at 2.5x → 250 px/s
    for (let i = 0; i < 20; i++) scheduler.enqueue(word([25], 1));
    scheduler.closeWrite(1);
    clock.frame(0);
    clock.frame(100); // budget 25px at 2.5x — commits exactly one 25px stroke
    expect(committed).toHaveLength(1);
    // without hurry it would take 250ms per stroke; with 2.5x it's 100ms
  });

  it('parks the loop when starved and resumes on enqueue', () => {
    const { clock, committed, scheduler } = setup(1000);
    scheduler.openWrite(1);
    scheduler.enqueue(word([5], 1));
    clock.frame(0);
    clock.frame(50);
    expect(committed).toHaveLength(1);
    clock.frame(16); // starved tick → parks
    expect(clock.pendingFrames).toBe(0); // no spinner, no busy loop
    scheduler.enqueue(word([5], 1));
    clock.frame(0);
    clock.frame(50);
    expect(committed).toHaveLength(2);
    scheduler.closeWrite(1);
  });

  it('skip commits remaining strokes instantly', () => {
    const { clock, committed, scheduler } = setup(1);
    scheduler.openWrite(1);
    scheduler.enqueue(word([100, 100], 1));
    scheduler.enqueue(word([100], 1));
    scheduler.closeWrite(1);
    clock.frame(0);
    scheduler.skip(1);
    expect(committed).toHaveLength(3);
  });

  it('cancel drops remaining strokes', () => {
    const { clock, committed, writeDone, scheduler } = setup(1);
    scheduler.openWrite(1);
    scheduler.enqueue(word([100], 1));
    scheduler.closeWrite(1);
    clock.frame(0);
    scheduler.cancel(1);
    expect(committed).toHaveLength(0);
    expect(writeDone).toHaveBeenCalledWith(1);
  });

  it('interleaved writes keep independent done signals', () => {
    const { clock, writeDone, scheduler } = setup(1000);
    scheduler.openWrite(1);
    scheduler.openWrite(2);
    scheduler.enqueue(word([5], 1));
    scheduler.enqueue(word([5], 2));
    scheduler.closeWrite(1);
    clock.frame(0);
    clock.frame(100); // word of write 1 commits
    clock.frame(100); // word of write 2 commits
    expect(writeDone).toHaveBeenCalledWith(1);
    expect(writeDone).not.toHaveBeenCalledWith(2); // write 2 still open
    scheduler.closeWrite(2);
    expect(writeDone).toHaveBeenCalledWith(2);
  });
});
