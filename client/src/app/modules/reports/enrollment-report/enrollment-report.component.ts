import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import { AcademicService } from '../../../services/academic.service';
import { ReportService } from '../../../services/report.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-enrollment-report',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './enrollment-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnrollmentReportComponent {
  private fb = inject(FormBuilder);
  private reports = inject(ReportService);
  private academic = inject(AcademicService);
  private toast = inject(ToastService);

  readonly loading = signal(false);
  readonly years = signal<{ id: number; name: string | null }[]>([]);
  readonly summary = signal<{ total_enrolled: number; by_gender: { gender: string; count: number }[] } | null>(
    null
  );

  readonly form = this.fb.nonNullable.group({
    academic_year_id: [null as number | null],
  });

  constructor() {
    this.academic.listAcademicYears().subscribe({
      next: (rows) => {
        this.years.set(rows);
        const active = rows.find((y) => y.is_active);
        if (active) this.form.patchValue({ academic_year_id: active.id });
      },
      error: () => this.toast.open('Could not load academic years', 'Dismiss', { duration: 5000 }),
    });
  }

  apply(): void {
    const ay = this.form.controls.academic_year_id.value;
    if (ay == null) {
      this.toast.open('Select an academic year', 'Dismiss', { duration: 4000 });
      return;
    }
    this.loading.set(true);
    this.reports.getEnrollmentSummary({ academic_year_id: ay }).subscribe({
      next: (res: unknown) => {
        const r = res as { data?: { total_enrolled: number; by_gender: { gender: string; count: number }[] } };
        this.summary.set(r.data ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.open('Could not load report', 'Dismiss', { duration: 5000 });
      },
    });
  }

  exportCsv(): void {
    const s = this.summary();
    if (!s?.by_gender?.length) return;
    this.reports.exportToCsv(
      s.by_gender.map((r) => ({ gender: r.gender, count: r.count })),
      'enrollment-by-gender.csv',
      [
        { key: 'gender', header: 'Gender' },
        { key: 'count', header: 'Count' },
      ]
    );
  }
}
