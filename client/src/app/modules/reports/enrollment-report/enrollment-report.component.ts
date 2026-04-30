import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';

import { InlineErrorComponent } from '../../../shared/inline-error/inline-error.component';
import { SkeletonTableComponent } from '../../../shared/skeleton-table/skeleton-table.component';
import { LookupService } from '@app/services';
import { ReportService } from '@app/services';
import { ToastService } from '@app/services';

@Component({
  selector: 'app-enrollment-report',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonModule, SelectModule, SkeletonTableComponent, InlineErrorComponent],
  templateUrl: './enrollment-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnrollmentReportComponent {
  private fb = inject(FormBuilder);
  private reports = inject(ReportService);
  private lookup = inject(LookupService);
  private toast = inject(ToastService);

  readonly loading = signal(false);
  readonly hasError = signal(false);
  readonly years = this.lookup.academicYears;
  readonly yearOptions = computed(() =>
    this.years().map((year) => ({ label: year.name ?? 'Unnamed year', value: year.id }))
  );
  readonly summary = signal<{ total_enrolled: number; by_gender: { gender: string; count: number }[] } | null>(
    null
  );

  readonly form = this.fb.nonNullable.group({
    academic_year_id: [null as number | null],
  });

  constructor() {
    this.lookup.loadAcademicYears();
    effect(() => {
      const current = this.form.controls.academic_year_id.value;
      if (current != null) return;
      const active = this.years().find((year) => year.is_active);
      if (active) {
        this.form.patchValue({ academic_year_id: active.id }, { emitEvent: false });
      }
    });
  }

  apply(): void {
    const ay = this.form.controls.academic_year_id.value;
    if (ay == null) {
      this.toast.open('Select an academic year', 'Dismiss', { duration: 4000 });
      return;
    }
    this.loading.set(true);
    this.hasError.set(false);
    this.reports.getEnrollmentSummary({ academic_year_id: ay }).subscribe({
      next: (res: unknown) => {
        const r = res as { data?: { total_enrolled: number; by_gender: { gender: string; count: number }[] } };
        this.summary.set(r.data ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.hasError.set(true);
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
