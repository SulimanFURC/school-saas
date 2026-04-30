import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AcademicService, AcademicYearDto, SchoolClassDto, SectionDto } from '@app/services';
import {
  StudentCurrentEnrollmentDto,
  StudentListRow,
  StudentService,
} from '@app/services';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';

type LoadSource = 'class' | 'admission' | null;
type SelectionMode = 'all' | 'manual';

@Component({
  selector: 'app-student-promote',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    ToastModule,
    ProgressSpinnerModule,
    CheckboxModule,
  ],
  providers: [MessageService],
  templateUrl: './student-promote.component.html',
  styleUrl: './student-promote.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentPromoteComponent implements OnInit {
  private fb = inject(FormBuilder);
  private academic = inject(AcademicService);
  private students = inject(StudentService);
  private messages = inject(MessageService);
  private destroyRef = inject(DestroyRef);

  loading = signal(true);
  submitting = signal(false);
  years = signal<AcademicYearDto[]>([]);
  currentYear = signal<AcademicYearDto | null>(null);
  classes = signal<SchoolClassDto[]>([]);
  sections = signal<SectionDto[]>([]);
  studentRows = signal<StudentListRow[]>([]);
  selected = signal<Set<string>>(new Set());
  rollByStudentId = signal<Record<string, string>>({});

  studentsTableLoading = signal(false);
  listEmptyHint = signal<string | null>(null);

  /** How the table was last populated (drives refresh after promote). */
  lastLoadSource = signal<LoadSource>(null);
  selectionMode = signal<SelectionMode>('manual');
  /** Trimmed admission field — Search disabled when empty. */
  admissionTrim = signal('');

  private studentListRequestSeq = 0;

  form = this.fb.nonNullable.group({
    from_class_id: [null as number | null],
    admission_q: [''],
    to_academic_year_id: [null as number | null],
    to_class_id: [null as number | null],
    to_section_id: [null as number | null],
    roll_number: [null as number | null],
    repeat_class: [false],
  });

  ngOnInit(): void {
    this.form
      .get('repeat_class')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.applyRepeatUiState();
        this.patchTargetYearFromTable();
      });

    this.form
      .get('admission_q')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.admissionTrim.set(String(v ?? '').trim()));

    this.academic
      .listAcademicYears()
      .pipe(
        switchMap((y) => {
          this.years.set(y);
          return this.academic.getCurrentAcademicYear().pipe(catchError(() => of(null)));
        })
      )
      .subscribe({
        next: (cyRaw) => {
          const list = this.years();
          const cy = cyRaw || list.find((x) => x.is_active) || list[0] || null;
          this.currentYear.set(cy);
          this.loadClasses();
        },
        error: () => {
          this.currentYear.set(null);
          this.loading.set(false);
        },
      });
  }

  private loadClasses(): void {
    this.academic.listClasses(false).subscribe({
      next: (c) => {
        this.classes.set(c);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.notifyError(e.error?.message || 'Failed to load classes', 4000);
      },
    });
  }

  onFromClassChange(): void {
    this.lastLoadSource.set(null);
    this.selected.set(new Set());
    this.rollByStudentId.set({});
    this.studentRows.set([]);
    this.listEmptyHint.set(null);
    this.studentsTableLoading.set(false);
    this.form.patchValue({ admission_q: '' }, { emitEvent: false });
    this.admissionTrim.set('');
    const fromId = this.form.get('from_class_id')?.value ?? null;
    if (fromId) {
      this.lastLoadSource.set('class');
      this.loadStudentsForClass();
    }
    this.applyRepeatUiState();
    this.patchTargetYearFromTable();
  }

  onSelectionModeChange(mode: SelectionMode): void {
    this.selectionMode.set(mode);
    const rows = this.studentRows();
    if (mode === 'all' && rows.length) {
      this.selected.set(new Set(rows.map((r) => r.id)));
    } else {
      this.selected.set(new Set());
    }
  }

  private applyRepeatUiState(): void {
    const repeat = !!this.form.get('repeat_class')?.value;
    if (repeat) {
      this.syncRepeatTargetClassWithFrom();
      this.form.get('to_class_id')?.disable({ emitEvent: false });
      this.form.get('to_academic_year_id')?.disable({ emitEvent: false });
    } else {
      this.form.get('to_class_id')?.enable({ emitEvent: false });
      this.form.get('to_academic_year_id')?.enable({ emitEvent: false });
    }
  }

  private enrollmentYearId(row: StudentListRow): number | null {
    const ce = row.current_enrollment;
    if (!ce || typeof ce !== 'object') return null;
    const raw = (ce as StudentCurrentEnrollmentDto).academic_year_id;
    return typeof raw === 'number' && !Number.isNaN(raw) ? raw : null;
  }

  private enrollmentClassId(row: StudentListRow): number | null {
    const ce = row.current_enrollment;
    if (!ce || typeof ce !== 'object') return null;
    const raw = (ce as StudentCurrentEnrollmentDto).class_id;
    return typeof raw === 'number' && !Number.isNaN(raw) ? raw : null;
  }

  /** Single academic year for all rows in the table (null if empty or mixed). */
  sourceAcademicYearFromTable(): number | null {
    const rows = this.studentRows();
    if (!rows.length) return null;
    const ids = rows.map((r) => this.enrollmentYearId(r)).filter((id): id is number => id != null);
    const u = [...new Set(ids)];
    return u.length === 1 ? u[0] : null;
  }

  nextYearAfter(sourceYearId: number): AcademicYearDto | null {
    const after = this.years()
      .filter((y) => y.id > sourceYearId)
      .sort((a, b) => a.id - b.id);
    return after[0] ?? null;
  }

  /** Target academic year options: one adjacent year for promote, or source year label for repeat. */
  allowedTargetYears(): AcademicYearDto[] {
    const src = this.sourceAcademicYearFromTable();
    if (src == null) return [];
    if (this.form.get('repeat_class')?.value) {
      const y = this.years().find((x) => x.id === src);
      return y ? [y] : [{ id: src, name: `Year ${src}`, is_active: false }];
    }
    const n = this.nextYearAfter(src);
    return n ? [n] : [];
  }

  promoteNextYearMissing(): boolean {
    if (this.form.get('repeat_class')?.value) return false;
    const src = this.sourceAcademicYearFromTable();
    if (src == null) return false;
    return this.nextYearAfter(src) == null;
  }

  private patchTargetYearFromTable(): void {
    const src = this.sourceAcademicYearFromTable();
    const repeat = !!this.form.get('repeat_class')?.value;
    if (src == null) {
      this.form.patchValue({ to_academic_year_id: null }, { emitEvent: false });
      return;
    }
    if (repeat) {
      this.form.patchValue({ to_academic_year_id: src }, { emitEvent: false });
    } else {
      const next = this.nextYearAfter(src);
      this.form.patchValue({ to_academic_year_id: next ? next.id : null }, { emitEvent: false });
    }
  }

  private afterRowsLoaded(): void {
    this.patchTargetYearFromTable();
    if (this.selectionMode() === 'all' && this.studentRows().length) {
      this.selected.set(new Set(this.studentRows().map((r) => r.id)));
    } else if (this.selectionMode() === 'manual') {
      this.selected.set(new Set());
    }
    this.applyRepeatUiState();
  }

  searchByAdmission(): void {
    const q = this.admissionTrim();
    if (!q) return;
    const seq = ++this.studentListRequestSeq;
    this.studentsTableLoading.set(true);
    this.listEmptyHint.set(null);
    this.lastLoadSource.set('admission');
    this.students.lookupByAdmission(q).subscribe({
      next: (row) => {
        if (seq !== this.studentListRequestSeq) return;
        this.studentsTableLoading.set(false);
        if (!row) {
          this.studentRows.set([]);
          this.listEmptyHint.set('No student found with this admission number.');
          this.afterRowsLoaded();
          return;
        }
        this.studentRows.set([row]);
        this.listEmptyHint.set(null);
        const cid = this.enrollmentClassId(row);
        if (cid != null) {
          this.form.patchValue({ from_class_id: cid }, { emitEvent: false });
        }
        this.syncRepeatTargetClassWithFrom();
        this.afterRowsLoaded();
      },
      error: (e) => {
        if (seq !== this.studentListRequestSeq) return;
        this.studentsTableLoading.set(false);
        this.studentRows.set([]);
        const msg =
          e.status === 404
            ? e.error?.message || 'No student found with this admission number.'
            : e.error?.message || e.message || 'Lookup failed. Try again.';
        this.listEmptyHint.set(null);
        this.notifyError(msg, 6000);
        this.afterRowsLoaded();
      },
    });
  }

  private syncRepeatTargetClassWithFrom(): void {
    if (!this.form.get('repeat_class')?.value) return;
    const fromId = this.form.get('from_class_id')?.value ?? null;
    this.form.patchValue({ to_class_id: fromId }, { emitEvent: false });
    this.applyToClassSections(fromId);
  }

  private applyToClassSections(classId: number | null): void {
    this.form.patchValue({ to_section_id: null }, { emitEvent: false });
    if (!classId) {
      this.sections.set([]);
      return;
    }
    this.academic.listSections(classId).subscribe({
      next: (s) => this.sections.set(s),
      error: () => this.sections.set([]),
    });
  }

  loadStudentsForClass(): void {
    const cy = this.currentYear();
    const classId = this.form.get('from_class_id')?.value;
    if (!cy || !classId) {
      this.studentsTableLoading.set(false);
      return;
    }
    const seq = ++this.studentListRequestSeq;
    this.studentsTableLoading.set(true);
    this.listEmptyHint.set(null);
    this.students
      .list({
        page: 1,
        pageSize: 100,
        academic_year_id: cy.id,
        class_id: classId,
      })
      .subscribe({
        next: (res) => {
          if (seq !== this.studentListRequestSeq) return;
          this.studentsTableLoading.set(false);
          this.studentRows.set(res.data);
          if (res.data.length === 0) {
            this.listEmptyHint.set('No students in this class for the current session.');
          } else {
            this.listEmptyHint.set(null);
          }
          this.afterRowsLoaded();
        },
        error: (e) => {
          if (seq !== this.studentListRequestSeq) return;
          this.studentsTableLoading.set(false);
          this.studentRows.set([]);
          this.listEmptyHint.set(null);
          this.notifyError(e.error?.message || e.message || 'Failed to load students. Try again.', 5000);
        },
      });
  }

  enrollmentSessionName(row: StudentListRow): string {
    const ce = row.current_enrollment as StudentCurrentEnrollmentDto | null | undefined;
    const n = ce?.academicYear?.name;
    if (n != null && String(n).trim()) return String(n).trim();
    const id = ce?.academic_year_id;
    return id != null ? `Year ${id}` : '—';
  }

  enrollmentSectionName(row: StudentListRow): string {
    const ce = row.current_enrollment as StudentCurrentEnrollmentDto | null | undefined;
    const s = ce?.section?.name;
    return s != null && String(s).trim() ? String(s).trim() : '—';
  }

  enrollmentClassName(row: StudentListRow): string {
    const ce = row.current_enrollment as StudentCurrentEnrollmentDto | null | undefined;
    const c = ce?.schoolClass?.name;
    if (c != null && String(c).trim()) return String(c).trim();
    return row.class_name && String(row.class_name).trim() ? String(row.class_name) : '—';
  }

  setRollDraft(studentId: string, value: string): void {
    this.rollByStudentId.update((m) => ({ ...m, [studentId]: value }));
  }

  toggle(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  /** Row click to toggle selection; ignores clicks on inputs and controls. */
  onRowClick(ev: MouseEvent, id: string): void {
    const t = ev.target as HTMLElement | null;
    if (t?.closest('input, button, a, label, select, textarea')) return;
    this.toggle(id);
  }

  rowInitials(row: StudentListRow): string {
    const fn = (row.first_name ?? '').trim();
    const ln = (row.last_name ?? '').trim();
    let a = fn[0];
    let b = ln[0];
    if (!a || !b) {
      const name = (row.display_name || row.full_name || '').trim();
      const parts = name.split(/\s+/).filter(Boolean);
      a = a || parts[0]?.[0] || '?';
      b = b || (parts.length > 1 ? parts[parts.length - 1][0] : '') || '';
    }
    return (a + b).toUpperCase();
  }

  genderClass(row: StudentListRow): string {
    const g = (row.gender ?? '').toLowerCase();
    if (g === 'female' || g === 'f') return 'sp-gender--f';
    if (g === 'male' || g === 'm') return 'sp-gender--m';
    return 'sp-gender--na';
  }

  toggleAll(checked: boolean): void {
    if (!checked) {
      this.selected.set(new Set());
      return;
    }
    const next = new Set<string>();
    for (const r of this.studentRows()) {
      next.add(r.id);
    }
    this.selected.set(next);
  }

  allRowsSelected(): boolean {
    const rows = this.studentRows();
    if (!rows.length) return false;
    return rows.every((r) => this.selected().has(r.id));
  }

  onToClassChange(): void {
    if (this.form.get('repeat_class')?.value) {
      return;
    }
    const id = this.form.get('to_class_id')?.value ?? null;
    this.applyToClassSections(id);
  }

  private resolveSourceAcademicYearFromSelection(): number | null {
    const ids = [...this.selected()];
    const rows = this.studentRows().filter((r) => ids.includes(r.id));
    const ys = rows.map((r) => this.enrollmentYearId(r)).filter((x): x is number => x != null);
    const u = [...new Set(ys)];
    return u.length === 1 ? u[0] : null;
  }

  submit(): void {
    const cy = this.currentYear();
    const v = this.form.getRawValue();
    const ids = [...this.selected()];
    if (!cy) {
      this.notifyError('No current academic year', 4000);
      return;
    }
    if (ids.length === 0) {
      this.notifyError('Select at least one student', 4000);
      return;
    }
    if (!v.to_academic_year_id || !v.to_class_id || !v.to_section_id) {
      this.notifyError('Select promote session, target class and section', 4000);
      return;
    }
    if (!v.from_class_id) {
      this.notifyError('Select promotion from class', 4000);
      return;
    }
    const fromYearId = this.resolveSourceAcademicYearFromSelection();
    if (fromYearId == null) {
      this.notifyError('Selected students must share the same session. Reload the list and try again.', 6000);
      return;
    }
    if (!v.repeat_class && this.promoteNextYearMissing()) {
      this.notifyError('Create the next academic year before promoting to the next session.', 6000);
      return;
    }

    const drafts = this.rollByStudentId();
    const rolls = ids
      .map((id) => {
        const raw = (drafts[id] ?? '').trim();
        if (raw === '') return null;
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) return null;
        return { student_id: id, roll_number: n };
      })
      .filter((r): r is { student_id: string; roll_number: number } => r != null);

    this.submitting.set(true);
    this.students
      .promote({
        student_ids: ids,
        from_academic_year_id: fromYearId,
        from_class_id: v.from_class_id,
        to_academic_year_id: v.to_academic_year_id,
        to_class_id: v.to_class_id,
        to_section_id: v.to_section_id,
        kind: v.repeat_class ? 'repeat' : 'promote',
        roll_number: v.roll_number ?? undefined,
        ...(rolls.length ? { rolls } : {}),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.notifySuccess('Promotion saved', 4000);
          this.selected.set(new Set());
          this.rollByStudentId.set({});
          this.refreshAfterPromote();
        },
        error: (e) => {
          this.submitting.set(false);
          this.notifyError(e.error?.message || 'Promotion failed', 6000);
        },
      });
  }

  private refreshAfterPromote(): void {
    const src = this.lastLoadSource();
    const adm = this.admissionTrim();
    if (src === 'admission' && adm) {
      this.searchByAdmission();
      return;
    }
    if (src === 'class') {
      this.loadStudentsForClass();
      return;
    }
  }

  private notifyError(detail: string, life: number): void {
    this.messages.add({ severity: 'error', summary: 'Error', detail: String(detail), life });
  }

  private notifySuccess(detail: string, life: number): void {
    this.messages.add({ severity: 'success', summary: 'Success', detail: String(detail), life });
  }
}
