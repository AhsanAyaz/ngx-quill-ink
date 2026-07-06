import { Component } from '@angular/core';

@Component({
  selector: 'app-docs',
  template: `
    <section class="section" id="docs">
      <h2>Use it in your app</h2>
      <div class="docs-grid">
        <div class="doc-card">
          <h3>1 · Install</h3>
          <pre><code>npm i &#64;codewithahsan/ngx-quill-ink \\
      &#64;codewithahsan/quill-ink-core \\
      &#64;codewithahsan/quill-ink-fonts</code></pre>
        </div>
        <div class="doc-card">
          <h3>2 · Provide defaults</h3>
          <pre><code>import {{ '{' }} provideQuillInk {{ '}' }} from '&#64;codewithahsan/ngx-quill-ink';
import {{ '{' }} caveat {{ '}' }} from '&#64;codewithahsan/quill-ink-fonts/caveat';

providers: [
  provideQuillInk({{ '{' }} font: 'caveat', packs: [caveat] {{ '}' }}),
]</code></pre>
        </div>
        <div class="doc-card">
          <h3>3 · Write</h3>
          <pre><code>&lt;quill-ink [text]="answer()" /&gt;
&lt;quill-ink [stream]="tokenStream" /&gt;

&lt;!-- capture handwriting for a vision LLM --&gt;
&lt;quill-ink [captureMode]="true"
           (inkCommitted)="onInk($event)" /&gt;</code></pre>
        </div>
        <div class="doc-card">
          <h3>Notes</h3>
          <ul>
            <li>Signals-first: a growing <code>[text]</code> animates only the appended suffix.</li>
            <li>Zoneless & SSR-safe. Framework-agnostic core (React/Vue wrappers welcome).</li>
            <li>RTL & CJK are out of scope for v1.</li>
            <li>Fonts: Caveat, Dancing Script, Shadows Into Light — all OFL.</li>
            <li>MIT licensed. <a href="https://github.com/codewithahsan/ngx-quill-ink">GitHub →</a></li>
          </ul>
        </div>
      </div>
    </section>
  `,
  styleUrl: './sections.scss',
})
export class Docs {}
