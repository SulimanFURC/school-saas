import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface RecentColumn {
  key: string;
  label: string;
}

@Component({
  selector: 'app-recent-table',
  standalone: true,
  template: `
    <div class="card">
      @if (title) {
        <div class="card-header d-flex align-items-center justify-content-between">
          <span>{{ title }}</span>
        </div>
      }
      <div class="card-body p-0">
        @if (!rows || rows.length === 0) {
          <p class="text-secondary mb-0 p-3 small">No data available</p>
        } @else {
          <div class="table-responsive">
            <table class="table app-data-table table-sm mb-0">
              <thead>
                <tr>
                  @for (c of columns; track c.key) {
                    <th scope="col">{{ c.label }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of rows; track $index) {
                  <tr>
                    @for (c of columns; track c.key) {
                      <td>{{ row[c.key] }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentTableComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) columns!: RecentColumn[];
  @Input() rows: Record<string, unknown>[] = [];
}
