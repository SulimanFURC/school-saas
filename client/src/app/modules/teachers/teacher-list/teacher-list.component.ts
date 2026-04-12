import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';

import { TeacherListRow, TeacherService } from '../../../services/teacher.service';
import { ConfirmDialogService } from '../../../services/confirm-dialog.service';
import { ToastService } from '../../../services/toast.service';
import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';
import { TeacherLoginCredentialsModalComponent } from '../../../shared/teacher-login-credentials-modal/teacher-login-credentials-modal.component';

@Component({
  selector: 'app-teacher-list',
  imports: [RouterLink, TablePaginationFooterComponent, TeacherLoginCredentialsModalComponent],
  templateUrl: './teacher-list.component.html',
  styleUrl: './teacher-list.component.scss',
})
export class TeacherListComponent implements OnInit {
  private api = inject(TeacherService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);

  loading = signal(true);
  rows = signal<TeacherListRow[]>([]);
  page = signal(1);
  pageSize = signal(20);
  total = signal(0);
  totalPages = signal(1);

  loginCredentials = signal<{ username: string; password: string } | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .list({
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .pipe(
        catchError((e) => {
          this.toast.open(e.error?.message || e.message || 'Failed to load teachers', 'Dismiss', {
            duration: 5000,
          });
          return of({
            data: [] as TeacherListRow[],
            total: 0,
            page: 1,
            pageSize: this.pageSize(),
            totalPages: 1,
          });
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (res) => {
          this.rows.set(Array.isArray(res.data) ? res.data : []);
          this.total.set(res.total ?? 0);
          this.totalPages.set(Math.max(1, res.totalPages ?? 1));
        },
      });
  }

  setPage(p: number): void {
    const next = Math.min(Math.max(1, p), this.totalPages());
    this.page.set(next);
    this.load();
  }

  displayName(row: TeacherListRow): string {
    return `${row.first_name} ${row.last_name}`.trim();
  }

  openDetail(row: TeacherListRow): void {
    void this.router.navigate(['/teachers', row.id]);
  }

  async generateAndShowPassword(row: TeacherListRow, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!row.login?.username) {
      this.toast.open('This teacher has no login account.', 'Dismiss', { duration: 4000 });
      return;
    }
    const ok = await this.confirmDialog.confirm({
      title: 'Generate new password?',
      message: `For ${this.displayName(row)}: the current password cannot be shown. A new password will be created and the old one will stop working.`,
      variant: 'primary',
      confirmLabel: 'Generate',
      ariaIdPrefix: 'teacher-list-new-pw',
    });
    if (!ok) return;
    this.confirmDialog.setBusy(true);
    this.api.resetPassword(row.id).subscribe({
      next: (res) => {
        this.confirmDialog.complete();
        this.loginCredentials.set({ username: res.username, password: res.password });
        this.toast.open('Copy the password from the dialog before closing.', 'Dismiss', { duration: 5000 });
        this.load();
      },
      error: (e) => {
        this.confirmDialog.complete();
        this.toast.open(e.error?.message || 'Failed to generate password', 'Dismiss', { duration: 5000 });
      },
    });
  }

  onCredentialsDismissed(): void {
    this.loginCredentials.set(null);
  }

  async deleteRow(row: TeacherListRow, ev: Event): Promise<void> {
    ev.stopPropagation();
    const ok = await this.confirmDialog.confirm({
      title: 'Delete teacher?',
      message: `Remove ${this.displayName(row)} and their login account? This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
      ariaIdPrefix: 'teacher-delete',
    });
    if (!ok) return;
    this.confirmDialog.setBusy(true);
    this.api.delete(row.id).subscribe({
      next: () => {
        this.confirmDialog.complete();
        this.toast.open('Teacher deleted', 'Dismiss', { duration: 4000 });
        this.load();
      },
      error: (e) => {
        this.confirmDialog.complete();
        this.toast.open(e.error?.message || 'Delete failed', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
