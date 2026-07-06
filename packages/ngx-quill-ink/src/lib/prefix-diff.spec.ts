import { commonPrefixLen, diffText } from './prefix-diff';

describe('commonPrefixLen', () => {
  it('measures shared prefixes', () => {
    expect(commonPrefixLen('hello', 'hello world')).toBe(5);
    expect(commonPrefixLen('', 'abc')).toBe(0);
    expect(commonPrefixLen('abc', 'abd')).toBe(2);
    expect(commonPrefixLen('same', 'same')).toBe(4);
  });
});

describe('diffText', () => {
  it('detects appends (streaming fast path)', () => {
    expect(diffText('The pen', 'The pen writes')).toEqual({
      kind: 'append',
      suffix: ' writes',
    });
  });

  it('detects no-op', () => {
    expect(diffText('x', 'x')).toEqual({ kind: 'noop' });
  });

  it('detects shrink as rewrite', () => {
    expect(diffText('longer text', 'long')).toEqual({ kind: 'rewrite', text: 'long' });
  });

  it('detects mid-string edits as rewrite', () => {
    expect(diffText('The cat sat', 'The dog sat')).toEqual({
      kind: 'rewrite',
      text: 'The dog sat',
    });
  });

  it('initial text from empty is an append', () => {
    expect(diffText('', 'Hi')).toEqual({ kind: 'append', suffix: 'Hi' });
  });
});
