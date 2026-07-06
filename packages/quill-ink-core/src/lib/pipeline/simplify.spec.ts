import { describe, expect, it } from 'vitest';
import { rdpSimplify, catmullRomSmooth } from './simplify';
import { Stroke } from './types';

describe('rdpSimplify', () => {
  it('collapses a noisy near-straight line to its endpoints', () => {
    const stroke: Stroke = [];
    for (let x = 0; x <= 20; x++) {
      stroke.push({ x, y: (x % 2) * 0.4 }); // ±0.4px zigzag, below ε=0.75
    }
    const simplified = rdpSimplify(stroke, 0.75);
    expect(simplified).toHaveLength(2);
    expect(simplified[0]).toEqual(stroke[0]);
    expect(simplified[1]).toEqual(stroke[stroke.length - 1]);
  });

  it('keeps a significant corner', () => {
    const stroke: Stroke = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 10 },
    ];
    const simplified = rdpSimplify(stroke, 0.75);
    expect(simplified).toHaveLength(3);
  });

  it('passes short strokes through unchanged', () => {
    const s: Stroke = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(rdpSimplify(s)).toEqual(s);
  });
});

describe('catmullRomSmooth', () => {
  it('passes through all control points', () => {
    const control: Stroke = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
      { x: 30, y: -5 },
    ];
    const smooth = catmullRomSmooth(control, 4);
    for (const c of control) {
      expect(smooth.some((p) => Math.abs(p.x - c.x) < 1e-9 && Math.abs(p.y - c.y) < 1e-9)).toBe(true);
    }
  });

  it('inserts interpolated points between spans', () => {
    const control: Stroke = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    const smooth = catmullRomSmooth(control, 4);
    expect(smooth.length).toBeGreaterThan(control.length);
  });
});
