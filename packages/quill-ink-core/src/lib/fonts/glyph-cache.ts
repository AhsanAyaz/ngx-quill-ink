import { FontPackGlyph } from './font-pack';

/** Simple bounded in-memory cache for runtime-thinned glyphs. */
export class GlyphCache {
  private map = new Map<string, FontPackGlyph>();

  constructor(private readonly maxEntries = 512) {}

  get(key: string): FontPackGlyph | undefined {
    const v = this.map.get(key);
    if (v) {
      // LRU touch
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: string, value: FontPackGlyph): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }
}
