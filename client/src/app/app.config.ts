import { APP_INITIALIZER, ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initFeaturesFactory } from './app-initializer';
import { initBrandingFactory } from './branding-initializer';
import { authInterceptor } from './interceptors/auth.interceptor';
import { AuthService } from './services/auth.service';
import { BrandingService } from './services/branding.service';
import { FeatureService } from './services/feature.service';
import { themeInitializer } from './services/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    {
      provide: APP_INITIALIZER,
      useFactory: themeInitializer,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initFeaturesFactory,
      deps: [AuthService, FeatureService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initBrandingFactory,
      deps: [AuthService, BrandingService],
      multi: true,
    },
  ],
};
