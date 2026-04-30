import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { UserRole, normalizeRole } from '../auth/roles';
import { AuthService } from '@app/services';

export const teacherRoleGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const r = normalizeRole(auth.userRole());
  if (r === UserRole.Teacher) {
    return true;
  }
  return router.createUrlTree(['/unauthorized']);
};
