import { hasWorker } from '../util/env';
import { GlyphStrokes, Stroke } from '../pipeline/types';
import { alphaToStrokes } from '../pipeline/glyph-pipeline';
import { GlyphPipelineOptions } from '../pipeline/glyph-pipeline';
import { WORKER_SOURCE } from './worker-code.generated';
import type { SkeletonResponse } from './skeleton-worker.entry';

/**
 * Host for the skeleton worker. Spawns an inline Blob-URL worker (zero
 * consumer bundler config); falls back to running the identical pipeline
 * synchronously on the main thread when Workers are unavailable (SSR,
 * strict CSP without `worker-src blob:`).
 */
export class SkeletonWorkerHost {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (g: GlyphStrokes) => void; reject: (e: Error) => void }>();
  private disposed = false;

  constructor(private readonly forceSync = false) {}

  private ensureWorker(): Worker | null {
    if (this.forceSync || !hasWorker()) return null;
    if (this.worker) return this.worker;
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = (ev: MessageEvent<SkeletonResponse>) => this.onResponse(ev.data);
      worker.onerror = () => this.failAll(new Error('skeleton worker crashed'));
      this.worker = worker;
    } catch {
      // e.g. CSP without worker-src blob: — stay on the sync path
      this.worker = null;
    }
    return this.worker;
  }

  thin(alpha: Uint8Array, width: number, height: number, opts: GlyphPipelineOptions = {}): Promise<GlyphStrokes> {
    if (this.disposed) return Promise.reject(new Error('SkeletonWorkerHost disposed'));
    const worker = this.ensureWorker();
    if (!worker) {
      try {
        return Promise.resolve(alphaToStrokes(alpha, width, height, opts));
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
    const id = this.nextId++;
    return new Promise<GlyphStrokes>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // copy so the caller keeps its buffer; transfer the copy
      const buf = alpha.slice().buffer;
      worker.postMessage(
        { id, alpha: buf, width, height, epsilon: opts.epsilon, segmentsPerSpan: opts.segmentsPerSpan },
        [buf]
      );
    });
  }

  private onResponse(res: SkeletonResponse): void {
    const entry = this.pending.get(res.id);
    if (!entry) return;
    this.pending.delete(res.id);
    if (res.error || !res.strokes) {
      entry.reject(new Error(res.error ?? 'skeleton worker returned no strokes'));
      return;
    }
    const strokes: Stroke[] = (res.strokes as unknown as number[][]).map((flat) => {
      const s: Stroke = new Array(flat.length / 2);
      for (let i = 0; i < s.length; i++) s[i] = { x: flat[i * 2], y: flat[i * 2 + 1] };
      return s;
    });
    entry.resolve({ strokes, width: res.width ?? 0, height: res.height ?? 0 });
  }

  private failAll(err: Error): void {
    for (const { reject } of this.pending.values()) reject(err);
    this.pending.clear();
  }

  destroy(): void {
    this.disposed = true;
    this.failAll(new Error('SkeletonWorkerHost disposed'));
    this.worker?.terminate();
    this.worker = null;
  }
}
