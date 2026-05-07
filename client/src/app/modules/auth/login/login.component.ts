import { Component, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { finalize, from, map, of, switchMap, tap } from 'rxjs';

import { isApiClientError } from '../../../models/api-client-error';
import { AuthService } from '@app/services';
import { AuthorizationService } from '@app/services';
import { FeatureService } from '@app/services';
import { ToastService } from '@app/services';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    CardModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    CheckboxModule,
  ],
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
  private authorization = inject(AuthorizationService);

  readonly form = this.fb.nonNullable.group({
    subdomain: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  submitting = false;
  statusMessage: string | null = null;

  /** UI-only; not sent with login. */
  rememberMe = false;

  private isTenantStatusMessage(message: string): boolean {
    const normalized = message.trim().toLowerCase();
    return (
      normalized === 'your school account is inactive. please contact your administrator.' ||
      normalized === 'your school account is pending approval. please try again later.'
    );
  }

  submit(): void {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    const { subdomain, email, password } = this.form.getRawValue();
    this.submitting = true;
    this.statusMessage = null;
    this.auth
      .login(subdomain, email, password)
      .pipe(
        switchMap((loginRes) => {
          const role = this.auth.resolveRoleFromLogin(loginRes);
          if (role === 'super_admin') {
            return of(loginRes);
          }
          return from(this.features.loadForCurrentTenant().catch(() => undefined)).pipe(
            switchMap(() => this.authorization.loadMyPermissions()),
            map(() => loginRes)
          );
        }),
        tap((loginRes) => {
          const returnUrl = this.route.snapshot.queryParams['returnUrl'] as string | undefined;
          const role = this.auth.resolveRoleFromLogin(loginRes);
          let target = '/';
          if (role === 'super_admin') {
            target = '/super-admin/dashboard';
          } else if (role === 'teacher') {
            target = '/teachers/dashboard';
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
        error: (err: unknown) => {
          const msg =
            (isApiClientError(err) ? err.message : null) ||
            (err as { error?: { message?: string } } | null)?.error?.message ||
            'Sign in failed';
          if (this.isTenantStatusMessage(msg)) {
            this.statusMessage = msg;
            return;
          }
          this.toast.open(msg, 'Dismiss', { duration: 5000 });
        },
      });
  }
}
