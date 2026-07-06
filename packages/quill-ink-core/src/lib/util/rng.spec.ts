import { describe, expect, it } from 'vitest';
import { mulberry32, hashString, wordRng } from './rng';
import { valueNoise1D, baselineWobble, pressureAt, rotationJitter, lightnessJitter } from './noise';

describe('mulberry32', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('produces values in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('hashString / wordRng', () => {
  it('same (word, seed) gives identical sequences', () => {
    const a = wordRng('quill', 3);
    const b = wordRng('quill', 3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('different words diverge', () => {
    expect(hashString('quill', 3)).not.toBe(hashString('ink', 3));
  });
});

describe('valueNoise1D', () => {
  it('is deterministic and order-independent', () => {
    const n1 = valueNoise1D(9);
    const n2 = valueNoise1D(9);
    const at5 = n1(5.3);
    n2(100.7); // query in different order first
    expect(n2(5.3)).toBeCloseTo(at5, 12);
  });

  it('stays within [-1, 1]', () => {
    const n = valueNoise1D(11);
    for (let t = 0; t < 50; t += 0.13) {
      const v = n(t);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it('is continuous (small dt, small dv)', () => {
    const n = valueNoise1D(5);
    for (let t = 0; t < 10; t += 0.01) {
      expect(Math.abs(n(t + 0.01) - n(t))).toBeLessThan(0.1);
    }
  });
});

describe('noise-derived theatrics stay in spec bounds', () => {
  const n = valueNoise1D(1234);

  it('pressure within 0.75x–1.25x at full jitter', () => {
    for (let d = 0; d < 2000; d += 17) {
      const p = pressureAt(n, d, 1);
      expect(p).toBeGreaterThanOrEqual(0.75);
      expect(p).toBeLessThanOrEqual(1.25);
    }
  });

  it('baseline wobble within ±1.5px at full jitter', () => {
    for (let x = 0; x < 3000; x += 23) {
      expect(Math.abs(baselineWobble(n, x, 1))).toBeLessThanOrEqual(1.5);
    }
  });

  it('rotation within ±1.5° at full jitter', () => {
    const limit = (1.5 * Math.PI) / 180;
    for (let i = 0; i < 200; i++) {
      expect(Math.abs(rotationJitter(n, i, 1))).toBeLessThanOrEqual(limit);
    }
  });

  it('lightness within ±4% at full jitter', () => {
    for (let i = 0; i < 200; i++) {
      expect(Math.abs(lightnessJitter(n, i, 1))).toBeLessThanOrEqual(0.04);
    }
  });

  it('jitter=0 disables all', () => {
    expect(pressureAt(n, 123, 0)).toBe(1);
    expect(baselineWobble(n, 123, 0)).toBeCloseTo(0, 12);
    expect(rotationJitter(n, 3, 0)).toBeCloseTo(0, 12);
    expect(lightnessJitter(n, 3, 0)).toBeCloseTo(0, 12);
  });
});
