# @codewithahsan/ngx-quill-ink

Angular wrapper for [quill-ink](https://www.npmjs.com/package/@codewithahsan/quill-ink-core): **streaming text as animated handwriting**, signals-first, zoneless-ready, SSR-safe.

## Install

```bash
npm i @codewithahsan/ngx-quill-ink @codewithahsan/quill-ink-core @codewithahsan/quill-ink-fonts
```

## Setup

```ts
import { provideQuillInk } from '@codewithahsan/ngx-quill-ink';
import { caveat } from '@codewithahsan/quill-ink-fonts/caveat';

export const appConfig: ApplicationConfig = {
  providers: [
    provideQuillInk({ font: 'caveat', inkColor: '#1a2b4a', packs: [caveat] }),
  ],
};
```

## Use

```html
<!-- signal text: growing values animate only the appended suffix -->
<quill-ink [text]="answer()" [options]="{ penSpeed: 1100 }" (writeDone)="onDone()" />

<!-- or feed a token stream (AsyncIterable or Observable of string) -->
<quill-ink [stream]="tokenStream" />

<!-- capture handwriting for a vision LLM -->
<quill-ink [captureMode]="true" (inkCommitted)="onInk($event)" />
```

`[text]` diffs by common prefix: perfect for `resource()`/streaming HTTP —
each signal update writes only the new suffix. A shrink or mid-string edit
triggers a clean rewrite.

- **Zoneless**: no NgZone dependency anywhere.
- **SSR**: the surface initializes in `afterNextRender`; server renders a
  plain `<canvas>` and hydrates cleanly.
- `[text]` and `[stream]` are mutually exclusive (dev-mode error).

## Out of scope for v1

RTL and CJK scripts, stylus pressure (v2), React/Vue wrappers (core is
framework-free — contributions welcome).

## License

MIT
