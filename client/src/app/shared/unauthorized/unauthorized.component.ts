import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-unauthorized',
  imports: [RouterLink],
  template: `
    <section class="ds-section-pad unauthorized">
      <h1 class="ds-headline-md">Access denied</h1>
      <p class="ds-body-md ds-on-variant">
        This module is not enabled for your school, or you do not have permission to open it.
      </p>
      <a class="btn btn-primary mt-3 d-inline-block" routerLink="/">Back to dashboard</a>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .unauthorized {
        max-width: 36rem;
      }
    `,
  ],
})
export class UnauthorizedComponent {}
