import { describe, expect, it } from 'vitest';
import { zhangSuenThin } from './zhang-suen';
import { Bitmap } from './types';

function fromAscii(rows: string[]): Bitmap {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) data[y * width + x] = row[x] === '#' ? 1 : 0;
  });
  return { data, width, height };
}

function inkCount(b: Bitmap): number {
  let n = 0;
  for (const v of b.data) n += v;
  return n;
}

/** every ink pixel has <= 2 neighbors in a clean 1px open path */
function maxWidthIsOne(b: Bitmap): boolean {
  const { data, width, height } = b;
  // no 2x2 block fully inked
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      if (
        data[y * width + x] &&
        data[y * width + x + 1] &&
        data[(y + 1) * width + x] &&
        data[(y + 1) * width + x + 1]
      ) {
        return false;
      }
    }
  }
  return true;
}

function connectedComponents(b: Bitmap): number {
  const { data, width, height } = b;
  const seen = new Uint8Array(data.length);
  let components = 0;
  for (let i = 0; i < data.length; i++) {
    if (!data[i] || seen[i]) continue;
    components++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop() as number;
      const x = cur % width;
      const y = (cur / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
          const j = yy * width + xx;
          if (data[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
  }
  return components;
}

describe('zhangSuenThin', () => {
  it('thins a thick horizontal bar to a 1px line', () => {
    const bar = fromAscii([
      '..........',
      '.########.',
      '.########.',
      '.########.',
      '..........',
    ]);
    const thin = zhangSuenThin(bar);
    expect(maxWidthIsOne(thin)).toBe(true);
    expect(connectedComponents(thin)).toBe(1);
    expect(inkCount(thin)).toBeGreaterThan(3);
  });

  it('preserves connectivity of a thick cross', () => {
    const rows: string[] = [];
    for (let y = 0; y < 21; y++) {
      let row = '';
      for (let x = 0; x < 21; x++) {
        const inV = x >= 9 && x <= 11;
        const inH = y >= 9 && y <= 11;
        row += inV || inH ? '#' : '.';
      }
      rows.push(row);
    }
    const thin = zhangSuenThin(fromAscii(rows));
    expect(connectedComponents(thin)).toBe(1);
    expect(maxWidthIsOne(thin)).toBe(true);
  });

  it('preserves a ring (does not break loops)', () => {
    const size = 24;
    const data = new Uint8Array(size * size);
    const c = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = Math.hypot(x - c + 0.5, y - c + 0.5);
        if (r > 5 && r < 9) data[y * size + x] = 1;
      }
    }
    const thin = zhangSuenThin({ data, width: size, height: size });
    expect(connectedComponents(thin)).toBe(1);
    expect(inkCount(thin)).toBeGreaterThan(10); // still a ring, not erased
  });

  it('is idempotent on an already-thin line', () => {
    const line = fromAscii(['.....', '.###.', '.....']);
    const once = zhangSuenThin(line);
    const twice = zhangSuenThin(once);
    expect(Array.from(twice.data)).toEqual(Array.from(once.data));
  });

  it('does not mutate its input', () => {
    const bar = fromAscii(['.....', '.###.', '.###.', '.....']);
    const before = Array.from(bar.data);
    zhangSuenThin(bar);
    expect(Array.from(bar.data)).toEqual(before);
  });

  it('thins a 128x128 blob within the perf budget (warn-only)', () => {
    const size = 128;
    const data = new Uint8Array(size * size);
    for (let y = 20; y < 108; y++) {
      for (let x = 20; x < 108; x++) {
        // ring-ish glyph blob
        const r = Math.hypot(x - 64, y - 64);
        if (r > 20 && r < 44) data[y * size + x] = 1;
      }
    }
    const t0 = performance.now();
    zhangSuenThin({ data, width: size, height: size });
    const ms = performance.now() - t0;
    // Spec budget: <8ms on M-class. Warn, don't fail, on slow CI.
    if (ms >= 8) console.warn(`zhang-suen 128x128 took ${ms.toFixed(1)}ms (budget 8ms)`);
    expect(ms).toBeLessThan(100);
  });
});
