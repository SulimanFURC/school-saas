import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { SettingsService } from '@app/services';
import { ToastService } from '@app/services';
import { FormSectionComponent } from '../../../shared/form-section/form-section.component';

@Component({
  selector: 'app-change-password-settings',
  standalone: true,
  imports: [ReactiveFormsModule, FormSectionComponent],
  templateUrl: './change-password-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordSettingsComponent {
  private fb = inject(FormBuilder);
  private settings = inject(SettingsService);
  private toast = inject(ToastService);

  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [] }
  );

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    if (v.newPassword !== v.confirmPassword) {
      this.toast.open('New passwords do not match', 'Dismiss', { duration: 4000 });
      return;
    }
    this.saving.set(true);
    this.settings
      .changePassword({
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.reset();
          this.toast.open('Password updated', 'Dismiss', { duration: 4000 });
        },
        error: (err: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.toast.open(err?.error?.message ?? 'Could not update password', 'Dismiss', { duration: 5000 });
        },
      });
  }
}
