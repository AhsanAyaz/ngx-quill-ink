import { describe, expect, it } from 'vitest';
import { Tokenizer } from './tokenizer';
import { PAUSE_COMMA_MS, PAUSE_SENTENCE_MS } from '../surface/surface-options';

describe('Tokenizer', () => {
  it('splits complete words, keeps trailing partial in buffer', () => {
    const t = new Tokenizer();
    const first = t.push('hello wor');
    expect(first.map((w) => w.text)).toEqual(['hello']);
    const second = t.push('ld done ');
    expect(second.map((w) => w.text)).toEqual(['world', 'done']);
  });

  it('flush drains the tail word', () => {
    const t = new Tokenizer();
    t.push('final');
    expect(t.flush().map((w) => w.text)).toEqual(['final']);
    expect(t.flush()).toEqual([]);
  });

  it('tracks newlines before a word', () => {
    const t = new Tokenizer();
    const tokens = [...t.push('a\n\nb '), ...t.flush()];
    expect(tokens[0].newlinesBefore).toBe(0);
    expect(tokens[1].newlinesBefore).toBe(2);
  });

  it('assigns punctuation pauses per spec', () => {
    const t = new Tokenizer();
    const tokens = t.push('wait. sure, ok! why? plain ');
    const pauses = Object.fromEntries(tokens.map((w) => [w.text, w.pauseAfterMs]));
    expect(pauses['wait.']).toBe(PAUSE_SENTENCE_MS);
    expect(pauses['sure,']).toBe(PAUSE_COMMA_MS);
    expect(pauses['ok!']).toBe(PAUSE_SENTENCE_MS);
    expect(pauses['why?']).toBe(PAUSE_SENTENCE_MS);
    expect(pauses['plain']).toBe(0);
  });

  it('streams token fragments across pushes', () => {
    const t = new Tokenizer();
    const out = [
      ...t.push('str'),
      ...t.push('eam'),
      ...t.push('ing to'),
      ...t.push('kens '),
      ...t.flush(),
    ];
    expect(out.map((w) => w.text)).toEqual(['streaming', 'tokens']);
  });
});
