/**
 * Length of the common prefix of two strings. Streaming-friendly `[text]`
 * updates append to the previous value, so the wrapper animates only the
 * suffix; a shrink or mismatch means a rewrite (clear + write everything).
 */
export function commonPrefixLen(prev: string, next: string): number {
  const max = Math.min(prev.length, next.length);
  let i = 0;
  while (i < max && prev.charCodeAt(i) === next.charCodeAt(i)) i++;
  return i;
}

export type TextDiff =
  | { kind: 'noop' }
  | { kind: 'append'; suffix: string }
  | { kind: 'rewrite'; text: string };

export function diffText(prev: string, next: string): TextDiff {
  if (prev === next) return { kind: 'noop' };
  const p = commonPrefixLen(prev, next);
  if (p === prev.length) return { kind: 'append', suffix: next.slice(p) };
  return { kind: 'rewrite', text: next };
}
