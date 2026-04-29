import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-dashboard-section',
  standalone: true,
  template: `
    <section class="mb-4">
      @if (title) {
        <h2 class="h5 mb-3">{{ title }}</h2>
      }
      <ng-content />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardSectionComponent {
  @Input() title = '';
}
