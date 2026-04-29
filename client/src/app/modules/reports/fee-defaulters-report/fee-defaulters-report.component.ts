import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import { AcademicService } from '../../../services/academic.service';
import { ReportService } from '../../../services/report.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-fee-defaulters-report',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './fee-defaulters-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeDefaultersReportComponent {
  private fb = inject(FormBuilder);
  private reports = inject(ReportService);
  private academic = inject(AcademicService);
  private toast = inject(ToastService);

  readonly loading = signal(false);
  readonly years = signal<{ id: number; name: string | null }[]>([]);
  readonly rows = signal<
    {
      student_id: string;
      admission_no: string;
      student_name: string;
      last_payment_date: string | null;
    }[]
  >([]);

  readonly form = this.fb.nonNullable.group({
    academic_year_id: [null as number | null],
  });

  constructor() {
    this.academic.listAcademicYears().subscribe({
      next: (list) => {
        this.years.set(list);
        const active = list.find((y) => y.is_active);
        if (active) this.form.patchValue({ academic_year_id: active.id });
      },
      error: () => this.toast.open('Could not load academic years', 'Dismiss', { duration: 5000 }),
    });
  }

  apply(): void {
    const ay = this.form.controls.academic_year_id.value;
    if (ay == null) return;
    this.loading.set(true);
    this.reports.getFeeDefaulters({ academic_year_id: ay }).subscribe({
      next: (res: unknown) => {
        const r = res as {
          data?: {
            student_id: string;
            admission_no: string;
            student_name: string;
            last_payment_date: string | null;
          }[];
        };
        this.rows.set(r.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.open('Could not load report', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
