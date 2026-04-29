import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';

import { DashboardService, type AdminDashboardPayload } from '../../../services/dashboard.service';
import { ToastService } from '../../../services/toast.service';
import { DashboardSectionComponent } from '../components/dashboard-section.component';
import { RecentTableComponent } from '../components/recent-table.component';
import { StatCardComponent } from '../components/stat-card.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [DecimalPipe, StatCardComponent, DashboardSectionComponent, RecentTableComponent],
  templateUrl: './admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit {
  private dashboardApi = inject(DashboardService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly data = signal<AdminDashboardPayload | null>(null);

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

  ngOnInit(): void {
    this.load();
  }

  refresh(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.dashboardApi.getAdminDashboard().subscribe({
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
