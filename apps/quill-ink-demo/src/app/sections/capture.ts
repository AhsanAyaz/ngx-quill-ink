import { Component, signal } from '@angular/core';
import { CaptureResult, QuillInkComponent } from '@codewithahsan/ngx-quill-ink';

@Component({
  selector: 'app-capture',
  imports: [QuillInkComponent],
  template: `
    <section class="section" id="capture">
      <h2>Capture demo</h2>
      <p class="hint">
        Write by hand (mouse, finger or stylus). Stop for ~3 seconds and
        <em>the page drinks your ink</em> — you get a clean PNG plus raw
        strokes, ready for a vision model.
      </p>
      <div class="paper-frame capture-frame">
        <quill-ink
          [captureMode]="true"
          [options]="{ paper: 'grain' }"
          (inkCommitted)="onInk($event)"
          class="ink"
          style="height: 280px; touch-action: none"
        />
      </div>
      @if (lastCapture(); as cap) {
        <div class="capture-result">
          <img [src]="cap.url" alt="captured handwriting" />
          <div class="meta">
            <div>{{ cap.strokes }} stroke{{ cap.strokes === 1 ? '' : 's' }} captured</div>
            <div>{{ cap.kb }} KB PNG · white background baked · 2× scale</div>
            <a [href]="cap.url" download="quill-ink-capture.png">Download PNG</a>
          </div>
        </div>
      } @else {
        <p class="placeholder">Your absorbed ink will reappear here as a PNG.</p>
      }
    </section>
  `,
  styleUrl: './sections.scss',
})
export class Capture {
  lastCapture = signal<{ url: string; strokes: number; kb: number } | null>(null);

  onInk(result: CaptureResult): void {
    const prev = this.lastCapture();
    if (prev) URL.revokeObjectURL(prev.url);
    this.lastCapture.set({
      url: URL.createObjectURL(result.png),
      strokes: result.strokes.length,
      kb: Math.max(1, Math.round(result.png.size / 1024)),
    });
  }
}
