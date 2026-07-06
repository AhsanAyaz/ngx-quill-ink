import { mulberry32 } from './rng';

/**
 * 1D value noise with cosine interpolation. Low-frequency, smooth, seeded.
 * Drives pen pressure, baseline wobble and lightness jitter.
 */
export interface Noise1D {
  /** Sample noise at t; returns value in [-1, 1]. */
  (t: number): number;
}

export function valueNoise1D(seed: number): Noise1D {
  const rng = mulberry32(seed);
  const gradients = new Map<number, number>();
  const lattice = (i: number): number => {
    let v = gradients.get(i);
    if (v === undefined) {
      // deterministic per lattice index regardless of query order
      v = mulberry32(seed ^ Math.imul(i | 0, 0x9e3779b9))() * 2 - 1;
      gradients.set(i, v);
    }
    return v;
  };
  void rng;
  return (t: number) => {
    const i = Math.floor(t);
    const f = t - i;
    const a = lattice(i);
    const b = lattice(i + 1);
    const u = (1 - Math.cos(f * Math.PI)) / 2; // cosine smoothing
    return a * (1 - u) + b * u;
  };
}

/** Pen pressure multiplier along a path: 0.75x–1.25x of base width. */
export function pressureAt(noise: Noise1D, distance: number, jitter: number): number {
  // low frequency: one undulation per ~40px of path
  const n = noise(distance / 40);
  return 1 + n * 0.25 * jitter;
}

/** Baseline wobble in px, bounded ±1.5px at jitter=1. */
export function baselineWobble(noise: Noise1D, x: number, jitter: number): number {
  return noise(x / 90) * 1.5 * jitter;
}

/** Glyph rotation jitter in radians, bounded ±1.5° at jitter=1. */
export function rotationJitter(noise: Noise1D, index: number, jitter: number): number {
  return noise(index * 7.13) * ((1.5 * Math.PI) / 180) * jitter;
}

/** Per-glyph ink lightness jitter, ±4% at jitter=1. */
export function lightnessJitter(noise: Noise1D, index: number, jitter: number): number {
  return noise(index * 3.77 + 100) * 0.04 * jitter;
}
