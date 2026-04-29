import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-skeleton-table',
  standalone: true,
  imports: [SkeletonModule],
  template: `
    <table class="table">
      <tbody>
        @for (row of rowArray(); track $index) {
          <tr>
            @for (col of colArray(); track $index) {
              <td><p-skeleton height="1.2rem" borderRadius="4px" /></td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonTableComponent {
  readonly rows = input(5);
  readonly columns = input(4);

  readonly rowArray = computed(() => Array.from({ length: this.rows() }));
  readonly colArray = computed(() => Array.from({ length: this.columns() }));
}
