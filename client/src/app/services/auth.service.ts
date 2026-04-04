import { HttpClient } from '@angular/common/http';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { FeatureService } from './feature.service';
import { BrandingService } from './branding.service';

const LS_TOKEN = 'school_saas_token';
const LS_SUBDOMAIN = 'school_saas_subdomain';
const LS_USER = 'school_saas_user';

interface JwtPayload {
  role?: string;
  userId?: string;
  tenant_id?: string;
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
  token: string;
  user: AuthUser;
}

export interface SignupResponse extends LoginResponse {
  tenant: { id: string; name: string; subdomain: string };
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

  /** Prefer API user.role; fall back to JWT payload (same login response). */
  resolveRoleFromLogin(res: LoginResponse): string {
    const fromUser = String(res.user?.role ?? '').trim().toLowerCase();
    if (fromUser) return fromUser;
    return String(decodeJwtPayload(res.token)?.role ?? '').trim().toLowerCase();
  }

  login(subdomain: string, email: string, password: string): Observable<LoginResponse> {
    const headers = { 'x-tenant-id': subdomain.trim().toLowerCase() };
    return this.http
      .post<LoginResponse>(`${environment.apiBaseUrl}/auth/login`, { email, password }, { headers })
      .pipe(
        tap((res) => {
          this.persistSession(res.token, subdomain.trim().toLowerCase(), res.user);
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
        this.persistSession(res.token, res.tenant.subdomain, res.user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(LS_TOKEN);
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

  private persistSession(token: string, subdomain: string, user: AuthUser): void {
    let role = String(user?.role ?? '').trim();
    if (!role) {
      role = String(decodeJwtPayload(token)?.role ?? '').trim();
    }
    const normalized: AuthUser = {
      id: String(user?.id ?? ''),
      name: String(user?.name ?? ''),
      role,
    };
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_SUBDOMAIN, subdomain);
    localStorage.setItem(LS_USER, JSON.stringify(normalized));
    this.userSignal.set(normalized);
  }

}
