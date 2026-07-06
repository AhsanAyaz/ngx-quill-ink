import { ArcPath } from './arc-length';
import { EngineClock, MAX_HURRY_FACTOR } from '../surface/surface-options';

export interface StrokeJob {
  path: ArcPath;
  /** Base stroke width px (before pressure modulation). */
  baseWidth: number;
  /** Final ink color for this glyph (lightness jitter pre-applied). */
  color: string;
  /** Noise offset so each stroke's pressure profile differs. */
  noiseOffset: number;
}

export interface WordJob {
  strokes: StrokeJob[];
  pauseAfterMs: number;
  writeId: number;
  /** Surface-level metadata (e.g. baseline for scroll-on-reach). */
  meta?: unknown;
}

export interface SchedulerCallbacks {
  /** The pen is about to start a new word (fires once per word). */
  onWordStart?(word: WordJob): void;
  /** A stroke finished animating — bake it into the committed layer. */
  onStrokeCommitted(stroke: StrokeJob): void;
  /** Redraw the active stroke up to `dist` (null = nothing active). */
  onFrame(active: { stroke: StrokeJob; dist: number } | null): void;
  /** All work for a write id is done. */
  onWriteDone(writeId: number): void;
  /** The queue fully drained. */
  onIdle(): void;
}

const defaultClock: EngineClock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  raf: (cb) =>
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame(cb)
      : (setTimeout(() => cb(Date.now()), 16) as unknown as number),
  caf: (id) =>
    typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame(id) : clearTimeout(id),
};

/**
 * Replay scheduler: advances a distance budget (penSpeed × dt) along queued
 * strokes each frame. When the queue grows the pen hurries (up to 2.5×);
 * when it starves the pen simply rests at the last word — no spinner, ever.
 * Punctuation adds thoughtful pauses (220ms sentence / 120ms comma).
 */
export class PenScheduler {
  private queue: WordJob[] = [];
  private strokeIdx = 0;
  private dist = 0;
  private pauseUntil = 0;
  private rafId: number | null = null;
  private lastTick = 0;
  private running = false;
  /** Writes that still produce words (streaming). */
  private openWrites = new Set<number>();
  private pendingWords = new Map<number, number>();
  private startedWord: WordJob | null = null;

  constructor(
    private readonly callbacks: SchedulerCallbacks,
    private penSpeed: number,
    private readonly clock: EngineClock = defaultClock
  ) {}

  setPenSpeed(pxPerSecond: number): void {
    this.penSpeed = pxPerSecond;
  }

  /** Mark a write as producing (streaming); done fires only after closeWrite. */
  openWrite(writeId: number): void {
    this.openWrites.add(writeId);
    this.pendingWords.set(writeId, this.pendingWords.get(writeId) ?? 0);
  }

  closeWrite(writeId: number): void {
    this.openWrites.delete(writeId);
    this.maybeFinishWrite(writeId);
  }

  enqueue(word: WordJob): void {
    this.queue.push(word);
    this.pendingWords.set(word.writeId, (this.pendingWords.get(word.writeId) ?? 0) + 1);
    this.start();
  }

  /** Instantly commit all remaining strokes for a write (skip animation). */
  skip(writeId: number): void {
    this.drain(writeId, true);
  }

  /** Drop remaining strokes for a write. */
  cancel(writeId: number): void {
    this.drain(writeId, false);
  }

  /** Instantly commit everything (used by clear + tests). */
  skipAll(): void {
    for (const id of new Set(this.queue.map((w) => w.writeId))) this.skip(id);
  }

  get queueLength(): number {
    return this.queue.length;
  }

  destroy(): void {
    if (this.rafId !== null) this.clock.caf(this.rafId);
    this.rafId = null;
    this.running = false;
    this.queue = [];
  }

  /** Advance the animation manually — exposed for deterministic tests. */
  tick(nowMs: number): void {
    const dt = Math.min(0.1, Math.max(0, (nowMs - this.lastTick) / 1000));
    this.lastTick = nowMs;

    if (nowMs < this.pauseUntil) {
      this.callbacks.onFrame(null);
      this.scheduleNext();
      return;
    }

    const word = this.queue[0];
    if (!word) {
      // starved: rest at the last word, keep the loop parked
      this.running = false;
      this.rafId = null;
      this.callbacks.onFrame(null);
      this.callbacks.onIdle();
      return;
    }

    if (this.startedWord !== word) {
      this.startedWord = word;
      this.callbacks.onWordStart?.(word);
    }

    // hurry when the queue grows: +12.5% per queued word, capped at 2.5x
    const hurry = Math.min(MAX_HURRY_FACTOR, 1 + this.queue.length * 0.125);
    let budget = this.penSpeed * hurry * dt;

    while (budget > 0) {
      const stroke = word.strokes[this.strokeIdx];
      if (!stroke) break;
      const remaining = stroke.path.totalLength - this.dist;
      if (budget >= remaining) {
        budget -= remaining;
        this.callbacks.onStrokeCommitted(stroke);
        this.strokeIdx++;
        this.dist = 0;
        if (this.strokeIdx >= word.strokes.length) {
          this.finishWord(nowMs);
          break;
        }
      } else {
        this.dist += budget;
        budget = 0;
      }
    }

    const active = this.queue[0]?.strokes[this.strokeIdx];
    this.callbacks.onFrame(active ? { stroke: active, dist: this.dist } : null);
    this.scheduleNext();
  }

  private finishWord(nowMs: number): void {
    const word = this.queue.shift() as WordJob;
    this.strokeIdx = 0;
    this.dist = 0;
    if (word.pauseAfterMs > 0) this.pauseUntil = nowMs + word.pauseAfterMs;
    this.decrementPending(word.writeId);
  }

  private decrementPending(writeId: number): void {
    const left = (this.pendingWords.get(writeId) ?? 1) - 1;
    this.pendingWords.set(writeId, left);
    this.maybeFinishWrite(writeId);
  }

  private maybeFinishWrite(writeId: number): void {
    if ((this.pendingWords.get(writeId) ?? 0) === 0 && !this.openWrites.has(writeId)) {
      this.pendingWords.delete(writeId);
      this.callbacks.onWriteDone(writeId);
    }
  }

  private drain(writeId: number, commit: boolean): void {
    const kept: WordJob[] = [];
    let first = true;
    for (const word of this.queue) {
      if (word.writeId !== writeId) {
        kept.push(word);
        continue;
      }
      const startIdx = first && word === this.queue[0] ? this.strokeIdx : 0;
      if (commit) {
        for (let i = startIdx; i < word.strokes.length; i++) {
          this.callbacks.onStrokeCommitted(word.strokes[i]);
        }
      }
      this.decrementPending(word.writeId);
      first = false;
    }
    if (this.queue[0]?.writeId === writeId) {
      this.strokeIdx = 0;
      this.dist = 0;
    }
    this.queue = kept;
    this.callbacks.onFrame(null);
    if (!this.queue.length) this.callbacks.onIdle();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTick = this.clock.now();
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.rafId = this.clock.raf((t) => this.tick(t));
  }
}
