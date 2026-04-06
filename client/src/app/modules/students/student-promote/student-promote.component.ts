import { Component, OnInit, inject, signal } from '@angular/core';
import { catchError, of, switchMap } from 'rxjs';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AcademicService, AcademicYearDto, SchoolClassDto, SectionDto } from '../../../services/academic.service';
import { StudentService, StudentListRow } from '../../../services/student.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-student-promote',
  imports: [ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './student-promote.component.html',
  styleUrl: './student-promote.component.scss',
})
export class StudentPromoteComponent implements OnInit {
  private fb = inject(FormBuilder);
  private academic = inject(AcademicService);
  private students = inject(StudentService);
  private toast = inject(ToastService);

  loading = signal(true);
  submitting = signal(false);
  years = signal<AcademicYearDto[]>([]);
  currentYear = signal<AcademicYearDto | null>(null);
  classes = signal<SchoolClassDto[]>([]);
  sections = signal<SectionDto[]>([]);
  studentRows = signal<StudentListRow[]>([]);
  selected = signal<Set<string>>(new Set());
  searchQ = signal('');

  form = this.fb.nonNullable.group({
    from_class_id: [null as number | null],
    to_academic_year_id: [null as number | null],
    to_class_id: [null as number | null],
    to_section_id: [null as number | null],
    roll_number: [null as number | null],
    repeat_class: [false],
  });

  ngOnInit(): void {
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
          if (cy && list.length) {
            const nextYear = list.find((row) => row.id > cy.id) || list.find((row) => row.id !== cy.id);
            if (nextYear) {
              this.form.patchValue({ to_academic_year_id: nextYear.id });
            }
          }
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
        this.toast.open(e.error?.message || 'Failed to load classes', 'Dismiss', { duration: 4000 });
      },
    });
  }

  onFromClassChange(): void {
    this.selected.set(new Set());
    this.studentRows.set([]);
    if (!this.form.get('from_class_id')?.value) return;
    this.loadStudentsForClass();
  }

  loadStudentsForClass(): void {
    const cy = this.currentYear();
    const classId = this.form.get('from_class_id')?.value;
    const q = this.searchQ().trim();
    if (!cy || !classId) return;
    this.students
      .list({
        page: 1,
        pageSize: 500,
        academic_year_id: cy.id,
        class_id: classId,
        q: q || undefined,
      })
      .subscribe({
        next: (res) => {
          this.studentRows.set(res.data);
        },
        error: (e) =>
          this.toast.open(e.error?.message || 'Failed to load students', 'Dismiss', { duration: 4000 }),
      });
  }

  search(): void {
    this.loadStudentsForClass();
  }

  toggle(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
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

  onToClassChange(): void {
    const id = this.form.get('to_class_id')?.value;
    this.form.patchValue({ to_section_id: null });
    if (!id) {
      this.sections.set([]);
      return;
    }
    this.academic.listSections(id).subscribe({
      next: (s) => this.sections.set(s),
      error: () => this.sections.set([]),
    });
  }

  submit(): void {
    const cy = this.currentYear();
    const v = this.form.getRawValue();
    const ids = [...this.selected()];
    if (!cy) {
      this.toast.open('No current academic year', 'Dismiss', { duration: 4000 });
      return;
    }
    if (ids.length === 0) {
      this.toast.open('Select at least one student', 'Dismiss', { duration: 4000 });
      return;
    }
    if (!v.to_academic_year_id || !v.to_class_id || !v.to_section_id) {
      this.toast.open('Select promote session, target class and section', 'Dismiss', { duration: 4000 });
      return;
    }
    if (!v.from_class_id) {
      this.toast.open('Select promotion from class', 'Dismiss', { duration: 4000 });
      return;
    }
    this.submitting.set(true);
    this.students
      .promote({
        student_ids: ids,
        from_academic_year_id: cy.id,
        from_class_id: v.from_class_id,
        to_academic_year_id: v.to_academic_year_id,
        to_class_id: v.to_class_id,
        to_section_id: v.to_section_id,
        kind: v.repeat_class ? 'repeat' : 'promote',
        roll_number: v.roll_number ?? undefined,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.toast.open('Promotion saved', 'Dismiss', { duration: 4000 });
          this.selected.set(new Set());
          this.loadStudentsForClass();
        },
        error: (e) => {
          this.submitting.set(false);
          this.toast.open(e.error?.message || 'Promotion failed', 'Dismiss', { duration: 6000 });
        },
      });
  }

  futureYears(): AcademicYearDto[] {
    const cy = this.currentYear();
    const list = this.years();
    if (!cy) return list;
    return list.filter((y) => y.id >= cy.id);
  }
}
