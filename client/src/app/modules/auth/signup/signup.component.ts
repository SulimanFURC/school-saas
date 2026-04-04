import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize, from, switchMap, tap } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import { BrandingService } from '../../../services/branding.service';
import { FeatureService } from '../../../services/feature.service';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirm = control.get('confirmPassword')?.value;
  if (password !== confirm) {
    return { passwordsMismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-signup',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss',
})
export class SignupComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private features = inject(FeatureService);
  private branding = inject(BrandingService);

  readonly form = this.fb.nonNullable.group(
    {
      schoolName: ['', [Validators.required, Validators.minLength(2)]],
      subdomain: ['', [Validators.required, Validators.minLength(2)]],
      adminName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [passwordsMatch] }
  );

  submitting = false;

  submit(): void {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.submitting = true;
    this.auth
      .signup({
        schoolName: v.schoolName,
        subdomain: v.subdomain.trim().toLowerCase(),
        adminName: v.adminName,
        email: v.email,
        password: v.password,
      })
      .pipe(
        switchMap(() =>
          from(this.features.loadForCurrentTenant().catch(() => undefined)).pipe(
            switchMap(() => from(this.branding.loadForCurrentTenant().catch(() => undefined)))
          )
        ),
        tap(() => {
          void this.router.navigateByUrl('/');
        }),
        finalize(() => {
          this.submitting = false;
        })
      )
      .subscribe({
        error: (err: { error?: { message?: string } }) => {
          const msg = err?.error?.message ?? 'Sign up failed';
          this.snackBar.open(msg, 'Dismiss', { duration: 5000 });
        },
      });
  }
}
