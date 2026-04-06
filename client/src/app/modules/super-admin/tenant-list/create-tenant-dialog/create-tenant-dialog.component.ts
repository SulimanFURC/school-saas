import { Component, inject, output } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../../../environments/environment';
import { ToastService } from '../../../../services/toast.service';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const p = group.get('password')?.value;
  const c = group.get('passwordConfirm')?.value;
  if (p == null && c == null) return null;
  if (p !== c) return { passwordMismatch: true };
  return null;
}

@Component({
  selector: 'app-create-tenant-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './create-tenant-dialog.component.html',
  styleUrl: './create-tenant-dialog.component.scss',
})
export class CreateTenantDialogComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  readonly closed = output<boolean>();

  submitting = false;

  readonly form = this.fb.group(
    {
      name: ['', [Validators.required, Validators.maxLength(200)]],
      subdomain: ['', Validators.required],
      contact_email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.maxLength(50)],
      address: ['', Validators.maxLength(5000)],
      status: ['active', Validators.required],
      adminName: ['', Validators.required],
      adminEmail: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      passwordConfirm: ['', Validators.required],
    },
    { validators: passwordsMatch }
  );

  cancel(): void {
    this.closed.emit(false);
  }

  submit(): void {
    if (this.submitting) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    this.submitting = true;
    this.http
      .post(`${environment.apiBaseUrl}/super-admin/tenants`, {
        name: v.name?.trim(),
        subdomain: v.subdomain?.trim(),
        contact_email: v.contact_email?.trim(),
        phone: v.phone?.trim() || undefined,
        address: v.address?.trim() || undefined,
        status: v.status,
        adminName: v.adminName?.trim(),
        adminEmail: v.adminEmail?.trim(),
        password: v.password,
      })
      .subscribe({
        next: () => {
          this.submitting = false;
          this.toast.open('Tenant created', 'Dismiss', { duration: 4000 });
          this.closed.emit(true);
        },
        error: (err) => {
          this.submitting = false;
          const msg =
            err?.error?.message ||
            (typeof err?.error === 'string' ? err.error : null) ||
            'Could not create tenant';
          this.toast.open(msg, 'Dismiss', { duration: 6000 });
        },
      });
  }
}
