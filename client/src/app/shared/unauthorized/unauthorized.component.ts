import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-unauthorized',
  imports: [RouterLink, MatButtonModule],
  template: `
    <section class="ds-section-pad unauthorized">
      <h1 class="ds-headline-md">Access denied</h1>
      <p class="ds-body-md ds-on-variant">
        This module is not enabled for your school, or you do not have permission to open it.
      </p>
      <a mat-flat-button color="primary" routerLink="/">Back to dashboard</a>
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

      a[mat-flat-button] {
        margin-top: 1rem;
        text-decoration: none;
      }
    `,
  ],
})
export class UnauthorizedComponent {}
