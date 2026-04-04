import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  selector: 'app-placeholder-page',
  imports: [],
  template: `
    <section class="ds-section-pad">
      <h1 class="ds-headline-md">{{ title() }}</h1>
      <p class="ds-body-md ds-on-variant">This section is coming soon.</p>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class PlaceholderPageComponent {
  private route = inject(ActivatedRoute);

  readonly title = toSignal(
    this.route.data.pipe(map((d) => (d?.['title'] as string) ?? 'Page')),
    { initialValue: '' }
  );
}
