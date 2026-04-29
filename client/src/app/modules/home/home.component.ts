import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AuthService } from '../../services/auth.service';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { StudentDashboardComponent } from './student-dashboard/student-dashboard.component';
import { TeacherDashboardComponent } from './teacher-dashboard/teacher-dashboard.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [AdminDashboardComponent, TeacherDashboardComponent, StudentDashboardComponent],
  template: `
    @switch (role()) {
      @case ('teacher') {
        <app-teacher-dashboard />
      }
      @case ('student') {
        <app-student-dashboard />
      }
      @default {
        <app-admin-dashboard />
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private auth = inject(AuthService);

  readonly role = (): 'teacher' | 'student' | 'admin' => {
    const r = String(this.auth.userRole() ?? '').toLowerCase();
    if (r === 'teacher') return 'teacher';
    if (r === 'student') return 'student';
    return 'admin';
  };
}
