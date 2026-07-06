import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  effect,
  inject,
  input,
  isDevMode,
  output,
  viewChild,
} from '@angular/core';
import {
  CaptureResult,
  InkSurface,
  InkSurfaceOptions,
  NibStyle,
  WriteHandle,
} from '@codewithahsan/quill-ink-core';
import { QUILL_INK_DEFAULT_OPTIONS } from './provide-quill-ink';
import { diffText } from './prefix-diff';
import { TokenStream, toAsyncIterable } from './stream-adapter';

/**
 * Streaming text as animated handwriting.
 *
 * ```html
 * <quill-ink [text]="answer()" [options]="{ font: 'caveat' }" (writeDone)="..." />
 * <quill-ink [stream]="tokenStream" />
 * <quill-ink [captureMode]="true" (inkCommitted)="onInk($event)" />
 * ```
 *
 * `[text]` bound to a growing signal animates only the appended suffix
 * (common-prefix diff) — drop-in for resource()/streaming HTTP. SSR-safe:
 * the surface initializes after first render, no-ops on the server.
 * Zoneless-compatible: no NgZone dependency.
 */
@Component({
  selector: 'quill-ink',
  standalone: true,
  template: `<canvas #canvas class="quill-ink-canvas"></canvas>`,
  styles: `
    :host {
      display: block;
    }
    .quill-ink-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuillInkComponent {
  /** Full text; growing values animate only the appended suffix. */
  readonly text = input<string | undefined>(undefined);
  /** Token stream (AsyncIterable or Observable-like). Mutually exclusive with [text]. */
  readonly stream = input<TokenStream | undefined>(undefined);
  readonly options = input<Partial<Omit<InkSurfaceOptions, 'canvas'>>>({});
  readonly captureMode = input(false, { transform: booleanAttribute });
  readonly captureOptions = input<{ commitAfterMs?: number; nib?: NibStyle } | undefined>(undefined);

  readonly inkCommitted = output<CaptureResult>();
  readonly writeDone = output<void>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly defaults = inject(QUILL_INK_DEFAULT_OPTIONS, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  private surface?: InkSurface;
  private written = '';
  private lastHandle: WriteHandle | null = null;
  private streamAbort: AbortController | null = null;
  private streamHandle: WriteHandle | null = null;

  constructor() {
    afterNextRender(() => this.init());

    effect(() => {
      const text = this.text();
      if (isDevMode() && text !== undefined && this.stream() !== undefined) {
        throw new Error('quill-ink: [text] and [stream] are mutually exclusive — bind one.');
      }
      if (text === undefined || !this.surface) return;
      this.applyText(text);
    });

    effect(() => {
      const stream = this.stream();
      if (!this.surface) return;
      this.applyStream(stream);
    });

    effect(() => {
      const capture = this.captureMode();
      if (!this.surface) return;
      if (capture) this.surface.enableCapture(this.captureOptions());
      else this.surface.disableCapture();
    });

    this.destroyRef.onDestroy(() => {
      this.streamAbort?.abort();
      this.surface?.destroy();
    });
  }

  /** The underlying engine surface (undefined until first render / on server). */
  get inkSurface(): InkSurface | undefined {
    return this.surface;
  }

  /** Commit the current capture explicitly (also fires on idle timeout). */
  async commitCapture(): Promise<CaptureResult> {
    if (!this.surface) throw new Error('quill-ink: surface not ready');
    return this.surface.commitCapture();
  }

  /** Clear the page. */
  clear(mode: 'instant' | 'dissolve' = 'instant'): Promise<void> {
    this.written = '';
    return this.surface?.clear(mode) ?? Promise.resolve();
  }

  private init(): void {
    const { packs, ...defaultOpts } = this.defaults ?? {};
    void packs; // registered by provideQuillInk at provider setup
    this.surface = new InkSurface({
      canvas: this.canvasRef().nativeElement,
      ...defaultOpts,
      ...this.options(),
    });
    this.surface.onCapture((r) => this.inkCommitted.emit(r));

    // replay state that arrived before the surface existed
    const text = this.text();
    if (text !== undefined) this.applyText(text);
    const stream = this.stream();
    if (stream) this.applyStream(stream);
    if (this.captureMode()) this.surface.enableCapture(this.captureOptions());
  }

  private applyText(text: string): void {
    const surface = this.surface as InkSurface;
    const diff = diffText(this.written, text);
    this.written = text;
    if (diff.kind === 'noop') return;
    if (diff.kind === 'append') {
      this.lastHandle = surface.write(diff.suffix);
    } else {
      this.lastHandle?.cancel();
      void surface.clear('instant').then(() => {
        this.lastHandle = surface.write(diff.text);
        this.trackDone(this.lastHandle);
      });
      return;
    }
    this.trackDone(this.lastHandle);
  }

  private applyStream(stream: TokenStream | undefined): void {
    const surface = this.surface as InkSurface;
    this.streamAbort?.abort();
    this.streamHandle?.cancel();
    this.streamAbort = null;
    this.streamHandle = null;
    if (!stream) return;
    this.streamAbort = new AbortController();
    this.streamHandle = surface.write(toAsyncIterable(stream, this.streamAbort.signal));
    this.trackDone(this.streamHandle);
  }

  private trackDone(handle: WriteHandle | null): void {
    if (!handle) return;
    void handle.done.then(() => {
      // emit only when this handle is still the latest write
      if (handle === this.lastHandle || handle === this.streamHandle) {
        this.writeDone.emit();
      }
    });
  }
}
