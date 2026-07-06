/**
 * Font pack generator: downloads OFL TTFs (cached), rasterizes each glyph
 * with the pure-TS rasterizer, runs the SAME thinning pipeline the browser
 * worker uses, and emits normalized skeleton packs into
 * packages/quill-ink-fonts/src/packs/.
 *
 * Usage: npx tsx tools/font-packs/generate.ts [--font=caveat|dancing-script|shadows-into-light|all]
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import * as opentype from 'opentype.js';
import { flattenPath, fillContours, PathCommand } from './raster';
import { alphaToStrokes } from '../../packages/quill-ink-core/src/lib/pipeline/glyph-pipeline';
import type { FontPack, FontPackGlyph } from '../../packages/quill-ink-core/src/lib/fonts/font-pack';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cacheDir = resolve(root, 'tools/font-packs/.cache');
const outDir = resolve(root, 'packages/quill-ink-fonts/src/packs');
const debugDir = process.env['QUILL_DEBUG_DIR'] ?? resolve(root, 'tools/font-packs/.cache/debug');

const FONTS = [
  {
    id: 'caveat',
    name: 'Caveat',
    file: 'Caveat[wght].ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/Caveat%5Bwght%5D.ttf',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/OFL.txt',
  },
  {
    id: 'dancing-script',
    name: 'Dancing Script',
    file: 'DancingScript[wght].ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/dancingscript/OFL.txt',
  },
  {
    id: 'shadows-into-light',
    name: 'Shadows Into Light',
    file: 'ShadowsIntoLight.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/shadowsintolight/ShadowsIntoLight.ttf',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/shadowsintolight/OFL.txt',
  },
] as const;

// raster em size: 4x a generous 64px target for detail; thinning is offline
const RASTER_EM = 256;
const PACK_UNITS = 1000;
const MAX_GZ_BYTES = 320 * 1024;

function charset(): string[] {
  const chars: string[] = [];
  for (let c = 33; c <= 126; c++) chars.push(String.fromCharCode(c)); // printable ASCII (space handled by advance only)
  for (let c = 0xa1; c <= 0xff; c++) chars.push(String.fromCharCode(c)); // Latin-1 supplement
  chars.push('‘', '’', '“', '”', '–', '—', '…'); // ‘ ’ “ ” – — …
  return chars;
}

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function glyphToPackGlyph(font: opentype.Font, char: string): FontPackGlyph | null {
  const glyph = font.charToGlyph(char);
  if (!glyph || glyph.index === 0) return null; // .notdef → skip, runtime fallback
  const scale = RASTER_EM / font.unitsPerEm;
  const toPack = PACK_UNITS / RASTER_EM;
  const advance = (glyph.advanceWidth ?? 0) * (PACK_UNITS / font.unitsPerEm);

  // path in pixel space, baseline at y=0, y-down (opentype flips y for us)
  const path = glyph.getPath(0, 0, RASTER_EM);
  const commands = path.commands as PathCommand[];
  if (!commands.length) return { advance: round1(advance), strokes: [] }; // space-like

  const contours = flattenPath(commands);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const contour of contours) {
    for (const [x, y] of contour) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) return { advance: round1(advance), strokes: [] };

  const pad = 4;
  const offX = Math.floor(minX) - pad;
  const offY = Math.floor(minY) - pad;
  const width = Math.ceil(maxX) - offX + pad * 2;
  const height = Math.ceil(maxY) - offY + pad * 2;
  if (width <= 0 || height <= 0 || width * height > 4_000_000) return null;

  const shifted = contours.map((c) => c.map(([x, y]) => [x - offX, y - offY] as [number, number]));
  const alpha = fillContours(shifted, width, height);
  const { strokes } = alphaToStrokes(alpha, width, height, { epsilon: 0.75, segmentsPerSpan: 2 });

  const packStrokes = strokes.map((s) => {
    const flat = new Array<number>(s.length * 2);
    for (let i = 0; i < s.length; i++) {
      flat[i * 2] = round1((s[i].x + offX) * toPack);
      flat[i * 2 + 1] = round1((s[i].y + offY) * toPack);
    }
    return flat;
  });
  void scale;
  return { advance: round1(advance), strokes: packStrokes };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function debugHtml(pack: FontPack, sample: string): string {
  const glyphRows = [...sample]
    .map((ch) => {
      const g = pack.glyphs[ch];
      if (!g) return '';
      const paths = g.strokes
        .map((flat) => {
          let d = `M ${flat[0]} ${flat[1]}`;
          for (let i = 2; i < flat.length; i += 2) d += ` L ${flat[i]} ${flat[i + 1]}`;
          return `<path d="${d}" fill="none" stroke="#1a2b4a" stroke-width="18" stroke-linecap="round"/>`;
        })
        .join('');
      return `<svg viewBox="-100 -900 1200 1300" width="90" style="border:1px solid #ddd">${paths}</svg>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${pack.id}</title><body style="font-family:sans-serif"><h2>${pack.name} skeleton pack</h2>${glyphRows}</body>`;
}

async function generateFont(fontDef: (typeof FONTS)[number]): Promise<void> {
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  mkdirSync(debugDir, { recursive: true });

  const ttfPath = resolve(cacheDir, fontDef.file);
  const oflPath = resolve(cacheDir, `${fontDef.id}-OFL.txt`);
  await download(fontDef.url, ttfPath);
  await download(fontDef.licenseUrl, oflPath);

  const font = opentype.parse(readFileSync(ttfPath).buffer.slice(0)) as opentype.Font;
  const unitScale = PACK_UNITS / font.unitsPerEm;

  const glyphs: Record<string, FontPackGlyph> = {};
  // space: advance only
  const space = font.charToGlyph(' ');
  glyphs[' '] = { advance: round1((space?.advanceWidth ?? font.unitsPerEm / 4) * unitScale), strokes: [] };

  let done = 0;
  const chars = charset();
  for (const ch of chars) {
    const g = glyphToPackGlyph(font, ch);
    if (g) glyphs[ch] = g;
    if (++done % 50 === 0) process.stdout.write(`  ${fontDef.id}: ${done}/${chars.length}\r`);
  }

  // pair kerning for common pairs (ASCII letters/punctuation)
  const kerning: Record<string, number> = {};
  const kernChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,\'"'];
  for (const a of kernChars) {
    for (const b of kernChars) {
      const k = font.getKerningValue(font.charToGlyph(a), font.charToGlyph(b));
      if (k) kerning[a + b] = round1(k * unitScale);
    }
  }

  const os2 = font.tables['os2'] as { sTypoAscender?: number; sTypoDescender?: number } | undefined;
  const pack: FontPack = {
    version: 1,
    id: fontDef.id,
    name: fontDef.name,
    unitsPerEm: PACK_UNITS,
    ascent: round1((os2?.sTypoAscender ?? font.ascender) * unitScale),
    descent: round1(Math.abs(os2?.sTypoDescender ?? font.descender) * unitScale),
    glyphs,
    ...(Object.keys(kerning).length ? { kerning } : {}),
  };

  const json = JSON.stringify(pack);
  const gz = gzipSync(Buffer.from(json)).length;
  if (gz > MAX_GZ_BYTES) {
    throw new Error(`${fontDef.id}: pack is ${(gz / 1024).toFixed(0)}KB gz — exceeds ${MAX_GZ_BYTES / 1024}KB budget`);
  }
  writeFileSync(resolve(outDir, `${fontDef.id}.json`), json);
  writeFileSync(resolve(outDir, `${fontDef.id}-OFL.txt`), readFileSync(oflPath));

  // TS wrapper module: JSON embedded as a string literal (typechecks fast,
  // parsed once at module load). resolveJsonModule on a 300KB pack makes
  // tsc infer the full literal type and hangs the build.
  const exportName = fontDef.id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const wrapper = `// AUTO-GENERATED by tools/font-packs/generate.ts — do not edit.
import type { FontPack } from '@codewithahsan/quill-ink-core';

/** Precomputed skeleton pack for '${fontDef.id}' (OFL licensed — see ../packs/${fontDef.id}-OFL.txt). */
export const ${exportName}: FontPack = JSON.parse(
  ${JSON.stringify(json)}
) as FontPack;
`;
  writeFileSync(resolve(root, `packages/quill-ink-fonts/src/lib/${fontDef.id}.ts`), wrapper);
  writeFileSync(resolve(debugDir, `${fontDef.id}.html`), debugHtml(pack, 'Hello quill ink 123 xtfg'));
  console.log(`\n${fontDef.id}: ${Object.keys(glyphs).length} glyphs, ${(json.length / 1024).toFixed(0)}KB raw, ${(gz / 1024).toFixed(0)}KB gz`);
}

async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith('--font='))?.slice(7) ?? 'all';
  const targets = arg === 'all' ? FONTS : FONTS.filter((f) => f.id === arg);
  if (!targets.length) throw new Error(`unknown font '${arg}'`);
  for (const f of targets) await generateFont(f);
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
