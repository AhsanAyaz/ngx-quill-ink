import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuillInkComponent } from '@codewithahsan/ngx-quill-ink';
import type { BuiltinFontId, InkSurfaceOptions } from '@codewithahsan/ngx-quill-ink';

@Component({
  selector: 'app-playground',
  imports: [QuillInkComponent, FormsModule],
  template: `
    <section class="section" id="playground">
      <h2>Playground</h2>
      <p class="hint">Every option, live. Changing one re-inks the sample.</p>
      <div class="playground">
        <div class="knobs">
          <label>
            Font
            <select [ngModel]="font()" (ngModelChange)="font.set($event)">
              <option value="caveat">Caveat</option>
              <option value="dancing-script">Dancing Script</option>
              <option value="shadows-into-light">Shadows Into Light</option>
            </select>
          </label>
          <label>
            Font size <span>{{ fontSize() }}px</span>
            <input type="range" min="18" max="56" [ngModel]="fontSize()" (ngModelChange)="fontSize.set(+$event)" />
          </label>
          <label>
            Pen speed <span>{{ penSpeed() }} px/s</span>
            <input type="range" min="200" max="3000" step="50" [ngModel]="penSpeed()" (ngModelChange)="penSpeed.set(+$event)" />
          </label>
          <label>
            Jitter <span>{{ jitter() }}</span>
            <input type="range" min="0" max="1" step="0.05" [ngModel]="jitter()" (ngModelChange)="jitter.set(+$event)" />
          </label>
          <label>
            Ink color
            <input type="color" [ngModel]="inkColor()" (ngModelChange)="inkColor.set($event)" />
          </label>
          <label>
            Paper
            <select [ngModel]="paper()" (ngModelChange)="paper.set($event)">
              <option value="grain">Grain</option>
              <option value="ruled">Ruled</option>
              <option value="none">None</option>
            </select>
          </label>
        </div>
        <div class="paper-frame grow">
          @for (v of [version()]; track v) {
            <quill-ink [text]="sample" [options]="options()" class="ink" style="height: 320px" />
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './sections.scss',
})
export class Playground {
  readonly sample =
    'The five boxing wizards jump quickly. Pack my box with five dozen liquor jugs — 0123456789!';

  font = signal<BuiltinFontId>('caveat');
  fontSize = signal(30);
  penSpeed = signal(1200);
  jitter = signal(0.5);
  inkColor = signal('#1a2b4a');
  paper = signal<'grain' | 'ruled' | 'none'>('ruled');

  /** Options are read at surface creation — bump version to re-create. */
  options = computed<Partial<Omit<InkSurfaceOptions, 'canvas'>>>(() => ({
    font: this.font(),
    fontSize: this.fontSize(),
    penSpeed: this.penSpeed(),
    jitter: this.jitter(),
    inkColor: this.inkColor(),
    paper: this.paper(),
  }));

  version = computed(
    () =>
      `${this.font()}|${this.fontSize()}|${this.penSpeed()}|${this.jitter()}|${this.inkColor()}|${this.paper()}`
  );
}
