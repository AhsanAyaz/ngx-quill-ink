import { FontPack, BuiltinFontId, CustomFontPack } from '../fonts/font-pack';

export interface NibStyle {
  /** Base stroke width in px at fontSize 28; scales with fontSize. */
  width?: number;
  color?: string;
}

export interface InkSurfaceOptions {
  canvas: HTMLCanvasElement;
  /** Builtin pack id (must be registered — see registerFontPack) or a pack object. */
  font?: BuiltinFontId | CustomFontPack;
  /** Font size in px. Default 28. */
  fontSize?: number;
  /** Ink color. Default iron gall blue-black. */
  inkColor?: string;
  /** Pen speed in px of path length per second. Default 900. */
  penSpeed?: number;
  /** 0..1 — pressure/wobble/rotation/lightness jitter intensity. Default 0.5. */
  jitter?: number;
  paper?: 'none' | 'grain' | 'ruled';
  seed?: number;
  onPageFull?: 'scroll' | 'page-turn';
}

export interface ResolvedOptions {
  canvas: HTMLCanvasElement;
  fontPack: FontPack;
  fontSize: number;
  inkColor: string;
  penSpeed: number;
  jitter: number;
  paper: 'none' | 'grain' | 'ruled';
  seed: number;
  onPageFull: 'scroll' | 'page-turn';
}

export interface CaptureResult {
  /** White background baked, 2x scale. */
  png: Blob;
  /** Raw polylines [x, y, tMs] per stroke, in CSS pixel coords. */
  strokes: Array<Array<[number, number, number]>>;
  bounds: DOMRect;
}

export type Unsubscribe = () => void;

export interface WriteHandle {
  /** Resolves when everything queued by this write() is on the page. */
  done: Promise<void>;
  /** Finish this write instantly (draw remaining ink without animation). */
  skip(): void;
  /** Drop this write's remaining ink. */
  cancel(): void;
}

/** Injectable clock/raf for tests. */
export interface EngineClock {
  now(): number;
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
}

export const DEFAULTS = {
  fontSize: 28,
  inkColor: '#1a2b4a',
  penSpeed: 900,
  jitter: 0.5,
  paper: 'grain' as const,
  seed: 1,
  onPageFull: 'scroll' as const,
};

export const PAUSE_SENTENCE_MS = 220;
export const PAUSE_COMMA_MS = 120;
export const WET_INK_MS = 400;
export const MAX_HURRY_FACTOR = 2.5;

const registry = new Map<string, FontPack>();

/**
 * Register a font pack under its id so `font: 'caveat'` resolves. The
 * Angular wrapper / app imports packs from @codewithahsan/quill-ink-fonts
 * and registers them — core stays pack-free.
 */
export function registerFontPack(pack: FontPack): void {
  registry.set(pack.id, pack);
}

export function resolveFontPack(font: InkSurfaceOptions['font']): FontPack {
  if (font && typeof font === 'object') return font;
  const id = font ?? 'caveat';
  const pack = registry.get(id);
  if (!pack) {
    throw new Error(
      `quill-ink: font pack '${id}' is not registered. ` +
        `Import it from @codewithahsan/quill-ink-fonts and call registerFontPack(pack), ` +
        `or pass the pack object in options.font.`
    );
  }
  return pack;
}
