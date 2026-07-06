import { describe, expect, it } from 'vitest';
import { LayoutEngine } from './layout-engine';
import { FontPack } from '../fonts/font-pack';

/** Fake pack: every glyph advances 100 units (10px at fontSize 100/em 1000). */
function fakePack(): FontPack {
  const glyphs: FontPack['glyphs'] = { ' ': { advance: 100, strokes: [] } };
  for (let c = 33; c < 127; c++) {
    glyphs[String.fromCharCode(c)] = { advance: 100, strokes: [[0, 0, 50, -50]] };
  }
  return { version: 1, id: 'fake', name: 'Fake', unitsPerEm: 1000, ascent: 800, descent: 200, glyphs };
}

describe('LayoutEngine', () => {
  // fontSize 10 → scale 0.01 → each glyph 1px wide... use fontSize 100: 10px/glyph
  const make = (maxWidth = 100) => new LayoutEngine(fakePack(), 100, maxWidth, 0);

  it('measures word width from advances', () => {
    const layout = make();
    expect(layout.measure('abc').width).toBeCloseTo(30);
    expect(layout.measure('abc').glyphOffsets).toEqual([0, 10, 20]);
  });

  it('places words left to right with a space between', () => {
    const layout = make(1000);
    const a = layout.place(layout.measure('ab'), 0, 1000);
    const b = layout.place(layout.measure('cd'), 0, 1000);
    expect(a.x).toBe(0);
    // 20px word + 10px space
    expect(b.x).toBeCloseTo(30);
    expect(b.baselineY).toBe(a.baselineY);
  });

  it('wraps when a word exceeds max width', () => {
    const layout = make(100);
    layout.place(layout.measure('abcdef'), 0, 1000); // 60px
    const second = layout.place(layout.measure('ghijk'), 0, 1000); // would end at 70+50=120 > 100
    expect(second.x).toBe(0);
    expect(second.baselineY).toBeCloseTo(100 + 160); // fontSize + lineHeight(1.6em)
  });

  it('honors explicit newlines', () => {
    const layout = make(1000);
    const a = layout.place(layout.measure('a'), 0, 1000);
    const b = layout.place(layout.measure('b'), 2, 1000);
    expect(b.x).toBe(0);
    expect(b.baselineY).toBeCloseTo(a.baselineY + 2 * 160);
  });

  it('reports page overflow', () => {
    const layout = make(1000);
    const p = layout.place(layout.measure('a'), 5, 500);
    expect(p.overflowsPage).toBe(true);
  });

  it('applies kerning when present', () => {
    const pack = fakePack();
    pack.kerning = { ab: -20 };
    const layout = new LayoutEngine(pack, 100, 1000, 0);
    expect(layout.measure('ab').width).toBeCloseTo(18); // 10 + 10 - 2
  });
});
