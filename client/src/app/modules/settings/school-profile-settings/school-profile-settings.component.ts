import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { SettingsService } from '@app/services';
import { ToastService } from '@app/services';

@Component({
  selector: 'app-school-profile-settings',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './school-profile-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchoolProfileSettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settings = inject(SettingsService);
  private toast = inject(ToastService);

  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    contact_email: [''],
    phone: [''],
    address: [''],
  });

  ngOnInit(): void {
    this.settings.getSchoolProfile().subscribe({
      next: (res) => {
        const d = res.data;
        this.form.patchValue({
          name: d.name,
          contact_email: d.contact_email ?? '',
          phone: d.phone ?? '',
          address: d.address ?? '',
        });
      },
      error: () => this.toast.open('Could not load school profile', 'Dismiss', { duration: 5000 }),
    });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const v = this.form.getRawValue();
    this.settings
      .updateSchoolProfile({
        name: v.name,
        contact_email: v.contact_email || null,
        phone: v.phone || null,
        address: v.address || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.open('School profile saved', 'Dismiss', { duration: 4000 });
        },
        error: (err: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.toast.open(err?.error?.message ?? 'Save failed', 'Dismiss', { duration: 5000 });
        },
      });
  }
}
