import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return true;
  }

  if (auth.userRole()?.toLowerCase() === 'super_admin') {
    return router.createUrlTree(['/super-admin/tenants']);
  }

  return router.createUrlTree(['/']);
};
