import { Component, inject, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-teacher-login-credentials-modal',
  standalone: true,
  imports: [DialogModule, ButtonModule, InputTextModule],
  templateUrl: './teacher-login-credentials-modal.component.html',
  styleUrl: './teacher-login-credentials-modal.component.scss',
})
export class TeacherLoginCredentialsModalComponent {
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  /** Portal sign-in identifier (username). */
  username = input.required<string>();
  /** Plaintext password (only valid until this dialog is closed). */
  password = input.required<string>();
  /** When true, explain that the previous password no longer works. */
  wasReset = input<boolean>(false);

  dismissed = output<void>();

  /** Bound to PrimeNG Dialog visibility; closing emits `dismissed` from `onDialogHide`. */
  dialogVisible = true;

  close(): void {
    this.dialogVisible = false;
  }

  onDialogHide(): void {
    this.dismissed.emit();
  }

  shareSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  }

  private buildLoginText(): string {
    const sub = this.auth.tenantSubdomain()?.trim() || '(school subdomain)';
    const origin =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const lines = [
      'School portal login — keep this private',
      `Sign-in page: ${origin || '(open your school app URL)'}/login`,
      `School subdomain: ${sub}`,
      `Username: ${this.username()}`,
      `Password: ${this.password()}`,
    ];
    return lines.join('\n');
  }

  async copyPassword(): Promise<void> {
    await this.copyToClipboard(this.password(), 'Password copied');
  }

  async copyUsername(): Promise<void> {
    await this.copyToClipboard(this.username(), 'Username copied');
  }

  async copyLoginDetails(): Promise<void> {
    await this.copyToClipboard(this.buildLoginText(), 'Login details copied');
  }

  private async copyToClipboard(text: string, okMsg: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.open(okMsg, 'Dismiss', { duration: 3000 });
    } catch {
      this.fallbackCopy(text, okMsg);
    }
  }

  private fallbackCopy(text: string, okMsg: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      this.toast.open(okMsg, 'Dismiss', { duration: 3000 });
    } catch {
      this.toast.open('Could not copy automatically — select and copy manually.', 'Dismiss', {
        duration: 5000,
      });
    }
    document.body.removeChild(ta);
  }

  async shareLoginDetails(): Promise<void> {
    const text = this.buildLoginText();
    if (this.shareSupported()) {
      try {
        await navigator.share({
          title: 'School portal login',
          text,
        });
        return;
      } catch (e) {
        const name = e instanceof DOMException ? e.name : (e as Error)?.name;
        if (name === 'AbortError') {
          return;
        }
      }
    }
    await this.copyLoginDetails();
  }
}
