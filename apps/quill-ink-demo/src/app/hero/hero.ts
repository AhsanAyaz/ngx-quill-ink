import { Component, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuillInkComponent } from '@codewithahsan/ngx-quill-ink';

@Component({
  selector: 'app-hero',
  imports: [FormsModule, QuillInkComponent],
  template: `
    <section class="hero" id="hero">
      <h1>ngx-quill-ink</h1>
      <p class="tagline">Streaming AI shouldn't type. It should <em>write</em>.</p>
      <div class="stage">
        <quill-ink
          [text]="page()"
          [options]="{ font: 'caveat', fontSize: 34, paper: 'ruled', penSpeed: 1000 }"
          class="paper"
          style="height: 340px"
        />
      </div>
      <div class="controls">
        <textarea
          [(ngModel)]="draft"
          placeholder="Type something and watch the quill write it…"
          rows="2"
          (keydown.enter)="$event.preventDefault(); writeIt()"
        ></textarea>
        <div class="buttons">
          <button (click)="writeIt()" [disabled]="!draft().trim()">Write it ✒️</button>
          <button (click)="clearPage()" class="ghost">Clear page</button>
        </div>
      </div>
    </section>
  `,
  styleUrl: './hero.scss',
})
export class Hero {
  private quill = viewChild.required(QuillInkComponent);

  /** Growing signal — the component animates only the appended suffix. */
  page = signal('Dear reader, this page writes itself…');
  draft = signal('');

  writeIt(): void {
    const text = this.draft().trim();
    if (!text) return;
    this.page.update((p) => (p ? `${p} ${text}` : text));
    this.draft.set('');
  }

  clearPage(): void {
    // clear() resets the component's written state, so the page('') update
    // below diffs to a no-op instead of a second clear.
    void this.quill().clear('dissolve');
    this.page.set('');
  }
}
