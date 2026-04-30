import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '@app/services';

@Component({
  selector: 'app-settings-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './settings-layout.component.html',
  styleUrl: './settings-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsLayoutComponent {
  readonly auth = inject(AuthService);

  showSchoolTabs(): boolean {
    const r = this.auth.userRole()?.toLowerCase() ?? '';
    return r === 'admin' || r === 'super_admin';
  }

  showNotifications(): boolean {
    const r = this.auth.userRole()?.toLowerCase() ?? '';
    return r === 'admin' || r === 'super_admin' || r === 'teacher';
  }
}
