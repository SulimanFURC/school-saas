import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SettingsService, type NotificationPreferencesDto } from '../../../services/settings.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-notification-preferences-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './notification-preferences-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPreferencesSettingsComponent implements OnInit {
  private settings = inject(SettingsService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly saving = signal(false);

  model: NotificationPreferencesDto = {
    email_notifications: false,
    sms_notifications: false,
    in_app_notifications: true,
  };

  ngOnInit(): void {
    this.settings.getNotificationPreferences().subscribe({
      next: (res) => {
        this.model = { ...res.data };
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.open('Could not load preferences', 'Dismiss', { duration: 5000 });
      },
    });
  }

  save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.settings.updateNotificationPreferences(this.model).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.open('Preferences saved', 'Dismiss', { duration: 4000 });
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.toast.open(err?.error?.message ?? 'Save failed', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
