import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { catchError, finalize, of, switchMap, tap } from 'rxjs';

import { DashboardService, type StudentDashboardPayload } from '@app/services';
import { ToastService } from '@app/services';
import { InlineErrorComponent } from '../../../shared/inline-error/inline-error.component';
import { SkeletonCardComponent } from '../../../shared/skeleton-card/skeleton-card.component';
import { DashboardSectionComponent } from '../components/dashboard-section.component';
import { RecentTableComponent, type RecentColumn } from '../components/recent-table.component';
import { StatCardComponent } from '../components/stat-card.component';

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [
    DecimalPipe,
    ButtonModule,
    StatCardComponent,
    DashboardSectionComponent,
    RecentTableComponent,
    SkeletonCardComponent,
    InlineErrorComponent,
  ],
  templateUrl: './student-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentDashboardComponent {
  private dashboardApi = inject(DashboardService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly hasError = signal(false);
  private readonly reloadTick = signal(0);
  readonly data = toSignal<StudentDashboardPayload | null>(
    toObservable(this.reloadTick).pipe(
      tap(() => {
        this.loading.set(true);
        this.hasError.set(false);
      }),
      switchMap(() =>
        this.dashboardApi.getStudentDashboard().pipe(
          catchError(() => {
            this.hasError.set(true);
            this.toast.open('Could not load dashboard', 'Dismiss', { duration: 5000 });
            return of(null);
          }),
          finalize(() => this.loading.set(false))
        )
      )
    ),
    { initialValue: null }
  );

  readonly resultColumns: RecentColumn[] = [
    { key: 'exam_name', label: 'Exam' },
    { key: 'subject', label: 'Subject' },
    { key: 'marks', label: 'Marks' },
    { key: 'date', label: 'Date' },
  ];

  refresh(): void {
    this.reloadTick.update((n) => n + 1);
  }

  resultRows(): Record<string, unknown>[] {
    const d = this.data();
    if (!d) return [];
    return d.recent_exams.map((r) => ({
      exam_name: r.exam_name,
      subject: r.subject,
      marks:
        r.marks_obtained != null && r.total_marks != null
          ? `${r.marks_obtained} / ${r.total_marks}`
          : '—',
      date: r.date ?? '—',
    }));
  }

}
