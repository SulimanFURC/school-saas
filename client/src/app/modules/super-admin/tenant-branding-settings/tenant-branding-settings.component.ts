import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { TenantBrandingResponse } from '../../../services/branding.service';
import type { TenantListResponse, TenantRow } from '../tenant-list/tenant-list.component';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

@Component({
  selector: 'app-tenant-branding-settings',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  templateUrl: './tenant-branding-settings.component.html',
  styleUrl: './tenant-branding-settings.component.scss',
})
export class TenantBrandingSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  readonly tenants = signal<TenantRow[]>([]);
  readonly loadingList = signal(true);
  readonly saving = signal(false);
  readonly logoPreview = signal<string | null>(null);
  private pendingFile: File | null = null;

  readonly form = this.fb.nonNullable.group({
    tenantId: ['', Validators.required],
    primaryColor: ['#1976d2', [Validators.required, Validators.pattern(HEX_RE)]],
    secondaryColor: ['#ffffff', [Validators.required, Validators.pattern(HEX_RE)]],
  });

  ngOnInit(): void {
    const params = new HttpParams().set('page', '1').set('limit', '1000');
    this.http.get<TenantListResponse>(`${environment.apiBaseUrl}/super-admin/tenants`, { params }).subscribe({
      next: (res) => {
        this.tenants.set(res.data ?? []);
        this.loadingList.set(false);
      },
      error: () => {
        this.loadingList.set(false);
        this.snackBar.open('Could not load tenants', 'Dismiss', { duration: 5000 });
      },
    });
  }

  onTenantChange(tenantId: string): void {
    this.pendingFile = null;
    this.logoPreview.set(null);
    if (!tenantId) return;
    this.http
      .get<TenantBrandingResponse>(`${environment.apiBaseUrl}/super-admin/tenant-branding/${tenantId}`)
      .subscribe({
        next: (b) => {
          this.form.patchValue({
            primaryColor: b.primaryColor,
            secondaryColor: b.secondaryColor,
          });
          if (b.logoUrl) {
            const url = `${environment.apiBaseUrl}/${b.logoUrl.replace(/^\//, '')}`;
            this.logoPreview.set(`${url}?t=${Date.now()}`);
          } else {
            this.logoPreview.set(null);
          }
        },
        error: () => {
          this.snackBar.open('Could not load branding', 'Dismiss', { duration: 5000 });
        },
      });
  }

  onFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.type !== 'image/png' || !file.name.toLowerCase().endsWith('.png')) {
      this.snackBar.open('Only PNG files are allowed', 'Dismiss', { duration: 5000 });
      return;
    }
    if (file.size > 1024 * 1024) {
      this.snackBar.open('File must be 1MB or smaller', 'Dismiss', { duration: 5000 });
      return;
    }
    this.pendingFile = file;
    const reader = new FileReader();
    reader.onload = () => this.logoPreview.set(String(reader.result));
    reader.readAsDataURL(file);
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
      if (b.logoUrl) {
        this.logoPreview.set(`${environment.apiBaseUrl}/${b.logoUrl.replace(/^\//, '')}?t=${Date.now()}`);
      }
      this.snackBar.open('Branding saved', 'Dismiss', { duration: 4000 });
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'error' in err
          ? (err as { error?: { message?: string } }).error?.message
          : undefined;
      this.snackBar.open(msg ?? 'Save failed', 'Dismiss', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }
}
