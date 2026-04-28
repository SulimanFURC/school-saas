import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Routes only school admins (and super_admin in tenant context) may open.
 * Teachers are sent to their profile; students may only use a small subset (e.g. home).
 */
export const adminRoleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const r = auth.userRole()?.toLowerCase() ?? '';
  const path = route.routeConfig?.path ?? '';

  if (r === 'admin' || r === 'super_admin') {
    return true;
  }
  if (r === 'teacher') {
    return router.createUrlTree(['/teachers/dashboard']);
  }
  if (r === 'student') {
    if (path === '' || path === 'profile') {
      return true;
    }
    return router.createUrlTree(['/unauthorized']);
  }
  return router.createUrlTree(['/unauthorized']);
};
