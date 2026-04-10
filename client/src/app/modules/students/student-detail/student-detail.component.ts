import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ConfirmDialogService } from '../../../services/confirm-dialog.service';
import { StudentService, resolveStudentDisplayName } from '../../../services/student.service';
import { ToastService } from '../../../services/toast.service';

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
  imports: [RouterLink],
  templateUrl: './student-detail.component.html',
  styleUrl: './student-detail.component.scss',
})
export class StudentDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private students = inject(StudentService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);

  readonly activeTab = signal(0);

  /**
   * Visible tabs (bar + slider width = 100% / length). To add Guardian later:
   * insert `{ id: 'guardian', label: 'Guardian' }` and a matching `@case` in the template.
   */
  readonly tabs: readonly StudentDetailTab[] = [
    { id: 'basic', label: 'Basic info' },
    { id: 'academic', label: 'Academic history' },
    { id: 'fees', label: 'Fees' },
  ];

  loading = true;
  studentId = '';
  student: Record<string, unknown> | null = null;
  enrollments: unknown[] = [];

  /** Resolved image URL (http(s), or data URL from stored base64). */
  readonly profilePhotoSrc = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.studentId = id;
    this.students.getById(id).subscribe({
      next: (data) => {
        this.student = data;
        this.loading = false;
        this.setupProfilePhoto();
      },
      error: (e) => {
        this.loading = false;
        this.toast.open(e.error?.message || 'Failed to load student', 'Dismiss', { duration: 5000 });
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

  /** Current tab id for `@switch` panels. */
  activeTabId(): StudentDetailTabId {
    const i = this.activeTab();
    return this.tabs[i]?.id ?? this.tabs[0].id;
  }

  /** Moves the underline indicator (width = 100% / tabs.length). */
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
        this.toast.open(msg, 'Dismiss', { duration: 6000 });
      },
      error: (e) => this.toast.open(e.error?.message || 'Failed', 'Dismiss', { duration: 4000 }),
    });
  }

  suspend(): void {
    void this.runSuspend();
  }

  private async runSuspend(): Promise<void> {
    if (!this.studentId || !this.student) return;

    const ok = await this.confirmDialog.confirm({
      title: 'Suspend student?',
      message: 'Mark this student as suspended? They may lose access until reactivated.',
      variant: 'primary',
      confirmLabel: 'Suspend',
      cancelLabel: 'Cancel',
      ariaIdPrefix: 'student-suspend',
    });
    if (!ok) return;

    this.confirmDialog.setBusy(true);
    this.students.update(this.studentId, { status: 'suspended' }).subscribe({
      next: () => {
        this.confirmDialog.complete();
        this.toast.open('Updated', 'Dismiss', { duration: 3000 });
        this.student = { ...this.student!, status: 'suspended' };
      },
      error: (e) => {
        this.confirmDialog.complete();
        this.toast.open(e.error?.message || 'Update failed', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
