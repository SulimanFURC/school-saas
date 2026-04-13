import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { TeacherDetail, TeacherService } from '../../../services/teacher.service';
import { TeacherLoginCredentialsModalComponent } from '../../../shared/teacher-login-credentials-modal/teacher-login-credentials-modal.component';

@Component({
  selector: 'app-teacher-detail',
  imports: [
    RouterLink,
    TeacherLoginCredentialsModalComponent,
    CardModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './teacher-detail.component.html',
  styleUrl: './teacher-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherDetailComponent implements OnInit {
  private api = inject(TeacherService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private destroyRef = inject(DestroyRef);

  readonly apiBase = environment.apiBaseUrl.replace(/\/+$/, '');

  loading = signal(true);
  teacher = signal<TeacherDetail | null>(null);
  teacherId = signal('');

  /** Shown after password reset. */
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
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load teacher',
            life: 5000,
          });
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

  accountSeverity(t: TeacherDetail): 'success' | 'secondary' | 'warn' {
    const s = t.login_user?.status?.toLowerCase() ?? '';
    if (s === 'active') return 'success';
    if (!t.login_user) return 'secondary';
    return 'warn';
  }

  onCvSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    const id = this.teacherId();
    if (!file || !id) return;
    this.api.uploadCv(id, file).subscribe({
      next: () => {
        this.messages.add({
          severity: 'success',
          summary: 'Uploaded',
          detail: 'CV uploaded',
          life: 4000,
        });
        this.load(id);
      },
      error: (e: { error?: { message?: string } }) => {
        this.messages.add({
          severity: 'error',
          summary: 'Error',
          detail: e.error?.message || 'Upload failed',
          life: 5000,
        });
      },
    });
    input.value = '';
  }

  generateNewPassword(): void {
    const id = this.teacherId();
    this.confirmationService.confirm({
      message:
        'The current password cannot be shown (it is encrypted). A new random password will be created. The teacher must use this new password — the old one will stop working.',
      header: 'Generate new password?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Generate',
      rejectLabel: 'Cancel',
      accept: () => {
        this.api
          .resetPassword(id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (res) => {
              this.loginCredentials.set({
                username: res.username,
                password: res.password,
                wasReset: true,
              });
              this.messages.add({
                severity: 'info',
                summary: 'New password',
                detail: 'Copy it from the dialog before closing.',
                life: 5000,
              });
              this.load(id);
            },
            error: (e: { error?: { message?: string } }) => {
              this.messages.add({
                severity: 'error',
                summary: 'Error',
                detail: e.error?.message || 'Reset failed',
                life: 5000,
              });
            },
          });
      },
    });
  }

  async copyUsernameOnly(): Promise<void> {
    const u = this.teacher()?.login_user?.username?.trim();
    if (!u) {
      this.messages.add({
        severity: 'warn',
        summary: 'No username',
        detail: 'No username on file',
        life: 4000,
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(u);
      this.messages.add({
        severity: 'success',
        summary: 'Copied',
        detail: 'Username copied',
        life: 3000,
      });
    } catch {
      this.messages.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Could not copy username',
        life: 4000,
      });
    }
  }

  onCredentialsDismissed(): void {
    this.loginCredentials.set(null);
  }

  deleteTeacher(): void {
    const t = this.teacher();
    const id = this.teacherId();
    if (!t) return;
    this.confirmationService.confirm({
      message: `Remove ${this.displayName(t)} and their login?`,
      header: 'Delete teacher?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api
          .delete(id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.messages.add({
                severity: 'success',
                summary: 'Removed',
                detail: 'Teacher deleted',
                life: 4000,
              });
              void this.router.navigate(['/teachers']);
            },
            error: (e: { error?: { message?: string } }) => {
              this.messages.add({
                severity: 'error',
                summary: 'Error',
                detail: e.error?.message || 'Delete failed',
                life: 5000,
              });
            },
          });
      },
    });
  }
}
