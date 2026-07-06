import { Component } from '@angular/core';
import { Hero } from './hero/hero';

@Component({
  imports: [Hero],
  selector: 'app-root',
  template: `<app-hero />`,
  styleUrl: './app.scss',
})
export class App {}
