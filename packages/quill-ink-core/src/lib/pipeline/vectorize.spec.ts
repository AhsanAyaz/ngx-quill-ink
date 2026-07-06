import { describe, expect, it } from 'vitest';
import { vectorize } from './vectorize';
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

describe('vectorize', () => {
  it('traces a straight line as one stroke end to end', () => {
    const strokes = vectorize(fromAscii(['.......', '.#####.', '.......']));
    expect(strokes).toHaveLength(1);
    const s = strokes[0];
    expect(s[0]).toEqual({ x: 1, y: 1 });
    expect(s[s.length - 1]).toEqual({ x: 5, y: 1 });
  });

  it('continues straight through a + junction (min turning angle)', () => {
    const strokes = vectorize(
      fromAscii([
        '...#...',
        '...#...',
        '...#...',
        '#######',
        '...#...',
        '...#...',
        '...#...',
      ])
    );
    // a cross should decompose into 2 straight strokes, not 4 half-strokes
    expect(strokes).toHaveLength(2);
    for (const s of strokes) {
      const first = s[0];
      const last = s[s.length - 1];
      const straightH = first.y === last.y && Math.abs(last.x - first.x) === 6;
      const straightV = first.x === last.x && Math.abs(last.y - first.y) === 6;
      expect(straightH || straightV).toBe(true);
    }
  });

  it('continues through an x crossing keeping diagonals together', () => {
    const strokes = vectorize(
      fromAscii([
        '#.....#',
        '.#...#.',
        '..#.#..',
        '...#...',
        '..#.#..',
        '.#...#.',
        '#.....#',
      ])
    );
    expect(strokes).toHaveLength(2);
    for (const s of strokes) {
      const first = s[0];
      const last = s[s.length - 1];
      // each stroke spans corner to opposite corner
      expect(Math.abs(last.x - first.x)).toBe(6);
      expect(Math.abs(last.y - first.y)).toBe(6);
    }
  });

  it('traces a closed loop as a single stroke', () => {
    const strokes = vectorize(
      fromAscii(['.####.', '.#..#.', '.#..#.', '.####.'])
    );
    expect(strokes).toHaveLength(1);
    const s = strokes[0];
    // closed: returns to (or adjacent to) its start
    const first = s[0];
    const last = s[s.length - 1];
    expect(Math.abs(first.x - last.x) <= 1 && Math.abs(first.y - last.y) <= 1).toBe(true);
    expect(s.length).toBeGreaterThanOrEqual(10);
  });

  it('emits isolated pixels as dot strokes', () => {
    const strokes = vectorize(fromAscii(['...', '.#.', '...']));
    expect(strokes).toHaveLength(1);
    expect(strokes[0][0]).toEqual({ x: 1, y: 1 });
  });

  it('returns nothing for an empty bitmap', () => {
    expect(vectorize(fromAscii(['...', '...']))).toHaveLength(0);
  });
});
