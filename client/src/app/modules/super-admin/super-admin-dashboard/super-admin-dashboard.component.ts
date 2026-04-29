import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { DashboardService, type SuperAdminDashboardPayload } from '../../../services/dashboard.service';
import { ToastService } from '../../../services/toast.service';
import { DashboardSectionComponent } from '../../home/components/dashboard-section.component';
import { StatCardComponent } from '../../home/components/stat-card.component';

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [StatCardComponent, DashboardSectionComponent],
  templateUrl: './super-admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminDashboardComponent implements OnInit {
  private dashboardApi = inject(DashboardService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly data = signal<SuperAdminDashboardPayload | null>(null);

  ngOnInit(): void {
    this.load();
  }

  refresh(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.dashboardApi.getSuperAdminDashboard().subscribe({
      next: (payload) => {
        this.data.set(payload);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.open('Could not load platform dashboard', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
