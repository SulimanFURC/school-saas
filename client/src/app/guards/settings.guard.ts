import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { map } from 'rxjs/operators';

import { AuthService } from '@app/services';
import { AuthorizationService } from '@app/services';

/** School profile, academic year, grading — tenant admins only (super_admin impersonating included). */
export const settingsTenantAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const authorization = inject(AuthorizationService);
  const router = inject(Router);
  const r = auth.userRole()?.toLowerCase() ?? '';
  if (r === 'admin' || r === 'super_admin') return true;
  return authorization.loadMyPermissions().pipe(
    map(() =>
      authorization.hasPermission('settings.read')
        ? true
        : router.createUrlTree(['/settings/password'])
    )
  );
};

/** Notifications preferences — admin or teacher. */
export const settingsNotificationsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const authorization = inject(AuthorizationService);
  const router = inject(Router);
  const r = auth.userRole()?.toLowerCase() ?? '';
  if (r === 'admin' || r === 'super_admin' || r === 'teacher') return true;
  return authorization.loadMyPermissions().pipe(
    map(() =>
      authorization.hasPermission('settings.read')
        ? true
        : router.createUrlTree(['/settings/password'])
    )
  );
};
