import { HttpClient } from '@angular/common/http';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { BrandingService } from './branding.service';
import { FeatureService } from './feature.service';

const LS_TOKEN = 'school_saas_token';
const LS_REFRESH = 'school_saas_refresh_token';
const LS_SUBDOMAIN = 'school_saas_subdomain';
const LS_USER = 'school_saas_user';

interface JwtPayload {
  role?: string;
  userId?: string;
  tenant_id?: string;
  jti?: string;
  ver?: number;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(pad);
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

function bootstrapUserFromStorage(): AuthUser | null {
  const raw = localStorage.getItem(LS_USER);
  let user: AuthUser | null = null;
  if (raw) {
    try {
      user = JSON.parse(raw) as AuthUser;
    } catch {
      user = null;
    }
  }
  const token = localStorage.getItem(LS_TOKEN);
  if (!token) return user;
  const payload = decodeJwtPayload(token);
  const role = payload?.role;
  if (!role) return user;
  if (user) {
    if (!user.role) {
      const next = { ...user, role };
      localStorage.setItem(LS_USER, JSON.stringify(next));
      return next;
    }
    return user;
  }
  if (payload.userId) {
    return { id: String(payload.userId), name: '', role };
  }
  return null;
}

export interface AuthUser {
  id: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  token?: string;
  user: AuthUser;
}

export interface SignupResponse extends LoginResponse {
  tenant: { id: string; name: string; subdomain: string };
}

export interface ForgotPasswordResponse {
  message: string;
  resetToken?: string;
  expiresAt?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private features = inject(FeatureService);
  private injector = inject(Injector);

  private readonly userSignal = signal<AuthUser | null>(bootstrapUserFromStorage());

  readonly user = this.userSignal.asReadonly();

  isAuthenticated(): boolean {
    return !!this.token();
  }

  token(): string | null {
    return localStorage.getItem(LS_TOKEN);
  }

  refreshToken(): string | null {
    return localStorage.getItem(LS_REFRESH);
  }

  tenantSubdomain(): string | null {
    return localStorage.getItem(LS_SUBDOMAIN);
  }

  userRole(): string | null {
    const fromUser = this.userSignal()?.role?.trim();
    if (fromUser) return fromUser;
    const t = this.token();
    if (!t) return null;
    const fromJwt = decodeJwtPayload(t)?.role?.trim();
    return fromJwt ?? null;
  }

  resolveRoleFromLogin(res: LoginResponse): string {
    const fromUser = String(res.user?.role ?? '').trim().toLowerCase();
    if (fromUser) return fromUser;
    const access = res.accessToken ?? res.token;
    if (access) {
      return String(decodeJwtPayload(access)?.role ?? '').trim().toLowerCase();
    }
    return '';
  }

  login(subdomain: string, email: string, password: string): Observable<LoginResponse> {
    const headers = { 'x-tenant-id': subdomain.trim().toLowerCase() };
    return this.http
      .post<LoginResponse>(`${environment.apiBaseUrl}/auth/login`, { email, password }, { headers })
      .pipe(
        tap((res) => {
          this.persistSession(subdomain.trim().toLowerCase(), res);
        })
      );
  }

  signup(payload: {
    schoolName: string;
    subdomain: string;
    adminName: string;
    email: string;
    password: string;
  }): Observable<SignupResponse> {
    return this.http.post<SignupResponse>(`${environment.apiBaseUrl}/auth/signup`, payload).pipe(
      tap((res) => {
        this.persistSession(res.tenant.subdomain, res);
      })
    );
  }

  /** Exchange refresh token for a new pair. Returns whether a new access token was stored. */
  refreshSession(): Observable<boolean> {
    const subdomain = this.tenantSubdomain();
    const refresh = this.refreshToken();
    if (!subdomain || !refresh) {
      return of(false);
    }
    const headers = { 'x-tenant-id': subdomain };
    return this.http
      .post<LoginResponse>(`${environment.apiBaseUrl}/auth/refresh`, { refreshToken: refresh }, { headers })
      .pipe(
        tap((res) => {
          this.persistSession(subdomain, res);
        }),
        map(() => true),
        catchError(() => of(false))
      );
  }

  forgotPassword(subdomain: string, login: string): Observable<ForgotPasswordResponse> {
    const headers = { 'x-tenant-id': subdomain.trim().toLowerCase() };
    return this.http.post<ForgotPasswordResponse>(
      `${environment.apiBaseUrl}/auth/forgot-password`,
      { login },
      { headers }
    );
  }

  resetPassword(
    subdomain: string,
    token: string,
    newPassword: string
  ): Observable<{ message: string }> {
    const headers = { 'x-tenant-id': subdomain.trim().toLowerCase() };
    return this.http.post<{ message: string }>(
      `${environment.apiBaseUrl}/auth/reset-password`,
      { token, newPassword },
      { headers }
    );
  }

  logout(): void {
    const subdomain = this.tenantSubdomain();
    const access = this.token();
    const refresh = this.refreshToken();
    if (subdomain && access) {
      const headers: Record<string, string> = {
        'x-tenant-id': subdomain,
        Authorization: `Bearer ${access}`,
      };
      this.http
        .post<{ message: string }>(`${environment.apiBaseUrl}/auth/logout`, { refreshToken: refresh }, { headers })
        .pipe(catchError(() => of(null)))
        .subscribe(() => {
          this.logoutLocal();
        });
      return;
    }
    this.logoutLocal();
  }

  /** Clear client session only (no server call). */
  logoutLocal(): void {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_REFRESH);
    localStorage.removeItem(LS_SUBDOMAIN);
    localStorage.removeItem(LS_USER);
    this.userSignal.set(null);
    this.features.clear();
    try {
      this.injector.get(BrandingService).reset();
    } catch {
      /* optional */
    }
    void this.router.navigate(['/login']);
  }

  private accessTokenFromResponse(res: LoginResponse): string | null {
    const raw = res.accessToken ?? res.token;
    return raw && typeof raw === 'string' ? raw : null;
  }

  private persistSession(subdomain: string, res: LoginResponse): void {
    const access = this.accessTokenFromResponse(res);
    if (!access) {
      return;
    }
    let role = String(res.user?.role ?? '').trim();
    if (!role) {
      role = String(decodeJwtPayload(access)?.role ?? '').trim();
    }
    const normalized: AuthUser = {
      id: String(res.user?.id ?? ''),
      name: String(res.user?.name ?? ''),
      role,
    };
    localStorage.setItem(LS_TOKEN, access);
    localStorage.setItem(LS_SUBDOMAIN, subdomain);
    localStorage.setItem(LS_USER, JSON.stringify(normalized));
    if (res.refreshToken && typeof res.refreshToken === 'string') {
      localStorage.setItem(LS_REFRESH, res.refreshToken);
    }
    this.userSignal.set(normalized);
  }
}
