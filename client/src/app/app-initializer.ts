import { AuthService } from '@app/services';
import { FeatureService } from '@app/services';

export function initFeaturesFactory(auth: AuthService, features: FeatureService) {
  return () =>
    auth.isAuthenticated()
      ? features.loadForCurrentTenant().catch(() => undefined)
      : Promise.resolve();
}
