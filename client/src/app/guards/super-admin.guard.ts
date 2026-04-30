import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { UserRole, normalizeRole } from '../auth/roles';
import { AuthService } from '@app/services';

export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const role = normalizeRole(auth.userRole());
  if (auth.isAuthenticated() && role === UserRole.SuperAdmin) {
    return true;
  }

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  return router.createUrlTree(['/']);
};
