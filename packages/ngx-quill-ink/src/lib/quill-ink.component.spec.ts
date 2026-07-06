import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { QuillInkComponent } from './quill-ink.component';
import { provideQuillInk } from './provide-quill-ink';
import { registerFontPack, FontPack } from '@codewithahsan/quill-ink-core';

// jsdom has no canvas: install a recording no-op 2d context.
beforeAll(() => {
  const noopCtx = () =>
    new Proxy(
      { canvas: null },
      {
        get: (target, prop) => {
          if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
          // numbers commonly read back
          if (prop === 'lineWidth' || prop === 'globalAlpha') return 1;
          return () => undefined;
        },
        set: () => true,
      }
    );
  HTMLCanvasElement.prototype.getContext = (() => noopCtx()) as never;
});

function testPack(): FontPack {
  const glyphs: FontPack['glyphs'] = { ' ': { advance: 250, strokes: [] } };
  for (let c = 33; c < 127; c++) {
    glyphs[String.fromCharCode(c)] = { advance: 400, strokes: [[0, 0, 100, -200, 200, 0]] };
  }
  return { version: 1, id: 'test-pack', name: 'Test', unitsPerEm: 1000, ascent: 800, descent: 200, glyphs };
}

@Component({
  imports: [QuillInkComponent],
  template: `<quill-ink [text]="text()" [options]="{ font: pack, penSpeed: 1e9 }" style="width: 400px; height: 200px" />`,
})
class Host {
  text = signal<string | undefined>(undefined);
  pack = testPack();
}

describe('QuillInkComponent', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    registerFontPack(testPack());
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideZonelessChangeDetection(),
        provideQuillInk({ font: 'test-pack' as never }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('renders a canvas and initializes after first render', () => {
    const canvas: HTMLCanvasElement = fixture.nativeElement.querySelector('canvas');
    expect(canvas).toBeTruthy();
    const quill = fixture.debugElement.children[0].componentInstance as QuillInkComponent;
    expect(quill.inkSurface).toBeDefined();
  });

  it('destroys the surface with the component', () => {
    const quill = fixture.debugElement.children[0].componentInstance as QuillInkComponent;
    const surface = quill.inkSurface;
    expect(surface).toBeDefined();
    const destroySpy = vi.spyOn(surface as never, 'destroy' as never);
    fixture.destroy();
    expect(destroySpy).toHaveBeenCalled();
  });

  it('appends only the suffix when text grows', async () => {
    const quill = fixture.debugElement.children[0].componentInstance as QuillInkComponent;
    const surface = quill.inkSurface as { write: (t: string) => unknown };
    const writeSpy = vi.spyOn(surface, 'write');

    fixture.componentInstance.text.set('Hello');
    await fixture.whenStable();
    expect(writeSpy).toHaveBeenLastCalledWith('Hello');

    fixture.componentInstance.text.set('Hello world');
    await fixture.whenStable();
    expect(writeSpy).toHaveBeenLastCalledWith(' world');
  });

  it('rewrites (clear + write) when text shrinks or mutates', async () => {
    const quill = fixture.debugElement.children[0].componentInstance as QuillInkComponent;
    const surface = quill.inkSurface as { write: (t: string) => unknown; clear: (m?: string) => Promise<void> };
    const writeSpy = vi.spyOn(surface, 'write');
    const clearSpy = vi.spyOn(surface, 'clear');

    fixture.componentInstance.text.set('The cat sat');
    await fixture.whenStable();
    fixture.componentInstance.text.set('The dog sat');
    await fixture.whenStable();
    await Promise.resolve(); // clear().then(write)
    expect(clearSpy).toHaveBeenCalledWith('instant');
    expect(writeSpy).toHaveBeenLastCalledWith('The dog sat');
  });
});
