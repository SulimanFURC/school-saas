import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { InlineErrorComponent } from '../../../shared/inline-error/inline-error.component';
import { SkeletonTableComponent } from '../../../shared/skeleton-table/skeleton-table.component';
import { ReportService } from '../../../services/report.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-fee-collection-report',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, SkeletonTableComponent, InlineErrorComponent],
  templateUrl: './fee-collection-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeCollectionReportComponent {
  private fb = inject(FormBuilder);
  private reports = inject(ReportService);
  private toast = inject(ToastService);

  readonly loading = signal(false);
  readonly hasError = signal(false);
  readonly result = signal<{
    total_collected: number;
    by_payment_mode: { mode: string; total: number }[];
  } | null>(null);

  readonly form = this.fb.nonNullable.group({
    date_from: [''],
    date_to: [''],
  });

  constructor() {
    const t = new Date();
    const start = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`;
    const end = t.toISOString().slice(0, 10);
    this.form.patchValue({ date_from: start, date_to: end });
  }

  apply(): void {
    const v = this.form.getRawValue();
    if (!v.date_from || !v.date_to) {
      this.toast.open('Select date range', 'Dismiss', { duration: 4000 });
      return;
    }
    this.loading.set(true);
    this.hasError.set(false);
    this.reports.getFeeCollectionSummary({ date_from: v.date_from, date_to: v.date_to }).subscribe({
      next: (res: unknown) => {
        const r = res as {
          data?: { total_collected: number; by_payment_mode: { mode: string; total: number }[] };
        };
        this.result.set(r.data ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.hasError.set(true);
        this.toast.open('Could not load report', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
