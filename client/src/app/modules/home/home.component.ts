import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  imports: [],
  template: `
    <section class="ds-section-pad home-hero">
      <h1 class="ds-display-md">Dashboard</h1>
      <p class="ds-body-lg ds-on-variant">
        Welcome to School SaaS — your workspace overview will appear here.
      </p>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .home-hero {
        max-width: 42rem;
      }
    `,
  ],
})
export class HomeComponent {}
