/**
 * Structural stream types — accepts rxjs Observables without importing
 * rxjs (the wrapper stays dependency-free beyond Angular + core).
 */
export interface Subscribable<T> {
  subscribe(observer: {
    next: (value: T) => void;
    error?: (err: unknown) => void;
    complete?: () => void;
  }): { unsubscribe(): void };
}

export type TokenStream = AsyncIterable<string> | Subscribable<string>;

export function isAsyncIterable(v: unknown): v is AsyncIterable<string> {
  return !!v && typeof (v as AsyncIterable<string>)[Symbol.asyncIterator] === 'function';
}

export function isSubscribable(v: unknown): v is Subscribable<string> {
  return !!v && typeof (v as Subscribable<string>).subscribe === 'function';
}

/**
 * Normalize any supported stream to an AsyncIterable. The abort signal
 * detaches the underlying subscription when the consumer stops.
 */
export function toAsyncIterable(stream: TokenStream, signal?: AbortSignal): AsyncIterable<string> {
  if (isAsyncIterable(stream)) return abortable(stream, signal);
  if (!isSubscribable(stream)) {
    throw new Error('quill-ink: [stream] must be an AsyncIterable or Observable-like of string');
  }
  return {
    [Symbol.asyncIterator]() {
      const queue: string[] = [];
      let resolveNext: ((r: IteratorResult<string>) => void) | null = null;
      let done = false;
      let error: unknown = null;

      const flush = (): void => {
        if (!resolveNext) return;
        if (queue.length) {
          const r = resolveNext;
          resolveNext = null;
          r({ value: queue.shift() as string, done: false });
        } else if (done || error) {
          const r = resolveNext;
          resolveNext = null;
          if (error) throw error;
          r({ value: undefined, done: true });
        }
      };

      const sub = stream.subscribe({
        next: (v) => {
          queue.push(v);
          flush();
        },
        error: (e) => {
          error = e;
          done = true;
          flush();
        },
        complete: () => {
          done = true;
          flush();
        },
      });
      signal?.addEventListener('abort', () => {
        done = true;
        sub.unsubscribe();
        flush();
      });

      return {
        next(): Promise<IteratorResult<string>> {
          if (queue.length) return Promise.resolve({ value: queue.shift() as string, done: false });
          if (error) return Promise.reject(error);
          if (done) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        },
        return(): Promise<IteratorResult<string>> {
          done = true;
          sub.unsubscribe();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

async function* abortable(src: AsyncIterable<string>, signal?: AbortSignal): AsyncIterable<string> {
  for await (const chunk of src) {
    if (signal?.aborted) return;
    yield chunk;
  }
}
