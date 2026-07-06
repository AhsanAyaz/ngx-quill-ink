import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { InkSurfaceOptions, registerFontPack, FontPack } from '@codewithahsan/quill-ink-core';

export type QuillInkDefaults = Partial<Omit<InkSurfaceOptions, 'canvas'>> & {
  /** Font packs to register up front (from @codewithahsan/quill-ink-fonts). */
  packs?: FontPack[];
};

export const QUILL_INK_DEFAULT_OPTIONS = new InjectionToken<QuillInkDefaults>(
  'QUILL_INK_DEFAULT_OPTIONS'
);

/**
 * Global defaults for every <quill-ink> surface:
 *
 * ```ts
 * provideQuillInk({ font: 'caveat', inkColor: '#1a2b4a', packs: [caveat] })
 * ```
 */
export function provideQuillInk(defaults: QuillInkDefaults): EnvironmentProviders {
  for (const pack of defaults.packs ?? []) registerFontPack(pack);
  return makeEnvironmentProviders([
    { provide: QUILL_INK_DEFAULT_OPTIONS, useValue: defaults },
  ]);
}
