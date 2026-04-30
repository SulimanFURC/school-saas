import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiClientError } from '../models/api-client-error';

/** Same-origin check as auth interceptor so third-party URLs are untouched. */
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

function messageFromBody(err: HttpErrorResponse): string | null {
  const e = err.error;
  if (e != null && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  if (typeof e === 'string' && e.trim()) return e.trim();
  return null;
}

function detailsFromBody(err: HttpErrorResponse): unknown {
  const e = err.error;
  if (e != null && typeof e === 'object' && 'details' in e) {
    return (e as { details?: unknown }).details;
  }
  return undefined;
}

function fallbackMessage(status: number): string {
  switch (status) {
    case 0:
      return 'Network error — please check your connection.';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Validation failed';
    case 500:
      return 'Internal server error';
    default:
      return 'Request failed';
  }
}

/**
 * Maps failed API responses to {@link ApiClientError} for consistent handling in services and components.
 * Registered **before** {@link authInterceptor} so 401 refresh runs on the raw {@link HttpErrorResponse} first.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  if (!sameApiOrigin(req.url)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        return throwError(() => err);
      }
      const bodyMsg = messageFromBody(err);
      const message = bodyMsg ?? fallbackMessage(err.status);
      const normalized = new ApiClientError(message, {
        status: err.status,
        url: err.url ?? undefined,
        details: detailsFromBody(err),
      });
      return throwError(() => normalized);
    })
  );
};
