export { QuillInkComponent } from './lib/quill-ink.component';
export { provideQuillInk, QUILL_INK_DEFAULT_OPTIONS } from './lib/provide-quill-ink';
export type { QuillInkDefaults } from './lib/provide-quill-ink';
export { commonPrefixLen, diffText } from './lib/prefix-diff';
export type { TextDiff } from './lib/prefix-diff';
export { toAsyncIterable } from './lib/stream-adapter';
export type { TokenStream, Subscribable } from './lib/stream-adapter';
export type {
  CaptureResult,
  InkSurfaceOptions,
  NibStyle,
  WriteHandle,
  FontPack,
  BuiltinFontId,
} from '@codewithahsan/quill-ink-core';
