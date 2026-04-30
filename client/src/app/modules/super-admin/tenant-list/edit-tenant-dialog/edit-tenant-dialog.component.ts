import { CommonModule } from '@angular/common';
import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';

import { environment } from '../../../../../environments/environment';
import { ToastService } from '@app/services';

interface TenantDetail {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  contact_email: string | null;
  phone: string | null;
  address: string | null;
}

@Component({
  selector: 'app-edit-tenant-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule],
  templateUrl: './edit-tenant-dialog.component.html',
  styleUrl: './edit-tenant-dialog.component.scss',
})
export class EditTenantDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  readonly tenantId = input.required<string>();
  readonly closed = output<boolean>();

  readonly visible = signal(false);
  readonly loading = signal(true);
  readonly subdomain = signal<string>('');

  submitting = false;
  private pendingResult: boolean | null = null;

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
    contact_email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.maxLength(50)],
    address: ['', Validators.maxLength(5000)],
    status: ['', Validators.required],
  });

  ngOnInit(): void {
    queueMicrotask(() => this.visible.set(true));
    this.loadTenant();
  }

  private loadTenant(): void {
    this.loading.set(true);
    this.http
      .get<{ tenant: TenantDetail }>(`${environment.apiBaseUrl}/super-admin/tenants/${this.tenantId()}`)
      .subscribe({
        next: (res) => {
          const t = res.tenant;
          this.subdomain.set(t.subdomain ?? '');
          this.form.patchValue({
            name: t.name ?? '',
            contact_email: t.contact_email ?? '',
            phone: t.phone ?? '',
            address: t.address ?? '',
            status: (t.status ?? '').toLowerCase(),
          });
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          const msg = err?.error?.message || 'Could not load tenant';
          this.toast.open(msg, 'Dismiss', { duration: 5000 });
          this.pendingResult = false;
          this.visible.set(false);
        },
      });
  }

  onHide(): void {
    this.closed.emit(this.pendingResult === true);
    this.pendingResult = null;
  }

  cancel(): void {
    if (this.submitting) return;
    this.pendingResult = false;
    this.visible.set(false);
  }

  submit(): void {
    if (this.submitting || this.loading()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    this.submitting = true;
    this.http
      .patch(`${environment.apiBaseUrl}/super-admin/tenants/${this.tenantId()}`, {
        name: v.name?.trim(),
        contact_email: v.contact_email?.trim(),
        phone: v.phone?.trim() ?? '',
        address: v.address?.trim() ?? '',
        status: v.status,
      })
      .subscribe({
        next: () => {
          this.submitting = false;
          this.toast.open('Tenant updated', 'Dismiss', { duration: 4000 });
          this.pendingResult = true;
          this.visible.set(false);
        },
        error: (err) => {
          this.submitting = false;
          const msg =
            err?.error?.message ||
            (typeof err?.error === 'string' ? err.error : null) ||
            'Could not update tenant';
          this.toast.open(msg, 'Dismiss', { duration: 6000 });
        },
      });
  }
}
