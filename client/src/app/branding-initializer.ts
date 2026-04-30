import { AuthService } from './services/auth.service';
import { BrandingService } from './services/branding.service';

export function initBrandingFactory(auth: AuthService, branding: BrandingService) {
  return () => {
    if (auth.isAuthenticated()) {
      branding.loadBranding();
    }
    return Promise.resolve();
  };
}
