import { Component } from '@angular/core';
import { Hero } from './hero/hero';
import { Streaming } from './sections/streaming';
import { Capture } from './sections/capture';
import { Playground } from './sections/playground';
import { Docs } from './sections/docs';

@Component({
  imports: [Hero, Streaming, Capture, Playground, Docs],
  selector: 'app-root',
  template: `
    <nav class="topnav">
      <span class="brand">✒️ ngx-quill-ink</span>
      <div class="links">
        <a href="#streaming">Streaming</a>
        <a href="#capture">Capture</a>
        <a href="#playground">Playground</a>
        <a href="#docs">Docs</a>
        <a href="https://github.com/codewithahsan/ngx-quill-ink" target="_blank" rel="noopener">GitHub</a>
      </div>
    </nav>
    <app-hero />
    <app-streaming />
    <app-capture />
    <app-playground />
    <app-docs />
    <footer class="footer">
      MIT licensed · Fonts: Caveat, Dancing Script, Shadows Into Light (OFL) ·
      Built with a framework-agnostic core — React/Vue wrappers welcome.
    </footer>
  `,
  styleUrl: './app.scss',
})
export class App {}
