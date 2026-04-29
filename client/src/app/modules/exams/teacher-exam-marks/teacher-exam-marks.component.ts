import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { Observable, catchError, finalize, of } from 'rxjs';

import {
  ExamService,
  type MarkEntryStatus,
  type MarksSheetResponse,
  type TeacherExamPaperRow,
  type TeacherExamSummaryRow,
  type UpsertMarkEntry,
} from '../../../services/exam.service';

interface MarksRowState {
  student_id: string;
  display_name: string;
  admission_no: string;
  roll_number: number | null;
  section_name: string | null;
  entry_status: MarkEntryStatus;
  marks_obtained: number | null;
  original_status: MarkEntryStatus | null;
  original_marks: number | null;
  has_existing: boolean;
}

const STATUS_OPTIONS: { label: string; value: MarkEntryStatus }[] = [
  { label: 'Present', value: 'present' },
  { label: 'Absent', value: 'absent' },
  { label: 'Exempted', value: 'exempted' },
  { label: 'Withheld', value: 'withheld' },
];

@Component({
  selector: 'app-teacher-exam-marks',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './teacher-exam-marks.component.html',
  styleUrl: './teacher-exam-marks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherExamMarksComponent implements OnInit {
  private api = inject(ExamService);
  private route = inject(ActivatedRoute);
  private messages = inject(MessageService);
  private confirm = inject(ConfirmationService);

  readonly statusOptions = STATUS_OPTIONS;

  examId = signal<string>('');
  papers = signal<TeacherExamPaperRow[]>([]);
  loadingPapers = signal(true);

  selectedPaper = signal<TeacherExamPaperRow | null>(null);
  sheet = signal<MarksSheetResponse | null>(null);
  rows = signal<MarksRowState[]>([]);
  loadingSheet = signal(false);
  saving = signal(false);
  reason = signal('');

  summaryRows = signal<TeacherExamSummaryRow[]>([]);
  loadingSummary = signal(false);
  private readonly summaryByStudentId = computed(() => {
    const map = new Map<string, TeacherExamSummaryRow>();
    for (const row of this.summaryRows()) map.set(row.student_id, row);
    return map;
  });

  readonly hasExistingChanges = computed(() => {
    return this.rows().some((r) => r.has_existing && this.isChanged(r));
  });

  readonly progressLabel = computed(() => {
    const s = this.sheet();
    if (!s) return '';
    return `${s.entered} / ${s.total} entered`;
  });

  /** Live aggregate percentage for the currently selected paper, computed only
   *  from rows with status=present and a numeric mark entered. */
  readonly subjectAggregateLabel = computed(() => {
    const s = this.sheet();
    if (!s) return '—';
    const total = Number(s.timetable.total_marks);
    if (!Number.isFinite(total) || total <= 0) return '—';
    let obtained = 0;
    let count = 0;
    for (const r of this.rows()) {
      if (r.entry_status !== 'present' || r.marks_obtained == null) continue;
      const v = Number(r.marks_obtained);
      if (!Number.isFinite(v)) continue;
      obtained += v;
      count += 1;
    }
    if (count === 0) return '—';
    const pct = (obtained / (count * total)) * 100;
    return `${pct.toFixed(2)}%`;
  });

  readonly subjectPresentCountLabel = computed(() => {
    const list = this.rows();
    const total = list.length;
    let present = 0;
    let entered = 0;
    for (const r of list) {
      if (r.entry_status === 'present') {
        present += 1;
        if (r.marks_obtained != null) entered += 1;
      }
    }
    return `${entered}/${present} present entered (${total} total)`;
  });

  readonly presentCount = computed(() => this.rows().filter((r) => r.entry_status === 'present').length);
  readonly absentCount = computed(() => this.rows().filter((r) => r.entry_status === 'absent').length);
  readonly pendingEntryCount = computed(() => {
    let pending = 0;
    for (const r of this.rows()) {
      if (r.entry_status !== 'present') continue;
      if (r.marks_obtained == null) pending += 1;
    }
    return pending;
  });
  readonly completionPercentLabel = computed(() => {
    const list = this.rows();
    if (!list.length) return '0%';
    let completed = 0;
    for (const r of list) {
      if (r.entry_status !== 'present' || r.marks_obtained != null) completed += 1;
    }
    return `${((completed / list.length) * 100).toFixed(0)}%`;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!id) return;
    this.examId.set(id);
    this.loadPapers();
    this.loadSummary();
  }

  loadPapers(): void {
    this.loadingPapers.set(true);
    this.api
      .teacherGetMyPapers(this.examId())
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load papers',
          });
          return of({ data: [] as TeacherExamPaperRow[] });
        }),
        finalize(() => this.loadingPapers.set(false))
      )
      .subscribe((res) => this.papers.set(res.data));
  }

  selectPaper(p: TeacherExamPaperRow): void {
    this.selectedPaper.set(p);
    this.loadSheet(p);
  }

  loadSheet(p: TeacherExamPaperRow): void {
    this.loadingSheet.set(true);
    this.api
      .getMarksSheet(this.examId(), { exam_timetable_id: p.id })
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load marks sheet',
          });
          return of(null as MarksSheetResponse | null);
        }),
        finalize(() => this.loadingSheet.set(false))
      )
      .subscribe((res) => {
        if (!res) return;
        this.sheet.set(res);
        this.rows.set(
          res.data.map((r) => ({
            student_id: r.student_id,
            display_name: r.display_name,
            admission_no: r.admission_no,
            roll_number: r.roll_number,
            section_name: r.section_name,
            entry_status: r.mark?.entry_status ?? 'present',
            marks_obtained: r.mark?.marks_obtained ?? null,
            original_status: r.mark ? r.mark.entry_status : null,
            original_marks: r.mark ? r.mark.marks_obtained : null,
            has_existing: !!r.mark,
          }))
        );
        this.reason.set('');
      });
  }

  patchRow(student_id: string, patch: Partial<MarksRowState>): void {
    this.rows.update((list) => list.map((r) => (r.student_id === student_id ? { ...r, ...patch } : r)));
  }

  /** Block any non-digit keys at typing time so only whole numbers can be entered. */
  onMarksKeydown(ev: KeyboardEvent): void {
    const ALLOW = new Set([
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'Home', 'End',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    ]);
    if (ev.ctrlKey || ev.metaKey) return;
    if (ALLOW.has(ev.key)) return;
    if (/^[0-9]$/.test(ev.key)) return;
    ev.preventDefault();
  }

  /** Sanitize pasted/typed values: keep digits only, clamp to total marks. */
  onMarksInput(student_id: string, ev: Event, totalMarks: number): void {
    const input = ev.target as HTMLInputElement;
    const raw = input.value;
    const digits = raw.replace(/[^\d]/g, '');
    const max = Math.max(0, Math.floor(Number(totalMarks) || 0));
    let val: number | null = digits === '' ? null : Number(digits);
    if (val != null && Number.isFinite(val) && val > max) val = max;
    const next = val == null ? '' : String(val);
    if (input.value !== next) input.value = next;
    this.patchRow(student_id, { marks_obtained: val });
  }

  marksMaxLength(totalMarks: number): number {
    const n = Math.max(0, Math.floor(Number(totalMarks) || 0));
    return Math.max(1, String(n).length);
  }

  subjectPercentageLabel(r: MarksRowState, totalMarks: number): string {
    if (r.entry_status !== 'present' || r.marks_obtained == null) return '—';
    const total = Number(totalMarks);
    const obtained = Number(r.marks_obtained);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(obtained)) return '—';
    return `${((obtained / total) * 100).toFixed(2)}%`;
  }

  overallPercentageLabel(student_id: string): string {
    const row = this.summaryByStudentId().get(student_id);
    const pct = row?.totals?.percentage;
    if (pct == null) return '—';
    return `${Number(pct).toFixed(2)}%`;
  }

  overallGradeLabel(student_id: string): string {
    const row = this.summaryByStudentId().get(student_id);
    return row?.overall_grade?.grade_label || '—';
  }

  loadSummary(): void {
    const examId = this.examId();
    if (!examId) return;
    this.loadingSummary.set(true);
    this.api
      .teacherGetMyExamSummary(examId)
      .pipe(
        catchError(() => of({ data: [] as TeacherExamSummaryRow[] })),
        finalize(() => this.loadingSummary.set(false))
      )
      .subscribe((res) => this.summaryRows.set(res.data));
  }

  isChanged(r: MarksRowState): boolean {
    if (!r.has_existing) return r.entry_status !== 'present' || r.marks_obtained != null;
    if (r.original_status !== r.entry_status) return true;
    const om = r.original_marks == null ? null : Number(r.original_marks);
    const nm = r.marks_obtained == null ? null : Number(r.marks_obtained);
    return om !== nm;
  }

  save(): void {
    const sheet = this.sheet();
    if (!sheet) return;
    if (!sheet.can_edit) {
      this.messages.add({ severity: 'warn', summary: 'Locked', detail: 'This paper is locked' });
      return;
    }
    if (this.hasExistingChanges() && !this.reason().trim()) {
      this.messages.add({
        severity: 'warn',
        summary: 'Reason required',
        detail: 'Editing existing marks requires a reason.',
      });
      return;
    }
    const entries: UpsertMarkEntry[] = this.rows()
      .filter((r) => this.isChanged(r) || (!r.has_existing && r.entry_status !== 'present'))
      .map((r) => ({
        student_id: r.student_id,
        entry_status: r.entry_status,
        marks_obtained: r.entry_status === 'present' ? r.marks_obtained : null,
      }));
    if (entries.length === 0) {
      this.messages.add({ severity: 'info', summary: 'No changes', detail: 'Nothing to save.' });
      return;
    }
    this.saving.set(true);
    this.api
      .upsertMarks(this.examId(), {
        exam_timetable_id: sheet.timetable.id,
        reason: this.reason().trim() || undefined,
        entries,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res) => {
          if (res.errors && res.errors.length > 0) {
            this.messages.add({
              severity: 'warn',
              summary: 'Saved with errors',
              detail: res.errors.map((e) => `${e.student_id}: ${e.message}`).join('; '),
              life: 6000,
            });
          } else {
            this.messages.add({ severity: 'success', summary: 'Saved', detail: res.message });
          }
          const p = this.selectedPaper();
          if (p) this.loadSheet(p);
          this.loadPapers();
          this.loadSummary();
        },
        error: (e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Save failed',
            detail: e.error?.message || 'Failed to save marks',
          });
        },
      });
  }

  downloadTemplate(): void {
    const sheet = this.sheet();
    if (!sheet) return;
    this.fetchAndSave(this.api.marksTemplateUrl(this.examId(), sheet.timetable.id), 'marks-template.csv');
  }

  onCsvSelected(ev: Event, mode: 'preview' | 'commit'): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const sheet = this.sheet();
    if (!sheet) return;
    const obs$: Observable<unknown> =
      mode === 'preview'
        ? this.api.importMarksPreview(this.examId(), sheet.timetable.id, file)
        : this.api.importMarksCommit(this.examId(), sheet.timetable.id, file);
    obs$.subscribe({
      next: (res: unknown) => {
        const data = (res as { data?: unknown }).data;
        if (mode === 'preview' && data && typeof data === 'object') {
          const d = data as { summary: { to_create: number; to_update: number; unchanged: number }; errors: unknown[] };
          this.messages.add({
            severity: d.errors && d.errors.length > 0 ? 'warn' : 'info',
            summary: 'CSV preview',
            detail: `Create ${d.summary.to_create}, update ${d.summary.to_update}, unchanged ${d.summary.unchanged}, errors ${d.errors?.length || 0}`,
            life: 6000,
          });
        } else           if (mode === 'commit' && data) {
          const d = data as { created: number; updated: number; unchanged: number };
          this.messages.add({
            severity: 'success',
            summary: 'Imported',
            detail: `Created ${d.created}, updated ${d.updated}, unchanged ${d.unchanged}`,
            life: 5000,
          });
          if (this.selectedPaper()) this.loadSheet(this.selectedPaper()!);
          this.loadSummary();
        }
      },
      error: (e: { error?: { message?: string } }) => {
        this.messages.add({
          severity: 'error',
          summary: 'Import failed',
          detail: e.error?.message || 'Failed to import CSV',
        });
      },
    });
    input.value = '';
  }

  private fetchAndSave(url: string, filename: string): void {
    const token = localStorage.getItem('school_saas_token');
    const sub = localStorage.getItem('school_saas_subdomain');
    if (!token) return;
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(sub ? { 'x-tenant-id': sub } : {}),
      },
    }).then(async (resp) => {
      if (!resp.ok) {
        this.messages.add({ severity: 'error', summary: 'Download failed', detail: resp.statusText });
        return;
      }
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }
}
