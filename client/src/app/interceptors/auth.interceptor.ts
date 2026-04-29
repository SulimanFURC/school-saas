import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

const LS_TOKEN = 'school_saas_token';
const LS_SUBDOMAIN = 'school_saas_subdomain';

/** When true, do not attempt refresh+retry (avoids loops). */
export const AUTH_REFRESH_RETRIED = new HttpContextToken(() => false);

/** Treat localhost and 127.0.0.1 as the same API origin so the interceptor still attaches auth. */
function sameApiOrigin(url: string): boolean {
  const base = environment.apiBaseUrl;
  if (url.startsWith(base)) return true;
  try {
    const api = new URL(base);
    const u = new URL(url);
    const loopback = (h: string) => h === 'localhost' || h === '127.0.0.1';
    if (api.protocol !== u.protocol) return false;
    const port = (x: URL) => x.port || (x.protocol === 'https:' ? '443' : '80');
    if (port(api) !== port(u)) return false;
    if (!loopback(api.hostname) || !loopback(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function isAuthBypassUrl(url: string): boolean {
  return (
    url.includes('/auth/signup') ||
    url.includes('/auth/login') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/forgot-password') ||
    url.includes('/auth/reset-password')
  );
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  if (!sameApiOrigin(req.url)) {
    return next(req);
  }

  if (isAuthBypassUrl(req.url)) {
    return next(req);
  }

  const token = localStorage.getItem(LS_TOKEN);
  const subdomain = localStorage.getItem(LS_SUBDOMAIN);

  const attachAuth = (r: typeof req) => {
    if (!token) {
      return r;
    }
    const bearer = `Bearer ${token}`;
    const headers: Record<string, string> = {
      Authorization: bearer,
    };
    if (subdomain) {
      headers['x-tenant-id'] = subdomain;
    }

    if (r.body instanceof FormData) {
      let h = r.headers.set('Authorization', bearer);
      if (subdomain) {
        h = h.set('x-tenant-id', subdomain);
      }
      h = h.delete('Content-Type');
      return r.clone({ headers: h });
    }

    return r.clone({ setHeaders: headers });
  };

  return next(attachAuth(req)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || req.context.get(AUTH_REFRESH_RETRIED) || isAuthBypassUrl(req.url)) {
        return throwError(() => err);
      }

      return auth.refreshSession().pipe(
        switchMap((ok) => {
          if (!ok) {
            auth.logoutLocal();
            return throwError(() => err);
          }
          const nextTok = localStorage.getItem(LS_TOKEN);
          const nextSub = localStorage.getItem(LS_SUBDOMAIN);
          if (!nextTok) {
            auth.logoutLocal();
            return throwError(() => err);
          }
          const bearer = `Bearer ${nextTok}`;
          const headers: Record<string, string> = { Authorization: bearer };
          if (nextSub) {
            headers['x-tenant-id'] = nextSub;
          }
          let retried = req.clone({
            context: req.context.set(AUTH_REFRESH_RETRIED, true),
            setHeaders: headers,
          });
          if (req.body instanceof FormData) {
            let h = retried.headers.set('Authorization', bearer);
            if (nextSub) {
              h = h.set('x-tenant-id', nextSub);
            }
            h = h.delete('Content-Type');
            retried = retried.clone({ headers: h });
          }
          return next(retried);
        })
      );
    })
  );
};
