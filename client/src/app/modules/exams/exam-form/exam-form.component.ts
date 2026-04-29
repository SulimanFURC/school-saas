import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import {
  AcademicService,
  type AcademicYearDto,
  type SchoolClassDto,
} from '../../../services/academic.service';
import {
  ExamCreatePayload,
  ExamDto,
  ExamService,
  type ExamType,
} from '../../../services/exam.service';

const EXAM_TYPE_OPTIONS: { label: string; value: ExamType }[] = [
  { label: '1st Term', value: 'first_term' },
  { label: '2nd Term', value: 'second_term' },
  { label: 'Mid-term', value: 'mid_term' },
  { label: 'Final', value: 'final' },
  { label: 'Unit test', value: 'unit_test' },
  { label: 'Mock', value: 'mock' },
];

function ymd(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10);
}

function parseYmd(s: string | null | undefined): Date | null {
  if (!s) return null;
  const parts = String(s).slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

@Component({
  selector: 'app-exam-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
    MultiSelectModule,
    CheckboxModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './exam-form.component.html',
  styleUrl: './exam-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ExamService);
  private academic = inject(AcademicService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);

  readonly examTypeOptions = EXAM_TYPE_OPTIONS;

  loading = signal(false);
  submitting = signal(false);
  editId = signal<string | null>(null);
  pageTitle = signal('Create exam');

  years = signal<AcademicYearDto[]>([]);
  classes = signal<SchoolClassDto[]>([]);

  form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    exam_type: this.fb.nonNullable.control<ExamType | null>(null, Validators.required),
    academic_year_id: this.fb.nonNullable.control<number | null>(null, Validators.required),
    start_date: this.fb.nonNullable.control<Date | null>(null, Validators.required),
    end_date: this.fb.nonNullable.control<Date | null>(null, Validators.required),
    is_internal: [true],
    class_ids: this.fb.nonNullable.control<number[]>([]),
    recheck_window_days: [7, [Validators.min(1)]],
  });

  ngOnInit(): void {
    this.academic.listAcademicYears().subscribe((years) => {
      this.years.set(years);
      const active = years.find((y) => y.is_active);
      if (active && !this.form.value.academic_year_id) {
        this.form.patchValue({ academic_year_id: active.id });
      }
    });
    this.academic.listClasses(false).subscribe((cls) => this.classes.set(cls));

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.pageTitle.set('Edit exam');
      this.load(id);
    }
  }

  load(id: string): void {
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
        this.applyExam(res.data);
      });
  }

  private applyExam(exam: ExamDto): void {
    this.form.patchValue({
      title: exam.title,
      exam_type: exam.exam_type,
      academic_year_id: exam.academic_year_id,
      start_date: parseYmd(exam.start_date),
      end_date: parseYmd(exam.end_date),
      is_internal: !!exam.is_internal,
      class_ids: (exam.classes || []).map((c) => c.class_id),
      recheck_window_days: exam.recheck_window_days,
    });
    if (exam.status !== 'draft' && exam.status !== 'scheduled') {
      this.form.controls.title.disable();
      this.form.controls.exam_type.disable();
      this.form.controls.academic_year_id.disable();
      this.form.controls.start_date.disable();
      this.form.controls.is_internal.disable();
      this.form.controls.class_ids.disable();
    }
    if (exam.status === 'archived' || exam.status === 'published') {
      this.form.controls.end_date.disable();
    }
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const start = ymd(v.start_date);
    const end = ymd(v.end_date);
    if (!start || !end) {
      this.messages.add({ severity: 'warn', summary: 'Invalid dates', detail: 'Pick a start and end date' });
      return;
    }
    if (end < start) {
      this.messages.add({
        severity: 'warn',
        summary: 'Invalid dates',
        detail: 'end_date must be on or after start_date',
      });
      return;
    }
    if (this.editId()) {
      const body: Record<string, unknown> = {
        title: v.title,
        exam_type: v.exam_type,
        academic_year_id: v.academic_year_id,
        start_date: start,
        end_date: end,
        is_internal: !!v.is_internal,
        class_ids: v.class_ids,
        recheck_window_days: v.recheck_window_days,
      };
      this.submitting.set(true);
      this.api.update(this.editId()!, body).subscribe({
        next: (res) => {
          this.submitting.set(false);
          this.messages.add({ severity: 'success', summary: 'Saved', detail: res.message });
          void this.router.navigate(['/exams', res.data.id]);
        },
        error: (e: { error?: { message?: string } }) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'Update failed',
            detail: e.error?.message || 'Failed to update exam',
            life: 4000,
          });
        },
      });
      return;
    }

    const payload: ExamCreatePayload = {
      title: v.title.trim(),
      exam_type: v.exam_type as ExamType,
      academic_year_id: v.academic_year_id as number,
      start_date: start,
      end_date: end,
      is_internal: !!v.is_internal,
      class_ids: v.class_ids,
    };
    this.submitting.set(true);
    this.api.create(payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.messages.add({ severity: 'success', summary: 'Created', detail: res.message });
        void this.router.navigate(['/exams', res.data.id]);
      },
      error: (e: { error?: { message?: string } }) => {
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Create failed',
          detail: e.error?.message || 'Failed to create exam',
          life: 4000,
        });
      },
    });
  }
}
