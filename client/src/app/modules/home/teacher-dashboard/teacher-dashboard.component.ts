import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { catchError, finalize, of, switchMap, tap } from 'rxjs';

import { DashboardService, type TeacherDashboardPayload } from '../../../services/dashboard.service';
import { ToastService } from '../../../services/toast.service';
import { InlineErrorComponent } from '../../../shared/inline-error/inline-error.component';
import { SkeletonCardComponent } from '../../../shared/skeleton-card/skeleton-card.component';
import { DashboardSectionComponent } from '../components/dashboard-section.component';
import { RecentTableComponent, type RecentColumn } from '../components/recent-table.component';
import { StatCardComponent } from '../components/stat-card.component';

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [
    ButtonModule,
    StatCardComponent,
    DashboardSectionComponent,
    RecentTableComponent,
    SkeletonCardComponent,
    InlineErrorComponent,
  ],
  templateUrl: './teacher-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherDashboardComponent {
  private dashboardApi = inject(DashboardService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly hasError = signal(false);
  private readonly reloadTick = signal(0);
  readonly data = toSignal<TeacherDashboardPayload | null>(
    toObservable(this.reloadTick).pipe(
      tap(() => {
        this.loading.set(true);
        this.hasError.set(false);
      }),
      switchMap(() =>
        this.dashboardApi.getTeacherDashboard().pipe(
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

  readonly assignmentColumns: RecentColumn[] = [
    { key: 'class_name', label: 'Class' },
    { key: 'section_name', label: 'Section' },
    { key: 'subject_name', label: 'Subject' },
    { key: 'academic_year', label: 'Year' },
  ];

  readonly notifColumns: RecentColumn[] = [
    { key: 'title', label: 'Title' },
    { key: 'created_at', label: 'When' },
    { key: 'read', label: 'Read' },
  ];

  refresh(): void {
    this.reloadTick.update((n) => n + 1);
  }

  notifRows(): Record<string, unknown>[] {
    const d = this.data();
    if (!d) return [];
    return d.recent_notifications.map((n) => ({
      title: n.title,
      created_at: n.created_at ? String(n.created_at).slice(0, 16).replace('T', ' ') : '—',
      read: n.is_read ? 'Yes' : 'No',
    }));
  }

  assignmentRows(): Record<string, unknown>[] {
    const d = this.data();
    if (!d) return [];
    return d.my_assignments.map((r) => ({ ...r }));
  }

}
