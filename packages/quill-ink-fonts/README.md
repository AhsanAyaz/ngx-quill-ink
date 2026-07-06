# @codewithahsan/quill-ink-fonts

Precomputed **glyph skeleton packs** for [quill-ink](https://www.npmjs.com/package/@codewithahsan/quill-ink-core): centerline stroke paths for three OFL-licensed handwriting fonts, so the first ink hits the page in under 150ms — no runtime thinning, no main-thread work.

| Pack | Import | Size (gz) |
| --- | --- | --- |
| Caveat | `@codewithahsan/quill-ink-fonts/caveat` | ~62 KB |
| Dancing Script | `@codewithahsan/quill-ink-fonts/dancing-script` | ~85 KB |
| Shadows Into Light | `@codewithahsan/quill-ink-fonts/shadows-into-light` | ~63 KB |

Import per font (tree-shaken — you only ship what you use):

```ts
import { registerFontPack } from '@codewithahsan/quill-ink-core';
import { caveat } from '@codewithahsan/quill-ink-fonts/caveat';

registerFontPack(caveat);
```

Each pack covers printable ASCII + Latin-1 supplement + common typographic
punctuation (~200 glyphs), normalized to a 1000-unit em, with pair kerning.
Uncovered glyphs fall back to quill-ink-core's runtime thinning pipeline.

## Licensing

The packs are derived from fonts licensed under the SIL Open Font License:

- [Caveat](https://fonts.google.com/specimen/Caveat) © Impallari Type
- [Dancing Script](https://fonts.google.com/specimen/Dancing+Script) © Impallari Type
- [Shadows Into Light](https://fonts.google.com/specimen/Shadows+Into+Light) © Kimberly Geswein

Each pack ships with its OFL text (`packs/<id>-OFL.txt`). The package code is MIT.
