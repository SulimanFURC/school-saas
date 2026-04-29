import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly form = this.fb.nonNullable.group({
    subdomain: ['', [Validators.required, Validators.minLength(2)]],
    login: ['', [Validators.required]],
  });

  submitting = false;
  devResetToken: string | null = null;
  devExpiresAt: string | null = null;

  submit(): void {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    const { subdomain, login } = this.form.getRawValue();
    this.submitting = true;
    this.devResetToken = null;
    this.devExpiresAt = null;
    this.auth
      .forgotPassword(subdomain.trim().toLowerCase(), login.trim())
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: (res) => {
          this.toast.open(res.message, 'Dismiss', { duration: 6000 });
          if (res.resetToken) {
            this.devResetToken = res.resetToken;
            this.devExpiresAt = res.expiresAt ?? null;
          }
        },
        error: (err: { error?: { message?: string } }) => {
          const msg = err?.error?.message ?? 'Request failed';
          this.toast.open(msg, 'Dismiss', { duration: 5000 });
        },
      });
  }
}
