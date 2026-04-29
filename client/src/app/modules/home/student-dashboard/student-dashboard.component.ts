import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { DashboardService, type StudentDashboardPayload } from '../../../services/dashboard.service';
import { ToastService } from '../../../services/toast.service';
import { DashboardSectionComponent } from '../components/dashboard-section.component';
import { RecentTableComponent, type RecentColumn } from '../components/recent-table.component';
import { StatCardComponent } from '../components/stat-card.component';

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [DecimalPipe, StatCardComponent, DashboardSectionComponent, RecentTableComponent],
  templateUrl: './student-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentDashboardComponent implements OnInit {
  private dashboardApi = inject(DashboardService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly data = signal<StudentDashboardPayload | null>(null);

  readonly resultColumns: RecentColumn[] = [
    { key: 'exam_name', label: 'Exam' },
    { key: 'subject', label: 'Subject' },
    { key: 'marks', label: 'Marks' },
    { key: 'date', label: 'Date' },
  ];

  ngOnInit(): void {
    this.load();
  }

  refresh(): void {
    this.load();
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

  private load(): void {
    this.loading.set(true);
    this.dashboardApi.getStudentDashboard().subscribe({
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
