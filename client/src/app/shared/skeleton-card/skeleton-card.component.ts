import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-skeleton-card',
  standalone: true,
  imports: [SkeletonModule],
  template: `
    <div class="row g-3">
      @for (item of cardArray(); track $index) {
        <div class="col-md-3 col-sm-6">
          <div class="p-3 border rounded">
            <p-skeleton width="60%" height="0.9rem" styleClass="mb-2" />
            <p-skeleton width="40%" height="1.8rem" />
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonCardComponent {
  readonly count = input(4);
  readonly cardArray = computed(() => Array.from({ length: this.count() }));
}
