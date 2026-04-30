import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { SettingsService } from '@app/services';
import { ToastService } from '@app/services';

@Component({
  selector: 'app-academic-settings',
  standalone: true,
  template: `
    <div class="card shadow-sm">
      <div class="card-body">
        <h2 class="h6 mb-3">Academic year</h2>
        @if (loading()) {
          <p class="text-secondary small">Loading…</p>
        } @else if (error()) {
          <p class="text-danger small">{{ error() }}</p>
        } @else if (year()) {
          <p class="mb-1"><strong>Active year:</strong> {{ year()?.name ?? '—' }}</p>
          <p class="text-secondary small mb-0">
            Switch or manage years under <strong>Classes</strong> → academic years workflow (same as Academic module).
          </p>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcademicSettingsComponent implements OnInit {
  private settings = inject(SettingsService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly year = signal<{ id: number; name: string | null } | null>(null);

  ngOnInit(): void {
    this.settings.getAcademicYearSetting().subscribe({
      next: (res) => {
        this.year.set(res.data);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        const msg = err?.error?.message ?? 'Could not load academic year';
        this.error.set(msg);
        this.toast.open(msg, 'Dismiss', { duration: 5000 });
      },
    });
  }
}
