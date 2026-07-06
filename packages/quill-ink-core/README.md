# @codewithahsan/quill-ink-core

Framework-agnostic TypeScript engine that renders **streaming text as animated handwriting** — ink flowing from an invisible quill onto paper — and captures **user pen strokes** (with a "the page drinks your ink" dissolve) for consumption by vision LLMs.

Zero dependencies. No framework imports. Canvas 2D only.

## Install

```bash
npm i @codewithahsan/quill-ink-core @codewithahsan/quill-ink-fonts
```

## Write path — machine → page

```ts
import { InkSurface, registerFontPack } from '@codewithahsan/quill-ink-core';
import { caveat } from '@codewithahsan/quill-ink-fonts/caveat';

registerFontPack(caveat);

const surface = new InkSurface({
  canvas: document.querySelector('canvas')!,
  font: 'caveat',
  fontSize: 28,
  inkColor: '#1a2b4a',   // iron gall blue-black
  penSpeed: 900,         // px of path per second
  paper: 'ruled',
});

// strings…
const handle = surface.write('Dear reader, this page writes itself…');
await handle.done;

// …or token streams (any AsyncIterable<string>)
surface.write(llmTokenStream);
```

The pen writes stroke by stroke with pressure-modulated width, ink dots at
stroke starts, tapered ends, per-glyph lightness jitter, baseline wobble and
punctuation pauses (220ms after `.` `!` `?`, 120ms after `,`). When the token
queue grows the pen hurries (up to 2.5×); when it starves the pen simply
rests — no spinner, ever.

## Capture path — human → machine

```ts
surface.enableCapture({ commitAfterMs: 2800 });
surface.onCapture(({ png, strokes, bounds }) => {
  // png: Blob (white bg baked, 2× scale) — send to your vision model
  // strokes: [x, y, tMs][][] raw polylines
});
```

After the idle timeout (or an explicit `surface.commitCapture()`), the page
*drinks the ink* — a directional dissolve absorbs the strokes — and the
committed snapshot is emitted.

## How it works

Handwriting fonts are outline fonts; a pen needs **centerline strokes**. The
engine ships precomputed skeleton packs (see `@codewithahsan/quill-ink-fonts`)
generated via: rasterize → binarize → Zhang-Suen thinning → 8-neighbor graph
tracing (min-turning-angle through junctions) → RDP simplification →
Catmull-Rom smoothing. Glyphs not covered by a pack fall back to the same
pipeline at runtime, in a Web Worker spawned from an inline Blob URL — no
bundler configuration needed. Results are cached in memory and IndexedDB.

Strict CSP without `worker-src blob:`? The engine transparently falls back to
synchronous main-thread thinning (pack-covered glyphs never thin at runtime
anyway).

## SSR

Constructing `InkSurface` outside a browser yields an inert no-op surface;
all methods are safe to call.

## Out of scope for v1

RTL and CJK scripts, ligature-aware ductus, stylus pressure
(`PointerEvent.pressure` lands in v2), React/Vue wrappers (the core is ready
for them — contributions welcome).

## License

MIT
