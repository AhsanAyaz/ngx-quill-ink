import { toAsyncIterable, Subscribable } from './stream-adapter';

/** Minimal Subject-like double (no rxjs import). */
function subject<T>() {
  const observers: Array<{ next: (v: T) => void; complete?: () => void; error?: (e: unknown) => void }> = [];
  const stream: Subscribable<T> = {
    subscribe(obs) {
      observers.push(obs);
      return {
        unsubscribe: () => {
          const i = observers.indexOf(obs);
          if (i >= 0) observers.splice(i, 1);
        },
      };
    },
  };
  return {
    stream,
    next: (v: T) => observers.slice().forEach((o) => o.next(v)),
    complete: () => observers.slice().forEach((o) => o.complete?.()),
    get observerCount() {
      return observers.length;
    },
  };
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe('toAsyncIterable', () => {
  it('passes AsyncIterables through', async () => {
    async function* gen() {
      yield 'a';
      yield 'b';
    }
    expect(await collect(toAsyncIterable(gen()))).toEqual(['a', 'b']);
  });

  it('adapts Observable-likes, buffering synchronous emissions', async () => {
    const s = subject<string>();
    const iterPromise = collect(toAsyncIterable(s.stream));
    s.next('tok1');
    s.next('tok2');
    s.complete();
    expect(await iterPromise).toEqual(['tok1', 'tok2']);
  });

  it('handles emissions arriving while awaiting', async () => {
    const s = subject<string>();
    const iterPromise = collect(toAsyncIterable(s.stream));
    await Promise.resolve();
    s.next('late');
    await Promise.resolve();
    s.complete();
    expect(await iterPromise).toEqual(['late']);
  });

  it('abort unsubscribes from the source', async () => {
    const s = subject<string>();
    const ctrl = new AbortController();
    const iter = toAsyncIterable(s.stream, ctrl.signal)[Symbol.asyncIterator]();
    const first = iter.next();
    s.next('a');
    expect((await first).value).toBe('a');
    expect(s.observerCount).toBe(1);
    ctrl.abort();
    expect(s.observerCount).toBe(0);
    const end = await iter.next();
    expect(end.done).toBe(true);
  });

  it('rejects non-streams', () => {
    expect(() => toAsyncIterable(42 as never)).toThrow(/AsyncIterable or Observable/);
  });
});
