import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ColorPickerModule } from 'primeng/colorpicker';
import { FileUploadModule } from 'primeng/fileupload';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import type { FileSelectEvent, FileUploadHandlerEvent } from 'primeng/fileupload';

import { environment } from '../../../../environments/environment';
import type { TenantBrandingResponse } from '../../../services/branding.service';
import { BrandingService } from '../../../services/branding.service';
import type { TenantListResponse, TenantRow } from '../tenant-list/tenant-list.component';
import { ToastService } from '../../../services/toast.service';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** Must match server `tenantBranding.controller.js` defaults */
export const DEFAULT_PRIMARY = '#1976d2';
export const DEFAULT_SECONDARY = '#ffffff';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

function mixHex(from: string, to: string, t: number): string {
  const A = hexToRgb(from);
  const B = hexToRgb(to);
  if (!A || !B) return from;
  return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

/** Perceived brightness 0–1 — for preview text contrast on secondary background */
function luminanceFromHex(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

function paletteFromHex(base: string): string[] {
  if (!HEX_RE.test(base)) return [base, base, base, base];
  return [
    base,
    mixHex(base, '#ffffff', 0.38),
    mixHex(base, '#000000', 0.28),
    mixHex(base, '#808080', 0.35),
  ];
}

interface TenantOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-tenant-branding-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    ColorPickerModule,
    FileUploadModule,
    InputTextModule,
    MessageModule,
    SelectModule,
  ],
  templateUrl: './tenant-branding-settings.component.html',
  styleUrl: './tenant-branding-settings.component.scss',
})
export class TenantBrandingSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private brandingService = inject(BrandingService);

  readonly tenants = signal<TenantRow[]>([]);
  readonly loadingList = signal(true);
  readonly saving = signal(false);
  readonly logoPreview = signal<string | null>(null);
  readonly pendingFileMeta = signal<{ name: string; size: number } | null>(null);
  readonly selectedTenantName = signal('School');
  readonly previewPrimary = signal(DEFAULT_PRIMARY);
  readonly previewSecondary = signal(DEFAULT_SECONDARY);

  private pendingFile: File | null = null;
  private serverLogoUrl: string | null = null;

  readonly form = this.fb.nonNullable.group({
    tenantId: ['', Validators.required],
    primaryColor: [DEFAULT_PRIMARY, [Validators.required, Validators.pattern(HEX_RE)]],
    secondaryColor: [DEFAULT_SECONDARY, [Validators.required, Validators.pattern(HEX_RE)]],
  });

  readonly tenantOptions = computed((): TenantOption[] =>
    this.tenants().map((t) => ({
      label: `${t.name} (${t.subdomain})`,
      value: t.id,
    }))
  );

  /**
   * Must be driven from `valueChanges` — a plain `computed()` that reads
   * `form.controls.tenantId.value` does NOT re-run (that value is not a signal).
   */
  readonly hasTenant = toSignal(
    this.form.controls.tenantId.valueChanges.pipe(
      map((id) => typeof id === 'string' && id.length > 0)
    ),
    { initialValue: !!this.form.controls.tenantId.value }
  );

  ngOnInit(): void {
    const params = new HttpParams().set('page', '1').set('limit', '1000');
    this.http.get<TenantListResponse>(`${environment.apiBaseUrl}/super-admin/tenants`, { params }).subscribe({
      next: (res) => {
        this.tenants.set(res.data ?? []);
        this.loadingList.set(false);
      },
      error: () => {
        this.loadingList.set(false);
        this.toast.open('Could not load tenants', 'Dismiss', { duration: 5000 });
      },
    });

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.syncPreview());

    this.form.controls.tenantId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((id) => {
        if (!id) {
          this.logoPreview.set(null);
          this.pendingFile = null;
          this.pendingFileMeta.set(null);
          this.serverLogoUrl = null;
          this.selectedTenantName.set('School');
          this.brandingService.revertPreview();
          return;
        }
        this.onTenantChange(id);
      });
  }

  private syncPreview(): void {
    const v = this.form.getRawValue();
    this.previewPrimary.set(v.primaryColor || DEFAULT_PRIMARY);
    this.previewSecondary.set(v.secondaryColor || DEFAULT_SECONDARY);
    this.brandingService.previewColors(this.previewPrimary(), this.previewSecondary());
  }

  onTenantChange(tenantId: string): void {
    this.pendingFile = null;
    this.pendingFileMeta.set(null);
    this.serverLogoUrl = null;
    if (!tenantId) {
      this.logoPreview.set(null);
      return;
    }
    const t = this.tenants().find((x) => x.id === tenantId);
    this.selectedTenantName.set(t?.name?.trim() || 'School');

    this.http.get<TenantBrandingResponse>(`${environment.apiBaseUrl}/super-admin/tenant-branding/${tenantId}`).subscribe({
      next: (b) => {
        this.form.patchValue({
          primaryColor: b.primaryColor ?? b.primary_color ?? DEFAULT_PRIMARY,
          secondaryColor: b.secondaryColor ?? b.secondary_color ?? DEFAULT_SECONDARY,
        });
        this.syncPreview();
        if (b.logoUrl) {
          const url = `${environment.apiBaseUrl}/${b.logoUrl.replace(/^\//, '')}`;
          this.serverLogoUrl = url;
          this.logoPreview.set(`${url}?t=${Date.now()}`);
        } else {
          this.logoPreview.set(null);
        }
      },
      error: () => {
        this.toast.open('Could not load branding', 'Dismiss', { duration: 5000 });
      },
    });
  }

  primaryPalette(): string[] {
    return paletteFromHex(this.form.controls.primaryColor.value);
  }

  secondaryPalette(): string[] {
    return paletteFromHex(this.form.controls.secondaryColor.value);
  }

  pickPrimary(hex: string): void {
    this.form.controls.primaryColor.setValue(hex);
    this.syncPreview();
  }

  pickSecondary(hex: string): void {
    this.form.controls.secondaryColor.setValue(hex);
    this.syncPreview();
  }

  onLogoSelect(event: FileSelectEvent): void {
    const file = event.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png' || !file.name.toLowerCase().endsWith('.png')) {
      this.toast.open('Only PNG files are allowed', 'Dismiss', { duration: 5000 });
      return;
    }
    if (file.size > 1024 * 1024) {
      this.toast.open('File must be 1MB or smaller', 'Dismiss', { duration: 5000 });
      return;
    }
    this.pendingFile = file;
    this.pendingFileMeta.set({ name: file.name, size: file.size });
    const reader = new FileReader();
    reader.onload = () => this.logoPreview.set(String(reader.result));
    reader.readAsDataURL(file);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  }

  clearPendingLogo(): void {
    this.pendingFile = null;
    this.pendingFileMeta.set(null);
    if (this.serverLogoUrl) {
      const base = this.serverLogoUrl.split('?')[0];
      this.logoPreview.set(`${base}?t=${Date.now()}`);
    } else {
      this.logoPreview.set(null);
    }
  }

  onCustomLogoUpload(_event: FileUploadHandlerEvent): void {
    /* Required when customUpload is true; files are handled in onSelect. */
  }

  resetToDefaults(): void {
    this.form.patchValue({
      primaryColor: DEFAULT_PRIMARY,
      secondaryColor: DEFAULT_SECONDARY,
    });
    this.syncPreview();
    this.pendingFile = null;
    this.pendingFileMeta.set(null);
    if (this.serverLogoUrl) {
      const base = this.serverLogoUrl.split('?')[0];
      this.logoPreview.set(`${base}?t=${Date.now()}`);
    } else {
      this.logoPreview.set(null);
    }
    this.brandingService.previewColors(DEFAULT_PRIMARY, DEFAULT_SECONDARY);
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const tenantId = this.form.controls.tenantId.value;
    const { primaryColor, secondaryColor } = this.form.getRawValue();

    this.saving.set(true);
    try {
      if (this.pendingFile) {
        const fd = new FormData();
        fd.append('file', this.pendingFile);
        await firstValueFrom(
          this.http.post<{ logoUrl: string }>(
            `${environment.apiBaseUrl}/super-admin/tenant-branding/upload-logo?tenantId=${encodeURIComponent(tenantId)}`,
            fd
          )
        );
      }
      const b = await firstValueFrom(
        this.http.post<TenantBrandingResponse>(`${environment.apiBaseUrl}/super-admin/tenant-branding`, {
          tenantId,
          primaryColor,
          secondaryColor,
        })
      );
      this.pendingFile = null;
      this.pendingFileMeta.set(null);
      if (b.logoUrl) {
        const rel = `${environment.apiBaseUrl}/${b.logoUrl.replace(/^\//, '')}?t=${Date.now()}`;
        this.serverLogoUrl = rel;
        this.logoPreview.set(rel);
      }
      this.toast.open('Branding saved', 'Dismiss', { duration: 4000 });
      this.brandingService.revertPreview();
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'error' in err
          ? (err as { error?: { message?: string } }).error?.message
          : undefined;
      this.toast.open(msg ?? 'Save failed', 'Dismiss', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  cancelBranding(): void {
    this.brandingService.revertPreview();
    this.syncPreview();
  }

  /** File name shown under upload (pending selection or current server asset). */
  currentLogoLabel(): string {
    const p = this.pendingFileMeta();
    if (p) return p.name;
    if (this.serverLogoUrl) {
      try {
        const path = this.serverLogoUrl.split('?')[0];
        const seg = path.split('/').filter(Boolean).pop() ?? 'logo.png';
        return seg;
      } catch {
        return 'logo.png';
      }
    }
    return '';
  }

  showLogoFileCard(): boolean {
    return this.pendingFileMeta() != null || (this.serverLogoUrl != null && this.logoPreview() != null);
  }

  /** Foreground for mini sidebar text on secondary-colored background */
  previewSidebarFg(): string {
    return luminanceFromHex(this.previewSecondary()) > 0.55 ? '#212529' : '#ffffff';
  }

  previewSidebarMuted(): string {
    return luminanceFromHex(this.previewSecondary()) > 0.55 ? 'rgba(33, 37, 41, 0.58)' : 'rgba(255, 255, 255, 0.72)';
  }
}
