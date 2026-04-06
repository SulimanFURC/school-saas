import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, from, map, of, switchMap, tap } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import { BrandingService } from '../../../services/branding.service';
import { FeatureService } from '../../../services/feature.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private features = inject(FeatureService);
  private branding = inject(BrandingService);

  readonly form = this.fb.nonNullable.group({
    subdomain: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  submitting = false;

  submit(): void {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    const { subdomain, email, password } = this.form.getRawValue();
    this.submitting = true;
    this.auth
      .login(subdomain, email, password)
      .pipe(
        switchMap((loginRes) => {
          const role = this.auth.resolveRoleFromLogin(loginRes);
          if (role === 'super_admin') {
            return of(loginRes);
          }
          return from(this.features.loadForCurrentTenant().catch(() => undefined)).pipe(
            switchMap(() => from(this.branding.loadForCurrentTenant().catch(() => undefined))),
            map(() => loginRes)
          );
        }),
        tap((loginRes) => {
          const returnUrl = this.route.snapshot.queryParams['returnUrl'] as string | undefined;
          const role = this.auth.resolveRoleFromLogin(loginRes);
          if (role === 'super_admin') {
            this.branding.reset();
          }
          let target = '/';
          if (role === 'super_admin') {
            target = '/super-admin/tenants';
          } else if (
            returnUrl &&
            returnUrl.startsWith('/') &&
            !returnUrl.startsWith('//')
          ) {
            target = returnUrl;
          }
          void this.router.navigateByUrl(target);
        }),
        finalize(() => {
          this.submitting = false;
        })
      )
      .subscribe({
        error: (err: { error?: { message?: string } }) => {
          const msg = err?.error?.message ?? 'Sign in failed';
          this.toast.open(msg, 'Dismiss', { duration: 5000 });
        },
      });
  }
}
