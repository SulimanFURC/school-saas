import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AcademicService, AcademicYearDto, SchoolClassDto, SectionDto } from '@app/services';
import { SubjectDto, SubjectService } from '@app/services';
import { TeacherDetail, TeacherService } from '@app/services';
import { TeacherLoginCredentialsModalComponent } from '../../../shared/teacher-login-credentials-modal/teacher-login-credentials-modal.component';

@Component({
  selector: 'app-teacher-detail',
  imports: [
    FormsModule,
    RouterLink,
    TeacherLoginCredentialsModalComponent,
    CardModule,
    ButtonModule,
    DialogModule,
    SelectModule,
    TableModule,
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
  private academic = inject(AcademicService);
  private subjectsApi = inject(SubjectService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private destroyRef = inject(DestroyRef);

  readonly apiBase = environment.apiBaseUrl.replace(/\/+$/, '');

  loading = signal(true);
  teacher = signal<TeacherDetail | null>(null);
  teacherId = signal('');

  // Teaching assignments (admin-managed).
  loadingAssignments = signal(false);
  academicYears = signal<AcademicYearDto[]>([]);
  selectedAcademicYearId = signal<number | null>(null);
  assignments = signal<
    {
      id: string;
      class_name: string;
      section_name: string;
      subject_name: string;
      subject_id: number | null;
    }[]
  >([]);

  assignmentDialogVisible = signal(false);
  creatingAssignment = signal(false);
  subjectOptions = signal<{ label: string; value: number }[]>([]);
  classOptions = signal<{ label: string; value: number }[]>([]);
  sectionOptions = signal<{ label: string; value: number }[]>([]);

  // Form state for the dialog.
  assignSubjectId = signal<number | null>(null);
  assignClassId = signal<number | null>(null);
  assignSectionId = signal<number | null>(null);

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
    this.loadAssignmentCatalog();
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
        next: (t) => {
          this.teacher.set(t);
          if (t) {
            this.loadAssignments();
          }
        },
      });
  }

  private loadAssignmentCatalog(): void {
    // Years + classes + subjects are stable catalog data for assignment UI.
    this.academic.listAcademicYears().subscribe({
      next: (yrs) => {
        const sorted = (yrs || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        this.academicYears.set(sorted);
        const active = sorted.find((y) => y.is_active);
        this.selectedAcademicYearId.set(active ? active.id : (sorted[sorted.length - 1]?.id ?? null));
      },
      error: () => {
        this.academicYears.set([]);
        this.selectedAcademicYearId.set(null);
      },
    });

    this.academic.listClasses(false).subscribe({
      next: (rows: SchoolClassDto[]) => {
        this.classOptions.set(
          (rows || [])
            .map((c) => ({ label: c.name, value: c.id }))
            .sort((a, b) => a.label.localeCompare(b.label))
        );
      },
      error: () => this.classOptions.set([]),
    });

    this.subjectsApi.list({ activeOnly: true }).subscribe({
      next: (rows: SubjectDto[]) => {
        this.subjectOptions.set(
          (rows || [])
            .filter((s) => s.is_active)
            .map((s) => ({ label: s.name, value: s.id }))
            .sort((a, b) => a.label.localeCompare(b.label))
        );
      },
      error: () => this.subjectOptions.set([]),
    });
  }

  onAcademicYearChange(id: number | null): void {
    this.selectedAcademicYearId.set(id);
    this.loadAssignments();
  }

  loadAssignments(): void {
    const teacherId = this.teacherId();
    const yearId = this.selectedAcademicYearId();
    if (!teacherId || !yearId) {
      this.assignments.set([]);
      return;
    }
    this.loadingAssignments.set(true);
    this.api
      .listAssignments(teacherId, yearId)
      .pipe(finalize(() => this.loadingAssignments.set(false)))
      .subscribe({
        next: (res) => {
          const rows = Array.isArray(res.data) ? res.data : [];
          this.assignments.set(
            rows.map((r) => ({
              id: r.id,
              class_name: r.schoolClass?.name || '—',
              section_name: r.section?.name || '—',
              subject_name: r.subject?.name || r.subject_name || '—',
              subject_id: r.subject_id ?? null,
            }))
          );
        },
        error: (e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load assignments',
            life: 5000,
          });
          this.assignments.set([]);
        },
      });
  }

  openAssignmentDialog(): void {
    this.assignSubjectId.set(null);
    this.assignClassId.set(null);
    this.assignSectionId.set(null);
    this.sectionOptions.set([]);
    this.assignmentDialogVisible.set(true);
  }

  closeAssignmentDialog(): void {
    this.assignmentDialogVisible.set(false);
  }

  onAssignClassChange(classId: number | null): void {
    this.assignClassId.set(classId);
    this.assignSectionId.set(null);
    if (!classId) {
      this.sectionOptions.set([]);
      return;
    }
    this.academic.listSections(classId).subscribe({
      next: (rows: SectionDto[]) => {
        this.sectionOptions.set(
          (rows || [])
            .map((s) => ({ label: `Section ${s.name}`, value: s.id }))
            .sort((a, b) => a.label.localeCompare(b.label))
        );
      },
      error: () => this.sectionOptions.set([]),
    });
  }

  saveAssignment(): void {
    const teacherId = this.teacherId();
    const yearId = this.selectedAcademicYearId();
    const subjectId = this.assignSubjectId();
    const classId = this.assignClassId();
    const sectionId = this.assignSectionId();
    if (!teacherId || !yearId || !subjectId || !classId || !sectionId) {
      this.messages.add({
        severity: 'warn',
        summary: 'Missing fields',
        detail: 'Select subject, class, and section.',
        life: 4000,
      });
      return;
    }
    this.creatingAssignment.set(true);
    this.api
      .createAssignment(teacherId, {
        academic_year_id: yearId,
        subject_id: subjectId,
        class_id: classId,
        section_id: sectionId,
      })
      .pipe(finalize(() => this.creatingAssignment.set(false)))
      .subscribe({
        next: (res) => {
          this.messages.add({
            severity: 'success',
            summary: 'Saved',
            detail: res.message || 'Assignment saved',
            life: 4000,
          });
          this.closeAssignmentDialog();
          this.loadAssignments();
        },
        error: (e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to save assignment',
            life: 5000,
          });
        },
      });
  }

  removeAssignment(assignmentId: string): void {
    const teacherId = this.teacherId();
    if (!teacherId) return;
    this.confirmationService.confirm({
      message: 'Remove this teaching assignment?',
      header: 'Remove assignment',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteAssignment(teacherId, assignmentId).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: 'Removed',
              detail: 'Assignment removed',
              life: 3000,
            });
            this.loadAssignments();
          },
          error: (e: { error?: { message?: string } }) => {
            this.messages.add({
              severity: 'error',
              summary: 'Error',
              detail: e.error?.message || 'Remove failed',
              life: 5000,
            });
          },
        });
      },
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
