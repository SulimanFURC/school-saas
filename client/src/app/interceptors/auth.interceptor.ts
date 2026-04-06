import { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '../../environments/environment';

const LS_TOKEN = 'school_saas_token';
const LS_SUBDOMAIN = 'school_saas_subdomain';

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

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!sameApiOrigin(req.url)) {
    return next(req);
  }

  // Login must not send a stale Bearer token or overwrite x-tenant-id from the form.
  if (req.url.includes('/auth/signup') || req.url.includes('/auth/login')) {
    return next(req);
  }

  const token = localStorage.getItem(LS_TOKEN);
  const subdomain = localStorage.getItem(LS_SUBDOMAIN);

  // Always attach Bearer when logged in so JWT resolves tenant (admin). Requiring
  // subdomain blocked auth when localStorage lost subdomain and broke API calls.
  if (!token) {
    return next(req);
  }

  const bearer = `Bearer ${token}`;
  const headers: Record<string, string> = {
    Authorization: bearer,
  };
  if (subdomain) {
    headers['x-tenant-id'] = subdomain;
  }

  // FormData must be sent with a browser-generated multipart boundary. Cloning with
  // setHeaders can preserve a wrong Content-Type and break multer (no file, 400/500).
  if (req.body instanceof FormData) {
    let h = req.headers.set('Authorization', bearer);
    if (subdomain) {
      h = h.set('x-tenant-id', subdomain);
    }
    h = h.delete('Content-Type');
    return next(req.clone({ headers: h }));
  }

  return next(req.clone({ setHeaders: headers }));
};
