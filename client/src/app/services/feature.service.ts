import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, tap } from 'rxjs';

import { environment } from '../../environments/environment';

export interface TenantModuleRow {
  module_key: string;
  name: string;
  group: string | null;
  is_enabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class FeatureService {
  private http = inject(HttpClient);

  private readonly enabledKeys = signal<Set<string>>(new Set());

  readonly enabled = this.enabledKeys.asReadonly();

  isEnabled(moduleKey: string): boolean {
    return this.enabledKeys().has(moduleKey);
  }

  setFromApiResponse(rows: TenantModuleRow[]): void {
    const next = new Set<string>();
    for (const r of rows) {
      if (r.is_enabled) next.add(r.module_key);
    }
    this.enabledKeys.set(next);
  }

  async loadForCurrentTenant(): Promise<void> {
    await firstValueFrom(
      this.http.get<TenantModuleRow[]>(`${environment.apiBaseUrl}/modules`).pipe(
        tap((list) => this.setFromApiResponse(list))
      )
    );
  }

  clear(): void {
    this.enabledKeys.set(new Set());
  }
}
