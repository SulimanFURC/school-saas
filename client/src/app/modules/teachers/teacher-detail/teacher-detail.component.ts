import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { TeacherDetail, TeacherService } from '../../../services/teacher.service';
import { ConfirmDialogService } from '../../../services/confirm-dialog.service';
import { ToastService } from '../../../services/toast.service';
import { TeacherLoginCredentialsModalComponent } from '../../../shared/teacher-login-credentials-modal/teacher-login-credentials-modal.component';

@Component({
  selector: 'app-teacher-detail',
  imports: [RouterLink, TeacherLoginCredentialsModalComponent],
  templateUrl: './teacher-detail.component.html',
  styleUrl: './teacher-detail.component.scss',
})
export class TeacherDetailComponent implements OnInit {
  private api = inject(TeacherService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);

  readonly apiBase = environment.apiBaseUrl.replace(/\/+$/, '');

  loading = signal(true);
  teacher = signal<TeacherDetail | null>(null);
  teacherId = signal('');

  /** Shown after create-on-detail is not used here; set after password reset or when revealing new password. */
  loginCredentials = signal<{ username: string; password: string; wasReset: boolean } | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.teacherId.set(id);
    if (!id) {
      void this.router.navigate(['/teachers']);
      return;
    }
    this.load(id);
  }

  load(id: string): void {
    this.loading.set(true);
    this.api
      .getById(id)
      .pipe(
        catchError((e) => {
          this.toast.open(e.error?.message || 'Failed to load teacher', 'Dismiss', { duration: 5000 });
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (t) => this.teacher.set(t),
      });
  }

  displayName(t: TeacherDetail): string {
    return `${t.first_name} ${t.last_name}`.trim();
  }

  cvHref(t: TeacherDetail): string | null {
    const u = t.cv_file_url;
    if (!u) return null;
    const path = u.startsWith('/') ? u : `/${u}`;
    return `${this.apiBase}${path}`;
  }

  photoSrc(t: TeacherDetail): string | null {
    if (t.photo_base64 && t.photo_mime) {
      return `data:${t.photo_mime};base64,${t.photo_base64}`;
    }
    return null;
  }

  onCvSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    const id = this.teacherId();
    if (!file || !id) return;
    this.api.uploadCv(id, file).subscribe({
      next: () => {
        this.toast.open('CV uploaded', 'Dismiss', { duration: 4000 });
        this.load(id);
      },
      error: (e) => {
        this.toast.open(e.error?.message || 'Upload failed', 'Dismiss', { duration: 5000 });
      },
    });
    input.value = '';
  }

  async generateNewPassword(): Promise<void> {
    const id = this.teacherId();
    const ok = await this.confirmDialog.confirm({
      title: 'Generate new password?',
      message:
        'The current password cannot be shown (it is encrypted). A new random password will be created. The teacher must use this new password — the old one will stop working.',
      variant: 'primary',
      confirmLabel: 'Generate',
      ariaIdPrefix: 'teacher-reset-pw',
    });
    if (!ok) return;
    this.confirmDialog.setBusy(true);
    this.api.resetPassword(id).subscribe({
      next: (res) => {
        this.confirmDialog.complete();
        this.loginCredentials.set({
          username: res.username,
          password: res.password,
          wasReset: true,
        });
        this.toast.open('New password generated. Copy it from the dialog before closing.', 'Dismiss', {
          duration: 5000,
        });
        this.load(id);
      },
      error: (e) => {
        this.confirmDialog.complete();
        this.toast.open(e.error?.message || 'Reset failed', 'Dismiss', { duration: 5000 });
      },
    });
  }

  async copyUsernameOnly(): Promise<void> {
    const u = this.teacher()?.login_user?.username?.trim();
    if (!u) {
      this.toast.open('No username on file', 'Dismiss', { duration: 4000 });
      return;
    }
    try {
      await navigator.clipboard.writeText(u);
      this.toast.open('Username copied', 'Dismiss', { duration: 3000 });
    } catch {
      this.toast.open('Could not copy username', 'Dismiss', { duration: 4000 });
    }
  }

  onCredentialsDismissed(): void {
    this.loginCredentials.set(null);
  }

  async deleteTeacher(): Promise<void> {
    const t = this.teacher();
    const id = this.teacherId();
    if (!t) return;
    const ok = await this.confirmDialog.confirm({
      title: 'Delete teacher?',
      message: `Remove ${this.displayName(t)} and their login?`,
      variant: 'danger',
      confirmLabel: 'Delete',
      ariaIdPrefix: 'teacher-del-detail',
    });
    if (!ok) return;
    this.confirmDialog.setBusy(true);
    this.api.delete(id).subscribe({
      next: () => {
        this.confirmDialog.complete();
        this.toast.open('Teacher deleted', 'Dismiss', { duration: 4000 });
        void this.router.navigate(['/teachers']);
      },
      error: (e) => {
        this.confirmDialog.complete();
        this.toast.open(e.error?.message || 'Delete failed', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
