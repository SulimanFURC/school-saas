import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface PermissionSnapshot {
  role: string;
  permissions: string[];
}

@Injectable({ providedIn: 'root' })
export class AuthorizationService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly permissionSetSig = signal<Set<string>>(new Set());
  private readonly loadedSig = signal(false);

  readonly loaded = this.loadedSig.asReadonly();

  loadMyPermissions() {
    if (!this.auth.isAuthenticated()) {
      this.permissionSetSig.set(new Set());
      this.loadedSig.set(true);
      return of({ role: '', permissions: [] } as PermissionSnapshot);
    }
    return this.http
      .get<{ data: PermissionSnapshot }>(`${environment.apiBaseUrl}/roles/me`)
      .pipe(
        map((res) => {
          const data = res?.data ?? { role: '', permissions: [] };
          this.permissionSetSig.set(new Set(data.permissions || []));
          this.loadedSig.set(true);
          return data;
        }),
        catchError(() => {
          this.permissionSetSig.set(new Set());
          this.loadedSig.set(true);
          return of({ role: '', permissions: [] });
        })
      );
  }

  reset(): void {
    this.permissionSetSig.set(new Set());
    this.loadedSig.set(false);
  }

  hasPermission(code: string): boolean {
    if (!code) return true;
    const role = (this.auth.userRole() ?? '').toLowerCase();
    if (role === 'admin' || role === 'super_admin') return true;
    const set = this.permissionSetSig();
    return set.has('*') || set.has(code);
  }

  hasModuleRead(moduleKey?: string): boolean {
    if (!moduleKey) return true;
    return this.hasPermission(`${moduleKey}.read`);
  }
}

