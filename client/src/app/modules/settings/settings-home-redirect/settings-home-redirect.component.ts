import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-settings-home-redirect',
  standalone: true,
  template: '',
})
export class SettingsHomeRedirectComponent {
  constructor() {
    const router = inject(Router);
    const auth = inject(AuthService);
    const r = auth.userRole()?.toLowerCase() ?? '';
    const target =
      r === 'teacher' || r === 'student' ? '/settings/password' : '/settings/school-profile';
    void router.navigateByUrl(target, { replaceUrl: true });
  }
}