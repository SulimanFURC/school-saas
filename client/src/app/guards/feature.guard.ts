import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { FeatureService } from '@app/services';

export const featureGuard: CanActivateFn = (route) => {
  const features = inject(FeatureService);
  const router = inject(Router);

  const moduleKey = route.data['moduleKey'] as string | undefined;
  if (!moduleKey) {
    return true;
  }

  if (features.isEnabled(moduleKey)) {
    return true;
  }

  return router.createUrlTree(['/unauthorized']);
};
