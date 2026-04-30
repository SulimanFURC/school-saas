import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';

import { StudentService, resolveStudentDisplayName } from '@app/services';

/** Tab ids for `@switch` panels — add entries here when adding tabs (order = bar order). */
export type StudentDetailTabId = 'basic' | 'guardian' | 'academic' | 'fees';

export interface StudentDetailTab {
  readonly id: StudentDetailTabId;
  readonly label: string;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

@Component({
  selector: 'app-student-detail',
  imports: [
    RouterLink,
    CardModule,
    ButtonModule,
    TagModule,
    TableModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './student-detail.component.html',
  styleUrl: './student-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private students = inject(StudentService);
  private messages = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  readonly activeTab = signal(0);

  readonly tabs: readonly StudentDetailTab[] = [
    { id: 'basic', label: 'Basic info' },
    { id: 'academic', label: 'Academic history' },
    { id: 'fees', label: 'Fees' },
  ];

  readonly loading = signal(true);
  studentId = '';
  student: Record<string, unknown> | null = null;
  enrollments: unknown[] = [];

  readonly profilePhotoSrc = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.studentId = id;
    this.students.getById(id).subscribe({
      next: (data) => {
        this.student = data;
        this.loading.set(false);
        this.setupProfilePhoto();
      },
      error: (e: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.notifyError(e.error?.message || 'Failed to load student', 5000);
      },
    });
    this.students.enrollments(id).subscribe({
      next: (rows) => (this.enrollments = rows),
      error: () => (this.enrollments = []),
    });
  }

  private setupProfilePhoto(): void {
    this.profilePhotoSrc.set(null);
    const s = this.student;
    if (!s) return;
    const url = s['photo_url'];
    if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
      this.profilePhotoSrc.set(url.trim());
      return;
    }
    const b64 = s['photo_base64'];
    const mime = String(s['photo_mime'] || 'image/jpeg');
    if (typeof b64 === 'string' && b64.trim()) {
      this.profilePhotoSrc.set(`data:${mime};base64,${b64.trim()}`);
    }
  }

  setTab(i: number): void {
    const max = this.tabs.length - 1;
    this.activeTab.set(Math.max(0, Math.min(i, max)));
  }

  activeTabId(): StudentDetailTabId {
    const i = this.activeTab();
    return this.tabs[i]?.id ?? this.tabs[0].id;
  }

  sliderTransform(): string {
    return `translateX(${this.activeTab() * 100}%)`;
  }

  displayName(s: Record<string, unknown>): string {
    const n = resolveStudentDisplayName(s);
    return n || '—';
  }

  avatarInitials(): string {
    if (!this.student) return '?';
    return initialsFromName(this.displayName(this.student));
  }

  chipStatus(s: Record<string, unknown>): string {
    return String(s['status'] ?? '—');
  }

  statusSeverity(status: string): 'success' | 'warn' | 'danger' | 'secondary' | 'info' | 'contrast' {
    const key = status?.toLowerCase() ?? '';
    const map: Record<string, 'success' | 'warn' | 'danger' | 'secondary' | 'info' | 'contrast'> = {
      active: 'success',
      inactive: 'secondary',
      suspended: 'warn',
      graduated: 'info',
    };
    return map[key] ?? 'secondary';
  }

  dobDisplay(v: unknown): string {
    if (v == null || v === '') return '—';
    if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) {
      const d = v instanceof Date ? v : new Date(v);
      return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
    }
    return '—';
  }

  asDocList(raw: unknown): { file_name: string; file_url: string }[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((d) => d && typeof d === 'object') as { file_name: string; file_url: string }[];
  }

  loginInfo(): void {
    if (!this.studentId) return;
    this.students.loginDetails(this.studentId).subscribe({
      next: (d) => {
        const msg = d.has_account
          ? `Username: ${d.username || '—'} · status: ${d.status || '—'}`
          : 'No student login account';
        this.notifyInfo(msg, 6000);
      },
      error: (e: { error?: { message?: string } }) =>
        this.notifyError(e.error?.message || 'Failed', 4000),
    });
  }

  suspend(): void {
    this.runSuspend();
  }

  private runSuspend(): void {
    if (!this.studentId || !this.student) return;

    this.confirmationService.confirm({
      header: 'Suspend student?',
      message: 'Mark this student as suspended? They may lose access until reactivated.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Suspend',
      rejectLabel: 'Cancel',
      accept: () => {
        this.students
          .update(this.studentId, { status: 'suspended' })
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.notifySuccess('Updated', 3000);
              this.student = { ...this.student!, status: 'suspended' };
            },
            error: (e: { error?: { message?: string } }) => {
              this.notifyError(e.error?.message || 'Update failed', 5000);
            },
          });
      },
    });
  }

  private notifyError(detail: string, life: number): void {
    this.messages.add({ severity: 'error', summary: 'Error', detail: String(detail), life });
  }

  private notifySuccess(detail: string, life: number): void {
    this.messages.add({ severity: 'success', summary: 'Success', detail: String(detail), life });
  }

  private notifyInfo(detail: string, life: number): void {
    this.messages.add({ severity: 'info', summary: 'Login', detail: String(detail), life });
  }
}
