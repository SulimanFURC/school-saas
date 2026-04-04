import { AuthService } from './services/auth.service';
import { FeatureService } from './services/feature.service';

export function initFeaturesFactory(auth: AuthService, features: FeatureService) {
  return () =>
    auth.isAuthenticated()
      ? features.loadForCurrentTenant().catch(() => undefined)
      : Promise.resolve();
}
