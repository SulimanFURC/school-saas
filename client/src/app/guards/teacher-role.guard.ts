import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const teacherRoleGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const r = auth.userRole()?.toLowerCase() ?? '';
  if (r === 'teacher') {
    return true;
  }
  return router.createUrlTree(['/unauthorized']);
};
