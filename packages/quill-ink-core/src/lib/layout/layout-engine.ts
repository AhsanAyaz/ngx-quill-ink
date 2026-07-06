import { FontPack } from '../fonts/font-pack';

export interface WordPlacement {
  x: number;
  /** Baseline y in CSS px. */
  baselineY: number;
  /** True when the surface is full (before scroll/page-turn handling). */
  overflowsPage: boolean;
}

export interface MeasuredWord {
  width: number;
  /** Per-glyph pen x offsets within the word (kerning applied). */
  glyphOffsets: number[];
}

const LINE_HEIGHT_EM = 1.6;

/**
 * Greedy word-wrap layout over a font pack's advance widths. Stateful
 * cursor; `\n` handled via newlinesBefore. RTL/CJK out of scope for v1.
 */
export class LayoutEngine {
  private x: number;
  private line = 0;

  constructor(
    private readonly pack: FontPack,
    private readonly fontSize: number,
    private readonly maxWidth: number,
    private readonly padding = 16
  ) {
    this.x = padding;
  }

  get scale(): number {
    return this.fontSize / this.pack.unitsPerEm;
  }

  get lineHeight(): number {
    return this.fontSize * LINE_HEIGHT_EM;
  }

  get spaceWidth(): number {
    return (this.pack.glyphs[' ']?.advance ?? this.pack.unitsPerEm / 4) * this.scale;
  }

  measure(word: string): MeasuredWord {
    const glyphOffsets: number[] = [];
    let w = 0;
    const chars = [...word];
    for (let i = 0; i < chars.length; i++) {
      glyphOffsets.push(w);
      const glyph = this.pack.glyphs[chars[i]];
      const advance = (glyph?.advance ?? this.pack.unitsPerEm / 3) * this.scale;
      let kern = 0;
      if (i + 1 < chars.length && this.pack.kerning) {
        kern = (this.pack.kerning[chars[i] + chars[i + 1]] ?? 0) * this.scale;
      }
      w += advance + kern;
    }
    return { width: w, glyphOffsets };
  }

  /** Place the next word; advances the cursor. */
  place(measured: MeasuredWord, newlinesBefore: number, pageHeight: number): WordPlacement {
    for (let n = 0; n < newlinesBefore; n++) {
      this.line++;
      this.x = this.padding;
    }
    if (this.x > this.padding && this.x + measured.width > this.maxWidth - this.padding) {
      this.line++;
      this.x = this.padding;
    }
    const baselineY = this.padding + this.fontSize + this.line * this.lineHeight;
    const placement: WordPlacement = {
      x: this.x,
      baselineY,
      overflowsPage: baselineY + this.fontSize * 0.4 > pageHeight,
    };
    this.x += measured.width + this.spaceWidth;
    return placement;
  }

  /** Shift layout up by one line (after the surface scrolled). */
  scrollOneLine(): void {
    this.line = Math.max(0, this.line - 1);
  }

  reset(): void {
    this.x = this.padding;
    this.line = 0;
  }
}
