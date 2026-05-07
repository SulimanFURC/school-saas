import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthorizationService } from '@app/services';
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
  readonly authorization = inject(AuthorizationService);

  showSchoolTabs(): boolean {
    const r = this.auth.userRole()?.toLowerCase() ?? '';
    return r === 'admin' || r === 'super_admin' || this.authorization.hasPermission('settings.read');
  }

  showNotifications(): boolean {
    const r = this.auth.userRole()?.toLowerCase() ?? '';
    return r === 'admin' || r === 'super_admin' || r === 'teacher' || this.authorization.hasPermission('settings.read');
  }

  showRoleManagement(): boolean {
    const r = this.auth.userRole()?.toLowerCase() ?? '';
    return r === 'admin' || r === 'super_admin';
  }
}
