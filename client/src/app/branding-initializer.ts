import { AuthService } from './services/auth.service';
import { BrandingService } from './services/branding.service';

export function initBrandingFactory(auth: AuthService, branding: BrandingService) {
  return () =>
    auth.isAuthenticated() ? branding.loadForCurrentTenant().catch(() => undefined) : Promise.resolve();
}
