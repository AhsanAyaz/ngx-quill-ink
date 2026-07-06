import { FontPack, FontPackGlyph } from './font-pack';
import { Stroke } from '../pipeline/types';
import { SkeletonWorkerHost } from '../worker/worker-host';
import { GlyphCache } from './glyph-cache';
import { IdbCache } from './idb-cache';
import { isBrowser } from '../util/env';
import { binarize } from '../pipeline/binarize';

/**
 * Resolves glyph strokes: precomputed pack first (never blocks the main
 * thread), falling back to runtime rasterize + worker thinning for glyphs
 * a pack doesn't cover. Runtime results are cached in memory + IndexedDB.
 */
export class PackLoader {
  private readonly memory = new GlyphCache();
  private readonly idb: IdbCache;
  private worker: SkeletonWorkerHost | null = null;

  constructor(private readonly pack: FontPack) {
    this.idb = new IdbCache(`quill-ink-${pack.id}`);
  }

  /** Pack-units strokes for a glyph, or null when runtime fallback is needed. */
  fromPack(char: string): FontPackGlyph | null {
    return this.pack.glyphs[char] ?? null;
  }

  /**
   * Runtime fallback: rasterize the char with the browser's font stack and
   * thin it in the worker. Returns strokes normalized to pack units.
   */
  async fromRuntime(char: string, sizeBucket = 128): Promise<FontPackGlyph | null> {
    if (!isBrowser()) return null;
    const key = `${char}@${sizeBucket}`;
    const cached = this.memory.get(key) ?? (await this.idb.get(key));
    if (cached) {
      this.memory.set(key, cached);
      return cached;
    }

    const raster = rasterizeChar(char, sizeBucket, this.pack.name);
    if (!raster) return null;
    this.worker ??= new SkeletonWorkerHost();
    const bitmap = binarize(raster.rgba, raster.width, raster.height);
    const { strokes } = await this.worker.thin(bitmap.data.map((v) => (v ? 255 : 0)) as Uint8Array, raster.width, raster.height);

    // normalize raster px -> pack units (baseline at raster.baseline)
    const toUnits = this.pack.unitsPerEm / sizeBucket;
    const glyph: FontPackGlyph = {
      advance: raster.advance * toUnits,
      strokes: strokes.map((s: Stroke) => {
        const flat = new Array<number>(s.length * 2);
        for (let i = 0; i < s.length; i++) {
          flat[i * 2] = (s[i].x - raster.padding) * toUnits;
          flat[i * 2 + 1] = (s[i].y - raster.baseline) * toUnits;
        }
        return flat;
      }),
    };
    this.memory.set(key, glyph);
    void this.idb.set(key, glyph);
    return glyph;
  }

  destroy(): void {
    this.worker?.destroy();
    this.worker = null;
  }
}

interface RasterResult {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  baseline: number;
  padding: number;
  advance: number;
}

function rasterizeChar(char: string, em: number, fontName: string): RasterResult | null {
  try {
    const pad = Math.ceil(em * 0.25);
    const width = em * 2 + pad * 2;
    const height = em * 2 + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const baseline = pad + Math.round(em * 1.2);
    ctx.fillStyle = '#000';
    ctx.font = `${em}px "${fontName}", cursive`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(char, pad, baseline);
    const advance = ctx.measureText(char).width;
    const data = ctx.getImageData(0, 0, width, height).data;
    return { rgba: data, width, height, baseline, padding: pad, advance };
  } catch {
    return null;
  }
}
