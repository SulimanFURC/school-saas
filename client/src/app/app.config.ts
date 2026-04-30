import { APP_INITIALIZER, ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import Aura from '@primeuix/themes/aura';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { initFeaturesFactory } from './app-initializer';
import { initBrandingFactory } from './branding-initializer';
import { apiErrorInterceptor } from './interceptors/api-error.interceptor';
import { authInterceptor } from './interceptors/auth.interceptor';
import { AuthService, BrandingService, FeatureService, ThemeService } from '@app/services';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiErrorInterceptor, authInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          prefix: 'p',
          darkModeSelector: '.app-dark',
          cssLayer: false,
        },
      },
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: (themeService: ThemeService) => () => Promise.resolve(themeService),
      deps: [ThemeService],
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
