import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { SettingsService, type PlatformSettingsDto } from '@app/services';
import { ToastService } from '@app/services';

@Component({
  selector: 'app-platform-settings',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './platform-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformSettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settings = inject(SettingsService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    platform_name: ['', [Validators.required]],
    support_email: [''],
    max_tenants_allowed: [100, [Validators.required, Validators.min(1)]],
  });

  ngOnInit(): void {
    this.settings.getPlatformSettings().subscribe({
      next: (res) => {
        const d = res.data;
        this.form.patchValue({
          platform_name: d.platform_name,
          support_email: d.support_email,
          max_tenants_allowed: d.max_tenants_allowed,
        });
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.open('Could not load platform settings', 'Dismiss', { duration: 5000 });
      },
    });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const v = this.form.getRawValue() as PlatformSettingsDto;
    this.settings.updatePlatformSettings(v).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.open('Platform settings saved', 'Dismiss', { duration: 4000 });
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.toast.open(err?.error?.message ?? 'Save failed', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
