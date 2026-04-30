import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-dashboard-section',
  standalone: true,
  template: `
    <section class="mb-4" [class]="sectionClass">
      @if (title) {
        <h2 class="h5 mb-3 dashboard-section__title">{{ title }}</h2>
      }
      <ng-content />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardSectionComponent {
  @Input() title = '';
  @Input() sectionClass = '';
}
