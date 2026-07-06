import { binarizeAlpha } from './binarize';
import { morphologicalClose } from './morphology';
import { zhangSuenThin } from './zhang-suen';
import { vectorize } from './vectorize';
import { rdpSimplify, catmullRomSmooth } from './simplify';
import { orderStrokes } from './stroke-order';
import { Bitmap, GlyphStrokes } from './types';

export interface GlyphPipelineOptions {
  /** RDP tolerance in raster pixels. */
  epsilon?: number;
  /** Catmull-Rom points inserted per span for replay smoothness. */
  segmentsPerSpan?: number;
}

/**
 * Full glyph pipeline: binary bitmap -> close -> thin -> vectorize ->
 * simplify -> smooth -> order. Pure typed-array code — identical in the
 * browser Worker and the Node font-pack generator.
 */
export function glyphBitmapToStrokes(bitmap: Bitmap, opts: GlyphPipelineOptions = {}): GlyphStrokes {
  const { epsilon = 0.75, segmentsPerSpan = 4 } = opts;
  const closed = morphologicalClose(bitmap);
  const skeleton = zhangSuenThin(closed);
  const raw = vectorize(skeleton);
  const strokes = orderStrokes(
    raw.map((s) => catmullRomSmooth(rdpSimplify(s, epsilon), segmentsPerSpan))
  );
  return { strokes, width: bitmap.width, height: bitmap.height };
}

/** Convenience for callers holding a single-channel alpha buffer. */
export function alphaToStrokes(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  opts?: GlyphPipelineOptions
): GlyphStrokes {
  return glyphBitmapToStrokes(binarizeAlpha(alpha, width, height), opts);
}
