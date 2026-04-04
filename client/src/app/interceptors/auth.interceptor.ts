import { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '../../environments/environment';

const LS_TOKEN = 'school_saas_token';
const LS_SUBDOMAIN = 'school_saas_subdomain';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isApi = req.url.startsWith(environment.apiBaseUrl);
  if (!isApi) {
    return next(req);
  }

  // Login must not send a stale Bearer token or overwrite x-tenant-id from the form.
  if (req.url.includes('/auth/signup') || req.url.includes('/auth/login')) {
    return next(req);
  }

  const token = localStorage.getItem(LS_TOKEN);
  const subdomain = localStorage.getItem(LS_SUBDOMAIN);

  if (!token || !subdomain) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': subdomain,
    },
  });
  return next(authReq);
};
