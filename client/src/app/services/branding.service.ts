import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

import { environment } from '../../environments/environment';

export interface TenantBrandingResponse {
  tenantId?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  logoUrl?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  logo_url?: string | null;
  usesDefaults?: boolean;
  tenantName?: string;
  tenantAddress?: string | null;
  tenantContactEmail?: string | null;
}

interface TenantBranding {
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
}

const STORAGE_KEY = 'school_saas_branding';
const DEFAULTS: { primaryColor: string; secondaryColor: string; logoUrl: null } = {
  primaryColor: '#4F46E5',
  secondaryColor: '#0EA5E9',
  logoUrl: null,
};

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private http = inject(HttpClient);
  private document = inject(DOCUMENT);

  private readonly primarySig = signal<string>(DEFAULTS.primaryColor);
  private readonly secondarySig = signal<string>(DEFAULTS.secondaryColor);
  private readonly logoRelativeSig = signal<string | null>(DEFAULTS.logoUrl);
  private readonly tenantNameSig = signal<string>('');
  private readonly tenantAddressSig = signal<string | null>(null);
  private readonly tenantContactEmailSig = signal<string | null>(null);
  readonly isLoaded = signal(false);

  readonly primaryColor = this.primarySig.asReadonly();
  readonly secondaryColor = this.secondarySig.asReadonly();
  readonly logoUrl = this.logoRelativeSig.asReadonly();
  readonly tenantName = this.tenantNameSig.asReadonly();
  readonly tenantAddress = this.tenantAddressSig.asReadonly();
  readonly tenantContactEmail = this.tenantContactEmailSig.asReadonly();

  constructor() {
    this.applyFromCache();
  }

  loadBranding(): void {
    this.applyFromCache();
    this.http
      .get<TenantBrandingResponse>(`${environment.apiBaseUrl}/tenant-branding`)
      .pipe(
        catchError(() => {
          this.isLoaded.set(true);
          return of(null);
        })
      )
      .subscribe((data) => {
        if (!data) {
          return;
        }
        const branding: TenantBranding = {
          primaryColor: data.primary_color ?? data.primaryColor ?? null,
          secondaryColor: data.secondary_color ?? data.secondaryColor ?? null,
          logoUrl: data.logo_url ?? data.logoUrl ?? null,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(branding));
        this.apply(branding);
        this.tenantNameSig.set(data.tenantName ?? '');
        this.tenantAddressSig.set(data.tenantAddress ?? null);
        this.tenantContactEmailSig.set(data.tenantContactEmail ?? null);
        this.isLoaded.set(true);
      });
  }

  previewColors(primary: string, secondary: string): void {
    const p = this.normalizeHexOrFallback(primary, DEFAULTS.primaryColor);
    const s = this.normalizeHexOrFallback(secondary, DEFAULTS.secondaryColor);
    this.applyColorTokens(p, s);
    this.primarySig.set(p);
    this.secondarySig.set(s);
  }

  revertPreview(): void {
    this.applyFromCache();
  }

  resetToDefaults(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.apply({ primaryColor: null, secondaryColor: null, logoUrl: null });
    this.tenantNameSig.set('');
    this.tenantAddressSig.set(null);
    this.tenantContactEmailSig.set(null);
    this.isLoaded.set(false);
  }

  // Backward-compat aliases used by existing callers.
  async loadForCurrentTenant(): Promise<void> {
    this.loadBranding();
  }

  reset(): void {
    this.resetToDefaults();
  }

  private applyFromCache(): void {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) {
      this.apply({ primaryColor: null, secondaryColor: null, logoUrl: null });
      return;
    }
    try {
      const branding = JSON.parse(cached) as TenantBranding;
      this.apply(branding);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      this.apply({ primaryColor: null, secondaryColor: null, logoUrl: null });
    }
  }

  private apply(branding: TenantBranding): void {
    const primary = this.normalizeHexOrFallback(branding.primaryColor, DEFAULTS.primaryColor);
    const secondary = this.normalizeHexOrFallback(branding.secondaryColor, DEFAULTS.secondaryColor);
    this.applyColorTokens(primary, secondary);
    this.logoRelativeSig.set(branding.logoUrl ?? null);
    this.primarySig.set(primary);
    this.secondarySig.set(secondary);
  }

  private applyColorTokens(primary: string, secondary: string): void {
    const html = this.document.documentElement;

    html.style.setProperty('--tenant-primary', primary);
    html.style.setProperty('--tenant-primary-hover', this.darken(primary, 10));
    html.style.setProperty('--tenant-primary-light', this.lighten(primary, 90));
    html.style.setProperty('--tenant-primary-dark', this.darken(primary, 20));

    html.style.setProperty('--tenant-secondary', secondary);
    html.style.setProperty('--tenant-secondary-hover', this.darken(secondary, 10));
    html.style.setProperty('--tenant-secondary-light', this.lighten(secondary, 90));
    html.style.setProperty('--tenant-secondary-dark', this.darken(secondary, 20));

    html.style.setProperty('--p-primary-color', primary);
    html.style.setProperty('--p-primary-hover-color', this.darken(primary, 10));
    html.style.setProperty('--p-primary-active-color', this.darken(primary, 15));
    html.style.setProperty('--p-button-primary-background', primary);
    html.style.setProperty('--p-button-primary-hover-background', this.darken(primary, 10));
    html.style.setProperty('--p-button-primary-active-background', this.darken(primary, 15));
    html.style.setProperty('--p-button-primary-border-color', primary);
    html.style.setProperty('--p-button-primary-hover-border-color', this.darken(primary, 10));
  }

  private normalizeHexOrFallback(value: string | null | undefined, fallback: string): string {
    const hex = this.normalizeHex(value ?? '');
    return hex ?? fallback;
  }

  private normalizeHex(value: string): string | null {
    const candidate = value.trim();
    if (!candidate) return null;
    const match = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.exec(candidate);
    if (!match) return null;
    if (match[1].length === 3) {
      const [r, g, b] = match[1].split('');
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return `#${match[1].toUpperCase()}`;
  }

  private darken(hex: string, amount: number): string {
    const { r, g, b } = this.hexToRgb(hex);
    const factor = 1 - amount / 100;
    return this.rgbToHex(
      Math.max(0, Math.round(r * factor)),
      Math.max(0, Math.round(g * factor)),
      Math.max(0, Math.round(b * factor))
    );
  }

  private lighten(hex: string, amount: number): string {
    const { r, g, b } = this.hexToRgb(hex);
    const factor = amount / 100;
    return this.rgbToHex(
      Math.min(255, Math.round(r + (255 - r) * factor)),
      Math.min(255, Math.round(g + (255 - g) * factor)),
      Math.min(255, Math.round(b + (255 - b) * factor))
    );
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '').padEnd(6, '0');
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
}
