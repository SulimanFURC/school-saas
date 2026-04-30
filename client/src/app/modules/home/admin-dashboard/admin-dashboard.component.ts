import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { catchError, finalize, of, switchMap, tap } from 'rxjs';

import { DashboardService, type AdminDashboardPayload } from '@app/services';
import { ToastService } from '@app/services';
import { InlineErrorComponent } from '../../../shared/inline-error/inline-error.component';
import { SkeletonCardComponent } from '../../../shared/skeleton-card/skeleton-card.component';
import { DashboardSectionComponent } from '../components/dashboard-section.component';
import { RecentTableComponent } from '../components/recent-table.component';
import { StatCardComponent } from '../components/stat-card.component';

@Component({
  selector: 'app-admin-dashboard',
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
  templateUrl: './admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
  private dashboardApi = inject(DashboardService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly hasError = signal(false);
  private readonly reloadTick = signal(0);
  readonly data = toSignal<AdminDashboardPayload | null>(
    toObservable(this.reloadTick).pipe(
      tap(() => {
        this.loading.set(true);
        this.hasError.set(false);
      }),
      switchMap(() =>
        this.dashboardApi.getAdminDashboard().pipe(
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

  readonly admissionColumns = [
    { key: 'name', label: 'Student' },
    { key: 'class_section', label: 'Class' },
    { key: 'admitted_on', label: 'Admitted' },
  ];

  readonly feeColumns = [
    { key: 'student_name', label: 'Student' },
    { key: 'amount', label: 'Amount' },
    { key: 'date', label: 'Date' },
  ];

  readonly admissionRows = computed(() => {
    const d = this.data();
    if (!d) return [];
    return d.recent_admissions.map((a) => ({
      name: a.name,
      class_section: [a.class_name, a.section_name].filter(Boolean).join(' ') || '—',
      admitted_on: a.admitted_on ?? '—',
    })) as Record<string, unknown>[];
  });

  readonly feeRows = computed(() => {
    const d = this.data();
    if (!d) return [];
    return d.recent_fee_collections.map((f) => ({
      student_name: f.student_name,
      amount: f.amount,
      date: f.date,
    })) as Record<string, unknown>[];
  });

  refresh(): void {
    this.reloadTick.update((n) => n + 1);
  }
}
