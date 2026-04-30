import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface RecentColumn {
  key: string;
  label: string;
}

@Component({
  selector: 'app-recent-table',
  standalone: true,
  template: `
    <div class="card recent-table">
      @if (title) {
        <div class="card-header d-flex align-items-center justify-content-between recent-table__header">
          <span class="recent-table__title">{{ title }}</span>
          <span class="recent-table__action">View all</span>
        </div>
      }
      <div class="card-body p-0 recent-table__body">
        @if (!rows || rows.length === 0) {
          <p class="text-secondary mb-0 p-3 small">No data available</p>
        } @else {
          <div class="table-responsive">
            <table class="table app-data-table table-sm mb-0 recent-table__table">
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
  styles: [
    `
      .recent-table {
        border: 1px solid var(--dashboard-border);
        border-radius: var(--dashboard-radius);
        box-shadow: var(--dashboard-shadow);
        overflow: hidden;
      }

      .recent-table__header {
        background: linear-gradient(180deg, var(--primary), color-mix(in srgb, var(--primary) 82%, #8d6a11));
        border-bottom: none;
        color: #ffffff;
        padding: 0.6rem 0.9rem;
      }

      .recent-table__title {
        font-size: 0.9rem;
        font-weight: 700;
      }

      .recent-table__action {
        font-size: 0.75rem;
        font-weight: 600;
        border: 1px solid rgba(255, 255, 255, 0.6);
        border-radius: 999px;
        padding: 0.2rem 0.5rem;
      }

      .recent-table__table thead th {
        color: var(--dashboard-text-muted);
        font-size: 0.75rem;
      }

      .recent-table__table tbody td {
        font-size: 0.84rem;
        color: var(--dashboard-text);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentTableComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) columns!: RecentColumn[];
  @Input() rows: Record<string, unknown>[] = [];
}
