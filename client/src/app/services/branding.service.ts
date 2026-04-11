import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

const LS_TOKEN = 'school_saas_token';

export interface TenantBrandingResponse {
  tenantId: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  usesDefaults?: boolean;
  tenantName?: string;
  tenantAddress?: string | null;
  tenantContactEmail?: string | null;
}

const DEFAULT_PRIMARY = '#1976d2';
const DEFAULT_SECONDARY = '#ffffff';

function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(pad);
    const payload = JSON.parse(atob(padded)) as { role?: string };
    return payload.role?.trim().toLowerCase() ?? null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private http = inject(HttpClient);

  private readonly primarySig = signal<string>(DEFAULT_PRIMARY);
  private readonly secondarySig = signal<string>(DEFAULT_SECONDARY);
  private readonly logoRelativeSig = signal<string | null>(null);
  private readonly tenantNameSig = signal<string>('');
  private readonly tenantAddressSig = signal<string | null>(null);
  private readonly tenantContactEmailSig = signal<string | null>(null);

  readonly primaryColor = this.primarySig.asReadonly();
  readonly secondaryColor = this.secondarySig.asReadonly();
  readonly logoUrl = this.logoRelativeSig.asReadonly();
  readonly tenantName = this.tenantNameSig.asReadonly();
  readonly tenantAddress = this.tenantAddressSig.asReadonly();
  readonly tenantContactEmail = this.tenantContactEmailSig.asReadonly();

  async loadForCurrentTenant(): Promise<void> {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_TOKEN) : null;
    if (!token) {
      this.reset();
      return;
    }
    if (decodeJwtRole(token) === 'super_admin') {
      this.reset();
      return;
    }
    try {
      const data = await firstValueFrom(
        this.http.get<TenantBrandingResponse>(`${environment.apiBaseUrl}/tenant-branding`)
      );
      this.apply(data);
    } catch {
      this.applyDefaultsOnly();
    }
  }

  apply(data: TenantBrandingResponse): void {
    const primary = data.primaryColor || DEFAULT_PRIMARY;
    const secondary = data.secondaryColor || DEFAULT_SECONDARY;
    this.primarySig.set(primary);
    this.secondarySig.set(secondary);
    this.logoRelativeSig.set(data.logoUrl ?? null);
    this.tenantNameSig.set(data.tenantName != null && data.tenantName !== '' ? data.tenantName : '');
    this.tenantAddressSig.set(data.tenantAddress ?? null);
    this.tenantContactEmailSig.set(data.tenantContactEmail ?? null);

    document.documentElement.style.setProperty('--primary-color', primary);
    document.documentElement.style.setProperty('--secondary-color', secondary);
    document.documentElement.classList.add('tenant-branding-active');
  }

  /** When API fails: still apply default chrome colors for tenant shell. */
  private applyDefaultsOnly(): void {
    this.primarySig.set(DEFAULT_PRIMARY);
    this.secondarySig.set(DEFAULT_SECONDARY);
    this.logoRelativeSig.set(null);
    this.tenantNameSig.set('');
    this.tenantAddressSig.set(null);
    this.tenantContactEmailSig.set(null);
    document.documentElement.style.setProperty('--primary-color', DEFAULT_PRIMARY);
    document.documentElement.style.setProperty('--secondary-color', DEFAULT_SECONDARY);
    document.documentElement.classList.add('tenant-branding-active');
  }

  reset(): void {
    this.primarySig.set(DEFAULT_PRIMARY);
    this.secondarySig.set(DEFAULT_SECONDARY);
    this.logoRelativeSig.set(null);
    this.tenantNameSig.set('');
    this.tenantAddressSig.set(null);
    this.tenantContactEmailSig.set(null);
    document.documentElement.style.removeProperty('--primary-color');
    document.documentElement.style.removeProperty('--secondary-color');
    document.documentElement.classList.remove('tenant-branding-active');
  }
}
