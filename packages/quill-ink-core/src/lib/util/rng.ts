/**
 * Deterministic seeded PRNG (mulberry32). Used everywhere randomness is
 * needed so re-renders with the same seed are pixel-stable.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash — combines a word with a numeric seed. */
export function hashString(str: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Convenience: rng derived from (word, seed) — deterministic per pair. */
export function wordRng(word: string, seed: number): Rng {
  return mulberry32(hashString(word, seed));
}
