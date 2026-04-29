import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import { ReportService } from '../../../services/report.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-expense-report',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './expense-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseReportComponent {
  private fb = inject(FormBuilder);
  private reports = inject(ReportService);
  private toast = inject(ToastService);

  readonly loading = signal(false);
  readonly result = signal<{
    total: number;
    by_category: { category: string; total: number }[];
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
    if (!v.date_from || !v.date_to) return;
    this.loading.set(true);
    this.reports.getExpenseSummary({ date_from: v.date_from, date_to: v.date_to }).subscribe({
      next: (res: unknown) => {
        const r = res as {
          data?: { total: number; by_category: { category: string; total: number }[] };
        };
        this.result.set(r.data ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.open('Could not load report', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
