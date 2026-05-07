import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TabViewModule } from 'primeng/tabview';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { AcademicService, type SchoolClassDto } from '@app/services';
import { SubjectService, type SubjectDto } from '@app/services';
import {
  AdminProgressResponse,
  ExamDto,
  ExamGradingConfigDto,
  ExamService,
  ExamStatus,
  ExamTimetableDto,
  ExamTimetableUpsertPayload,
  GradeDistributionResponse,
  GradingSchemeDto,
} from '@app/services';

interface NewPaperForm {
  class_id: number | null;
  subject_id: number | null;
  exam_date: Date | null;
  start_time: string;
  end_time: string;
  room: string;
  total_marks: number;
  passing_marks: number;
}

const STATUS_LABELS: Record<ExamStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  ongoing: 'Ongoing',
  result_pending: 'Result pending',
  published: 'Published',
  archived: 'Archived',
};

function ymd(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return String(d).slice(0, 10);
}

@Component({
  selector: 'app-exam-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    DatePickerModule,
    SelectModule,
    TableModule,
    TabViewModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    ProgressBarModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './exam-detail.component.html',
  styleUrl: './exam-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamDetailComponent implements OnInit {
  private api = inject(ExamService);
  private academic = inject(AcademicService);
  private subjectsApi = inject(SubjectService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private confirm = inject(ConfirmationService);

  readonly statusLabels = STATUS_LABELS;

  exam = signal<ExamDto | null>(null);
  loading = signal(true);

  classes = signal<SchoolClassDto[]>([]);
  subjects = signal<SubjectDto[]>([]);

  timetable = signal<ExamTimetableDto[]>([]);
  progress = signal<AdminProgressResponse | null>(null);

  schemes = signal<GradingSchemeDto[]>([]);
  gradingConfig = signal<ExamGradingConfigDto | null>(null);
  selectedSchemeId = signal<string | null>(null);
  selectedMode = signal<'per_subject' | 'aggregate'>('per_subject');
  distribution = signal<GradeDistributionResponse | null>(null);

  newPaper = signal<NewPaperForm>({
    class_id: null,
    subject_id: null,
    exam_date: null,
    start_time: '09:00',
    end_time: '12:00',
    room: '',
    total_marks: 100,
    passing_marks: 40,
  });

  readonly isFullyEditable = computed(() => {
    const e = this.exam();
    return e ? e.status === 'draft' || e.status === 'scheduled' : false;
  });

  readonly classOptions = computed(() => {
    const e = this.exam();
    if (!e || !e.classes) return [] as { label: string; value: number }[];
    return e.classes.map((c) => ({ label: c.class_name || `Class ${c.class_id}`, value: c.class_id }));
  });

  readonly progressPercent = computed(() => {
    const p = this.progress();
    if (!p || p.overall.total === 0) return 0;
    return Math.min(100, Math.round((p.overall.entered / p.overall.total) * 100));
  });

  ngOnInit(): void {
    this.academic.listClasses().subscribe((cls) => this.classes.set(cls));
    this.subjectsApi
      .list({ activeOnly: true })
      .subscribe((res) => this.subjects.set(Array.isArray(res.data) ? res.data : []));
    this.api.listGradingSchemes().subscribe((res) => this.schemes.set(res.data));

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/exams']);
      return;
    }
    this.load(id);
  }

  private load(id: string): void {
    this.loading.set(true);
    this.api
      .get(id)
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load exam',
            life: 4000,
          });
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((res) => {
        if (!res) {
          void this.router.navigate(['/exams']);
          return;
        }
        this.exam.set(res.data);
        this.refreshTimetable();
        this.refreshProgress();
        this.refreshGradingConfig();
      });
  }

  refreshTimetable(): void {
    const e = this.exam();
    if (!e) return;
    this.api.listTimetable(e.id).subscribe({
      next: (res) => this.timetable.set(res.data),
      error: () => this.timetable.set([]),
    });
  }

  refreshProgress(): void {
    const e = this.exam();
    if (!e) return;
    this.api.getProgress(e.id).subscribe({
      next: (res) => this.progress.set(res),
      error: () => this.progress.set(null),
    });
  }

  refreshGradingConfig(): void {
    const e = this.exam();
    if (!e) return;
    this.api.getGradingConfig(e.id).subscribe({
      next: (res) => {
        this.gradingConfig.set(res.data);
        if (res.data) {
          this.selectedSchemeId.set(res.data.grading_scheme_id);
          this.selectedMode.set(res.data.grading_mode);
        }
      },
    });
    this.api.getDistribution(e.id).subscribe({
      next: (res) => this.distribution.set(res.data),
      error: () => this.distribution.set(null),
    });
  }

  examTitle(e: ExamDto | null): string {
    return e ? `${e.title} (${e.exam_type})` : '';
  }

  statusSeverity(s: ExamStatus | null | undefined): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'draft':
        return 'secondary';
      case 'scheduled':
        return 'info';
      case 'ongoing':
      case 'result_pending':
        return 'warn';
      case 'published':
        return 'success';
      case 'archived':
        return 'danger';
      default:
        return 'info';
    }
  }

  transition(target: ExamStatus): void {
    const e = this.exam();
    if (!e) return;
    this.confirm.confirm({
      header: 'Transition exam status?',
      message: `Move exam from "${this.statusLabels[e.status]}" to "${this.statusLabels[target]}"?`,
      acceptLabel: 'Confirm',
      rejectLabel: 'Cancel',
      accept: () => {
        this.api.transition(e.id, target).subscribe({
          next: (res) => {
            this.messages.add({ severity: 'success', summary: 'Updated', detail: res.message });
            this.exam.set(res.data);
          },
          error: (err: { error?: { message?: string } }) => {
            this.messages.add({
              severity: 'error',
              summary: 'Error',
              detail: err.error?.message || 'Failed to transition status',
              life: 4000,
            });
          },
        });
      },
    });
  }

  finalizeTimetable(): void {
    const e = this.exam();
    if (!e) return;
    this.api.finalizeTimetable(e.id).subscribe({
      next: (res) => {
        this.messages.add({ severity: 'success', summary: 'Finalized', detail: res.message });
        const updated = { ...e, timetable_finalized_at: res.data.timetable_finalized_at };
        this.exam.set(updated);
      },
      error: (err: { error?: { message?: string } }) => {
        this.messages.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.message || 'Failed to finalize timetable',
          life: 4000,
        });
      },
    });
  }

  toggleLock(row: ExamTimetableDto): void {
    const e = this.exam();
    if (!e) return;
    this.api.toggleLock(e.id, row.id, !row.is_locked).subscribe({
      next: () => {
        this.messages.add({
          severity: 'success',
          summary: row.is_locked ? 'Unlocked' : 'Locked',
          detail: 'Paper updated',
        });
        this.refreshTimetable();
      },
      error: (err: { error?: { message?: string } }) => {
        this.messages.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.message || 'Failed to toggle lock',
          life: 4000,
        });
      },
    });
  }

  deleteEntry(row: ExamTimetableDto): void {
    const e = this.exam();
    if (!e) return;
    this.confirm.confirm({
      header: 'Remove paper?',
      message: `${row.subject_name || 'This paper'} will be removed from the timetable.`,
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteTimetableEntry(e.id, row.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Removed', detail: 'Paper removed' });
            this.refreshTimetable();
          },
          error: (err: { error?: { message?: string } }) => {
            this.messages.add({
              severity: 'error',
              summary: 'Error',
              detail: err.error?.message || 'Failed to remove paper',
              life: 4000,
            });
          },
        });
      },
    });
  }

  patchNewPaper(patch: Partial<NewPaperForm>): void {
    this.newPaper.update((p) => ({ ...p, ...patch }));
  }

  addPaper(): void {
    const e = this.exam();
    if (!e) return;
    const p = this.newPaper();
    if (!p.class_id || !p.subject_id || !p.exam_date) {
      this.messages.add({
        severity: 'warn',
        summary: 'Missing fields',
        detail: 'Class, subject, and date are required',
      });
      return;
    }
    const payload: ExamTimetableUpsertPayload = {
      class_id: p.class_id,
      subject_id: p.subject_id,
      exam_date: ymd(p.exam_date) as string,
      start_time: p.start_time,
      end_time: p.end_time,
      room: p.room.trim() || null,
      total_marks: Number(p.total_marks) || 0,
      passing_marks: Number(p.passing_marks) || 0,
    };
    this.api.addTimetableEntry(e.id, payload).subscribe({
      next: () => {
        this.messages.add({ severity: 'success', summary: 'Added', detail: 'Paper added' });
        this.newPaper.set({
          class_id: null,
          subject_id: null,
          exam_date: null,
          start_time: '09:00',
          end_time: '12:00',
          room: '',
          total_marks: 100,
          passing_marks: 40,
        });
        this.refreshTimetable();
      },
      error: (err: { error?: { message?: string } }) => {
        this.messages.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.message || 'Failed to add paper',
          life: 4000,
        });
      },
    });
  }

  saveGrading(): void {
    const e = this.exam();
    if (!e) return;
    const schemeId = this.selectedSchemeId();
    if (!schemeId) {
      this.messages.add({ severity: 'warn', summary: 'Select scheme', detail: 'Pick a grading scheme' });
      return;
    }
    this.api.setGradingConfig(e.id, { grading_scheme_id: schemeId, grading_mode: this.selectedMode() }).subscribe({
      next: (res) => {
        this.messages.add({ severity: 'success', summary: 'Saved', detail: res.message });
        this.refreshGradingConfig();
      },
      error: (err: { error?: { message?: string } }) => {
        this.messages.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.message || 'Failed to save grading',
          life: 4000,
        });
      },
    });
  }

  publish(): void {
    const e = this.exam();
    if (!e) return;
    this.confirm.confirm({
      header: 'Publish results?',
      message: 'Once published, students and parents can view their results. This cannot be undone.',
      acceptLabel: 'Publish',
      rejectLabel: 'Cancel',
      accept: () => {
        this.api.publish(e.id).subscribe({
          next: (res) => {
            this.messages.add({ severity: 'success', summary: 'Published', detail: res.message });
            this.exam.set({ ...e, status: 'published', published_at: res.data.published_at });
          },
          error: (err: { error?: { message?: string } }) => {
            this.messages.add({
              severity: 'error',
              summary: 'Error',
              detail: err.error?.message || 'Failed to publish',
              life: 4000,
            });
          },
        });
      },
    });
  }

  downloadAdmitCardZip(classId: number): void {
    const e = this.exam();
    if (!e) return;
    this.openBlob(this.api.bulkAdmitCardsZipUrl(e.id, classId));
  }

  downloadResultZip(classId: number): void {
    const e = this.exam();
    if (!e) return;
    this.openBlob(this.api.bulkResultCardsZipUrl(e.id, classId));
  }

  private openBlob(url: string): void {
    const token = localStorage.getItem('school_saas_token');
    const sub = localStorage.getItem('school_saas_subdomain');
    if (!token) return;
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(sub ? { 'x-tenant-id': sub } : {}),
      },
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text();
          this.messages.add({
            severity: 'error',
            summary: 'Download failed',
            detail: text || resp.statusText,
            life: 5000,
          });
          return;
        }
        const blob = await resp.blob();
        const dispo = resp.headers.get('content-disposition') || '';
        const match = /filename="?([^";]+)"?/.exec(dispo);
        const name = match ? match[1] : 'download.zip';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      })
      .catch(() => {
        this.messages.add({ severity: 'error', summary: 'Download failed', detail: 'Network error' });
      });
  }
}
