/**
 * Precomputed glyph skeleton pack. Coordinates are normalized to a
 * 1000-unit em, y-down, origin at the glyph's pen position on the baseline.
 * Packs are generated offline (tools/font-packs) and shipped as JSON in
 * @codewithahsan/quill-ink-fonts; the engine falls back to runtime thinning
 * for glyphs a pack doesn't cover.
 */
export interface FontPackGlyph {
  /** Horizontal advance in pack units (1000/em). */
  advance: number;
  /** Ordered pen strokes, each flat [x0, y0, x1, y1, ...] in pack units. */
  strokes: number[][];
}

export interface FontPack {
  version: 1;
  /** Stable id, e.g. 'caveat'. */
  id: string;
  /** Human-readable font name for attribution. */
  name: string;
  /** Always 1000 — coordinates are normalized at generation time. */
  unitsPerEm: number;
  /** Typographic ascent in pack units (positive, above baseline). */
  ascent: number;
  /** Typographic descent in pack units (positive, below baseline). */
  descent: number;
  glyphs: Record<string, FontPackGlyph>;
  /** Optional pair kerning: key `"ab"` -> adjustment in pack units. */
  kerning?: Record<string, number>;
}

export type BuiltinFontId = 'caveat' | 'dancing-script' | 'shadows-into-light';

/** A user-supplied pack must satisfy the same schema. */
export type CustomFontPack = FontPack;
