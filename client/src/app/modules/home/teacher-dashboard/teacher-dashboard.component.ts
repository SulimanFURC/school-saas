import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { DashboardService, type TeacherDashboardPayload } from '../../../services/dashboard.service';
import { ToastService } from '../../../services/toast.service';
import { DashboardSectionComponent } from '../components/dashboard-section.component';
import { RecentTableComponent, type RecentColumn } from '../components/recent-table.component';
import { StatCardComponent } from '../components/stat-card.component';

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [StatCardComponent, DashboardSectionComponent, RecentTableComponent],
  templateUrl: './teacher-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherDashboardComponent implements OnInit {
  private dashboardApi = inject(DashboardService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly data = signal<TeacherDashboardPayload | null>(null);

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

  ngOnInit(): void {
    this.load();
  }

  refresh(): void {
    this.load();
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

  private load(): void {
    this.loading.set(true);
    this.dashboardApi.getTeacherDashboard().subscribe({
      next: (payload) => {
        this.data.set(payload);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.open('Could not load dashboard', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
