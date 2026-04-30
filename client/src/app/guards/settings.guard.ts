import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@app/services';

/** School profile, academic year, grading — tenant admins only (super_admin impersonating included). */
export const settingsTenantAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const r = auth.userRole()?.toLowerCase() ?? '';
  if (r === 'admin' || r === 'super_admin') return true;
  return router.createUrlTree(['/settings/password']);
};

/** Notifications preferences — admin or teacher. */
export const settingsNotificationsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const r = auth.userRole()?.toLowerCase() ?? '';
  if (r === 'admin' || r === 'super_admin' || r === 'teacher') return true;
  return router.createUrlTree(['/settings/password']);
};
