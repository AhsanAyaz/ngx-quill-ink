import { Component, signal } from '@angular/core';
import { QuillInkComponent } from '@codewithahsan/ngx-quill-ink';

const CANNED_ANSWERS = [
  'Great question. Latency is not a bug to hide — it is a material to design with. When tokens arrive as ink, the wait becomes part of the story.',
  'Once upon a time, every AI answer appeared in a grey chat bubble. Then one day, a page learned to write for itself — and nobody wanted bubbles again.',
  'Streaming text is a rhythm: words arrive, pause at commas, breathe at full stops. Handwriting makes that rhythm visible, human, and a little magical.',
];

/** Fake LLM: emits word-ish tokens with realistic jitter. */
async function* mockTokens(answer: string): AsyncIterable<string> {
  const words = answer.split(' ');
  for (let i = 0; i < words.length; i++) {
    yield (i ? ' ' : '') + words[i];
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 140));
  }
}

@Component({
  selector: 'app-streaming',
  imports: [QuillInkComponent],
  template: `
    <section class="section" id="streaming">
      <h2>Streaming demo</h2>
      <p class="hint">
        Tokens from a (mock) LLM flow straight onto the page. Fast bursts make
        the pen hurry; a starved stream just makes it rest — no spinner, ever.
      </p>
      <div class="paper-frame">
        <quill-ink
          [stream]="stream()"
          [options]="{ font: 'dancing-script', fontSize: 30, paper: 'none', penSpeed: 1100 }"
          (writeDone)="busy.set(false)"
          class="ink"
          style="height: 260px"
        />
      </div>
      <div class="row">
        <button (click)="ask()" [disabled]="busy()">
          {{ busy() ? 'The quill is writing…' : 'Ask the mock model ✨' }}
        </button>
      </div>
    </section>
  `,
  styleUrl: './sections.scss',
})
export class Streaming {
  stream = signal<AsyncIterable<string> | undefined>(undefined);
  busy = signal(false);
  private turn = 0;

  ask(): void {
    this.busy.set(true);
    this.stream.set(mockTokens(CANNED_ANSWERS[this.turn++ % CANNED_ANSWERS.length]));
  }
}
