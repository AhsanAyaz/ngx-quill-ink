# Spec 01 — ngx-quill-ink

> A framework-agnostic TypeScript engine + Angular wrapper that renders streaming text as **animated handwriting** (ink flowing from an invisible quill), and captures **user pen strokes** (with a theatrical "the page drinks your ink" fade) for consumption by vision LLMs.

Status: Foundation library. Projects 02, 03, 04 depend on it.
License: MIT. Packages published to npm under public scope.

---

## 1. Concept

Every AI product streams tokens into a chat bubble. ngx-quill-ink replaces the bubble with **paper**: text materializes stroke-by-stroke in a flowing hand, at pen speed, with nib pressure and ink texture. It also works in reverse — it captures what a human writes with pointer/stylus, animates the ink being "absorbed" by the page, and hands you a clean PNG + stroke data to send to a vision model.

Two directions, one surface:

- **Write path** (machine → page): `surface.write(stream)` — streaming text renders as animated handwriting.
- **Capture path** (human → machine): `surface.capture()` — pointer strokes recorded, optional fade-out animation, exported as PNG/strokes.

## 2. Package layout (Nx monorepo)

```
packages/
  quill-ink-core/        # zero-dependency TS engine (canvas rendering, no framework)
  ngx-quill-ink/         # Angular wrapper: component, directive, signals API
  quill-ink-fonts/       # prebuilt glyph skeleton packs (JSON) for 3 handwriting fonts
apps/
  quill-ink-demo/        # Angular demo/playground site (deploy: Netlify)
```

`quill-ink-core` must have **no Angular imports** — this enables a future React/Vue wrapper and is a selling point.

## 3. The theatrics (write path) — exact behavior

This section is the product. Implement precisely.

1. **Paper**: the surface renders a subtle paper texture (procedural noise, ~3% opacity grain) and an optional faint ruled baseline. Background is transparent by default so it composes over any app.
2. **The quill**: an invisible (or optionally visible, tiny SVG nib) pen tip. Text appears **stroke by stroke**, not letter-fade. Each glyph is drawn along its skeleton path at a configurable pen speed (default 900 px/s of path length, so a word takes ~300–600ms).
3. **Ink physics**:
   - Stroke width varies 0.75×–1.25× along the path using low-frequency noise (simulates pressure).
   - Stroke start gets a slightly heavier "ink dot"; stroke end tapers.
   - Ink color has per-glyph ±4% lightness jitter (real ink is never uniform).
   - Optional "wet ink" pass: freshly drawn strokes render 15% darker for 400ms, then settle.
4. **Baseline wobble**: each word's baseline offset drifts ±1.5px with smoothed noise; glyph rotation jitter ±1.5°. Deterministic per (word, seed) so re-renders are stable.
5. **Streaming**: tokens arrive from an async iterable. The engine buffers into words, lays them out with line-wrap, and animates a queue. If the queue grows (model is fast), pen speed accelerates up to 2.5× — the pen "hurries", which reads as eagerness, not lag. If the queue starves, the pen pauses naturally at the last word (no spinner, ever).
6. **Punctuation beats**: after `.` `!` `?` the pen pauses 220ms; after `,` 120ms. This makes the writing feel *thoughtful*.
7. **Page-turn**: when the surface fills, either (a) auto-scroll paper upward at pen speed, or (b) "page turn" — current ink fades to 20% sepia and slides up, fresh paper below. Configurable.

### Capture path theatrics

1. User draws with pointer/pen; strokes render immediately with the same nib style (input and AI output share one visual language — this is intentional and important).
2. On commit (idle timeout, default 2800ms, or explicit call): **the page drinks the ink** — strokes fade via a directional dissolve (alpha noise mask sweeping in stroke-draw order, ~1.2s), as if absorbed into the paper.
3. The committed snapshot (PNG at 2× device pixels, white background baked) + raw stroke polylines are emitted in an event.

## 4. Core algorithm — text → strokes

The hard problem: handwriting fonts are **outline** fonts; we need **centerline stroke paths** to animate a pen.

### Pipeline (per glyph, cached aggressively)

1. **Rasterize**: render the glyph (fonts: Caveat, Dancing Script, Shadows Into Light — all OFL-licensed, verify before bundling) at 4× target size to an OffscreenCanvas, black on white.
2. **Binarize**: threshold at 50% luminance.
3. **Skeletonize**: Zhang-Suen thinning to a 1px skeleton. Run in a Web Worker (typed arrays; a 128×128 glyph must thin in <8ms on M-class hardware, <30ms on mid Android).
4. **Vectorize**: build an 8-neighbor pixel graph over skeleton pixels. Identify endpoints (1 neighbor) and junctions (3+). Trace polylines endpoint→junction/endpoint. At junctions, prefer the continuation with the smallest turning angle (keeps natural pen strokes together through crossings like in 't' or 'x').
5. **Simplify**: Ramer-Douglas-Peucker at ε = 0.75px, then Catmull-Rom smoothing for replay.
6. **Order strokes** for natural writing: sort by min-x of stroke bounding box; ties broken by min-y. (Good enough; a real ductus model is out of scope for v1.)
7. **Cache**: keyed by `(fontId, glyph, sizeBucket)`. Persist to IndexedDB. Ship **precomputed skeleton packs** in `quill-ink-fonts` (JSON: normalized polylines per glyph, ~150–300KB gzipped per font) so first paint never waits on thinning; runtime thinning is the fallback for uncovered glyphs/sizes.

### Layout

Greedy word-wrap using measured advance widths from the original font (canvas `measureText`), line-height 1.6em, honoring `\n`. RTL and CJK are explicitly **out of scope for v1** (document this in README; it's the #1 issue you'll get).

### Replay

`requestAnimationFrame` loop; each frame advances a distance budget = penSpeed × dt along the current stroke's arc length, drawing segments with round caps/joins. All state is in the engine; rendering is a pure function of (committed ink bitmap + active stroke progress) so resize/redraw is cheap: committed ink lives on a persistent offscreen bitmap, only the active stroke is redrawn per frame.

## 5. Public API

### Core (`quill-ink-core`)

```ts
interface InkSurfaceOptions {
  canvas: HTMLCanvasElement;
  font?: 'caveat' | 'dancing-script' | 'shadows-into-light' | CustomFontPack;
  fontSize?: number;              // default 28
  inkColor?: string;              // default '#1a2b4a' (iron gall blue-black)
  penSpeed?: number;              // px of path per second, default 900
  jitter?: number;                // 0..1, default 0.5
  paper?: 'none' | 'grain' | 'ruled';
  seed?: number;
  onPageFull?: 'scroll' | 'page-turn';
}

class InkSurface {
  constructor(opts: InkSurfaceOptions);
  write(text: string | AsyncIterable<string>): WriteHandle; // queues; returns handle with .done: Promise, .skip(), .cancel()
  clear(mode?: 'instant' | 'dissolve'): Promise<void>;
  // Capture path
  enableCapture(opts?: { commitAfterMs?: number; nib?: NibStyle }): void;
  commitCapture(): Promise<CaptureResult>;   // triggers drink-the-ink animation
  onCapture(cb: (r: CaptureResult) => void): Unsubscribe;
  exportPNG(scale?: number): Promise<Blob>;
  destroy(): void;
}

interface CaptureResult {
  png: Blob;                      // white bg, 2x scale
  strokes: Array<Array<[x: number, y: number, t: number]>>;
  bounds: DOMRect;
}
```

### Angular (`ngx-quill-ink`)

```ts
// Component
<quill-ink
  [text]="answer()"               // signal<string> — writes the DELTA when it grows (streaming-friendly)
  [stream]="tokenStream"          // OR an AsyncIterable/Observable<string>
  [options]="{ font: 'caveat', penSpeed: 1100 }"
  [captureMode]="true"
  (inkCommitted)="onInk($event)"  // CaptureResult
  (writeDone)="..."
/>

// Provider for global defaults
provideQuillInk({ font: 'caveat', inkColor: '#1a2b4a' })
```

Signals-first: `[text]` bound to a signal must animate only the appended suffix on change (diff by common prefix). This makes it trivially compatible with `resource()`/streaming HTTP in Angular.

## 6. Performance & quality budgets (acceptance criteria)

- 60fps replay on a 2020 mid-range Android phone with ≤ 3 concurrent glyph animations.
- First ink on screen < 150ms after first token (using precomputed font pack).
- Core bundle ≤ 18KB gzipped (excluding font packs); Angular wrapper ≤ 6KB.
- Zero main-thread thinning when a font pack covers the glyph.
- Works under zoneless Angular; no `NgZone` dependency.
- SSR-safe (no-ops on server, hydrates cleanly).

## 7. Demo site (apps/quill-ink-demo)

Sections: (1) hero — type in a textarea, watch it handwritten live; (2) streaming demo — hooked to Gemini Flash via a tiny proxy, ask a question, answer flows as ink; (3) capture demo — write by hand, page drinks it, shows exported PNG; (4) playground — all options as controls; (5) docs.

## 8. Content plan

- Flagship video: "I rebuilt Tom Riddle's diary — in the browser" (build montage + deep dive on Zhang-Suen).
- Shorts: thinning algorithm visualized; "why streaming AI should write, not type"; nib pressure in 30 lines of code.
- Written tutorial on codewithahsan.dev; conference lightning talk: "Latency is a UX material."

## 9. Out of scope v1 (state in README)

RTL/CJK, ligature-aware ductus, pressure from real stylus (capture stores timestamps; pressure in v2 via PointerEvent.pressure), React/Vue wrappers (issue templates ready).

## 10. Risks

- Thinning artifacts on thin fonts → mitigate with 4× raster + morphological close before thinning.
- Font licensing → OFL fonts only; verify each before bundling skeleton packs.
- Angular API churn → wrapper depends only on stable signals API.
