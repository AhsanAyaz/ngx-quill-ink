import { EngineClock, NibStyle } from '../surface/surface-options';

export type CapturedStroke = Array<[number, number, number]>;

export interface CaptureCallbacks {
  /** Incremental segment to render (same nib as the write path). */
  onSegment(x0: number, y0: number, x1: number, y1: number, nib: Required<NibStyle>): void;
  /** A dot (pointerdown+up without movement). */
  onDot(x: number, y: number, nib: Required<NibStyle>): void;
  /** Idle timeout elapsed — commit the capture. */
  onIdleCommit(): void;
}

const DEFAULT_NIB: Required<NibStyle> = { width: 2.2, color: '#1a2b4a' };

/**
 * Records pointer/stylus strokes as [x, y, tMs] polylines and renders them
 * immediately with the same nib style as the write path (input and AI
 * output share one visual language — intentional). Commits on idle timeout
 * or explicit call.
 */
export class CaptureController {
  private strokes: CapturedStroke[] = [];
  private active: CapturedStroke | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private startTime = 0;
  private enabled = false;
  private nib: Required<NibStyle> = DEFAULT_NIB;
  private commitAfterMs = 2800;

  private readonly onDown = (e: PointerEvent) => this.pointerDown(e);
  private readonly onMove = (e: PointerEvent) => this.pointerMove(e);
  private readonly onUp = (e: PointerEvent) => this.pointerUp(e);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: CaptureCallbacks,
    private readonly clock: EngineClock
  ) {}

  enable(opts?: { commitAfterMs?: number; nib?: NibStyle }): void {
    if (this.enabled) return;
    this.enabled = true;
    this.commitAfterMs = opts?.commitAfterMs ?? 2800;
    this.nib = { ...DEFAULT_NIB, ...opts?.nib };
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.clearIdleTimer();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
  }

  get hasInk(): boolean {
    return this.strokes.length > 0 || this.active !== null;
  }

  /** Take the recorded strokes (resets the recorder). */
  take(): CapturedStroke[] {
    if (this.active) {
      this.strokes.push(this.active);
      this.active = null;
    }
    const out = this.strokes;
    this.strokes = [];
    this.startTime = 0;
    this.clearIdleTimer();
    return out;
  }

  /** Bounding box of recorded ink in CSS px. */
  bounds(): { x: number; y: number; width: number; height: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const all = this.active ? [...this.strokes, this.active] : this.strokes;
    for (const s of all) {
      for (const [x, y] of s) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    const pad = this.nib.width * 2;
    return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
  }

  destroy(): void {
    this.disable();
    this.strokes = [];
    this.active = null;
  }

  private pointerDown(e: PointerEvent): void {
    if (!e.isPrimary) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.clearIdleTimer();
    if (this.startTime === 0) this.startTime = this.clock.now();
    const [x, y] = this.toLocal(e);
    this.active = [[x, y, Math.round(this.clock.now() - this.startTime)]];
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.active || !e.isPrimary) return;
    const [x, y] = this.toLocal(e);
    const prev = this.active[this.active.length - 1];
    if (Math.hypot(x - prev[0], y - prev[1]) < 0.8) return;
    this.active.push([x, y, Math.round(this.clock.now() - this.startTime)]);
    this.callbacks.onSegment(prev[0], prev[1], x, y, this.nib);
  }

  private pointerUp(e: PointerEvent): void {
    if (!this.active || !e.isPrimary) return;
    if (this.active.length === 1) {
      const [x, y] = this.active[0];
      this.callbacks.onDot(x, y, this.nib);
    }
    this.strokes.push(this.active);
    this.active = null;
    this.armIdleTimer();
  }

  private armIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.hasInk) this.callbacks.onIdleCommit();
    }, this.commitAfterMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private toLocal(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }
}
