import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DrawerModule } from 'primeng/drawer';

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
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DrawerModule],
  templateUrl: './create-tenant-dialog.component.html',
  styleUrl: './create-tenant-dialog.component.scss',
})
export class CreateTenantDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  readonly closed = output<boolean>();

  readonly visible = signal(false);
  submitting = false;
  private pendingResult: boolean | null = null;

  readonly form = this.fb.group(
    {
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      subdomain: ['', Validators.required],
      contact_email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.maxLength(50)],
      address: ['', Validators.maxLength(5000)],
      status: ['', Validators.required],
      adminName: ['', Validators.required],
      adminEmail: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      passwordConfirm: ['', Validators.required],
    },
    { validators: passwordsMatch }
  );

  ngOnInit(): void {
    queueMicrotask(() => this.visible.set(true));
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
          this.pendingResult = true;
          this.visible.set(false);
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
