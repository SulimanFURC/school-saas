import { AuthService } from '@app/services';
import { BrandingService } from '@app/services';

export function initBrandingFactory(auth: AuthService, branding: BrandingService) {
  return () => {
    if (auth.isAuthenticated()) {
      branding.loadBranding();
    }
    return Promise.resolve();
  };
}
