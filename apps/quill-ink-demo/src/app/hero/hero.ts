import {
  Component,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
  DestroyRef,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InkSurface, registerFontPack } from '@codewithahsan/quill-ink-core';
import { caveat } from '@codewithahsan/quill-ink-fonts/caveat';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="hero">
      <h1>ngx-quill-ink</h1>
      <p class="tagline">Streaming AI shouldn't type. It should <em>write</em>.</p>
      <div class="stage">
        <canvas #canvas class="paper"></canvas>
      </div>
      <div class="controls">
        <textarea
          [(ngModel)]="draft"
          placeholder="Type something and watch the quill write it…"
          rows="2"
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
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private destroyRef = inject(DestroyRef);
  private surface?: InkSurface;

  draft = signal('The page remembers every word.');

  constructor() {
    afterNextRender(() => {
      registerFontPack(caveat);
      this.surface = new InkSurface({
        canvas: this.canvas().nativeElement,
        font: 'caveat',
        fontSize: 34,
        paper: 'ruled',
        penSpeed: 1000,
      });
      this.surface.write('Dear reader, this page writes itself…');
      this.destroyRef.onDestroy(() => this.surface?.destroy());
    });
  }

  writeIt(): void {
    const text = this.draft().trim();
    if (!text || !this.surface) return;
    this.surface.write(text);
    this.draft.set('');
  }

  clearPage(): void {
    void this.surface?.clear('dissolve');
  }
}
