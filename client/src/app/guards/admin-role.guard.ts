import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { UserRole, isAdminOrSuperAdmin, normalizeRole } from '../auth/roles';
import { AuthService } from '@app/services';

/**
 * Routes only school admins (and super_admin in tenant context) may open.
 * Teachers are sent to their profile; students may only use a small subset (e.g. home).
 */
export const adminRoleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const r = normalizeRole(auth.userRole());
  const path = route.routeConfig?.path ?? '';

  if (isAdminOrSuperAdmin(auth.userRole())) {
    return true;
  }
  if (r === UserRole.Teacher) {
    return router.createUrlTree(['/home']);
  }
  if (r === UserRole.Student) {
    if (path === 'home' || path === 'profile') {
      return true;
    }
    return router.createUrlTree(['/unauthorized']);
  }
  return router.createUrlTree(['/unauthorized']);
};
