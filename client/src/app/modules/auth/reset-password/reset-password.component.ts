import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const a = control.get('newPassword')?.value;
  const b = control.get('confirmPassword')?.value;
  if (a !== b) return { passwordsMismatch: true };
  return null;
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly form = this.fb.nonNullable.group(
    {
      subdomain: ['', [Validators.required, Validators.minLength(2)]],
      token: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [passwordsMatch] }
  );

  submitting = false;

  constructor() {
    const qp = this.route.snapshot.queryParamMap.get('token');
    if (qp) {
      this.form.patchValue({ token: qp });
    }
  }

  submit(): void {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    const { subdomain, token, newPassword } = this.form.getRawValue();
    this.submitting = true;
    this.auth
      .resetPassword(subdomain.trim().toLowerCase(), token.trim(), newPassword)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: (res) => {
          this.toast.open(res.message, 'Dismiss', { duration: 5000 });
          void this.router.navigate(['/login'], {
            queryParams: { subdomain: subdomain.trim().toLowerCase() },
          });
        },
        error: (err: { error?: { message?: string } }) => {
          const msg = err?.error?.message ?? 'Reset failed';
          this.toast.open(msg, 'Dismiss', { duration: 5000 });
        },
      });
  }
}
