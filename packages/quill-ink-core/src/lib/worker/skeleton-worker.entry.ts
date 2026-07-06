/**
 * Web Worker entry: thins glyph bitmaps off the main thread.
 * Bundled standalone by tools/scripts/build-worker.mjs into
 * worker-code.generated.ts (inline Blob-URL worker — zero consumer config).
 *
 * Protocol: { id, alpha: ArrayBuffer, width, height, epsilon?, segmentsPerSpan? }
 *        -> { id, strokes: number[][][] } | { id, error: string }
 */
import { alphaToStrokes } from '../pipeline/glyph-pipeline';

export interface SkeletonRequest {
  id: number;
  alpha: ArrayBuffer;
  width: number;
  height: number;
  epsilon?: number;
  segmentsPerSpan?: number;
}

export interface SkeletonResponse {
  id: number;
  strokes?: number[][];
  width?: number;
  height?: number;
  error?: string;
}

/** Flatten strokes to transferable-friendly number arrays [x0,y0,x1,y1,...]. */
export function handleSkeletonRequest(req: SkeletonRequest): SkeletonResponse {
  try {
    const alpha = new Uint8Array(req.alpha);
    const result = alphaToStrokes(alpha, req.width, req.height, {
      epsilon: req.epsilon,
      segmentsPerSpan: req.segmentsPerSpan,
    });
    const strokes = result.strokes.map((s) => {
      const flat = new Array<number>(s.length * 2);
      for (let i = 0; i < s.length; i++) {
        flat[i * 2] = s[i].x;
        flat[i * 2 + 1] = s[i].y;
      }
      return flat;
    });
    return { id: req.id, strokes, width: result.width, height: result.height };
  } catch (e) {
    return { id: req.id, error: e instanceof Error ? e.message : String(e) };
  }
}

// Worker global wiring — no-op when imported in a non-worker context.
declare const self: { onmessage?: unknown; postMessage?: (m: unknown) => void } | undefined;
if (typeof self !== 'undefined' && typeof (self as { postMessage?: unknown }).postMessage === 'function' && typeof window === 'undefined') {
  (self as { onmessage: (ev: { data: SkeletonRequest }) => void }).onmessage = (ev) => {
    (self as { postMessage: (m: unknown) => void }).postMessage(handleSkeletonRequest(ev.data));
  };
}
