import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, forkJoin, of } from 'rxjs';

import {
  AcademicService,
  CreateClassPayload,
  SchoolClassDto,
  SectionInput,
  UpdateClassPayload,
} from '@app/services';
import { LookupService } from '@app/services';
import { TeacherListRow, TeacherService } from '@app/services';

interface TeacherOption {
  label: string;
  value: string;
  disabled?: boolean;
  hint?: string;
}

@Component({
  selector: 'app-class-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './class-form.component.html',
  styleUrl: './class-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(AcademicService);
  private teachers = inject(TeacherService);
  private lookup = inject(LookupService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private messages = inject(MessageService);
  private destroyRef = inject(DestroyRef);

  readonly editId = signal<number | null>(null);
  readonly pageTitle = computed(() => (this.editId() ? 'Edit class' : 'Add class'));

  loading = signal(false);
  submitting = signal(false);

  teacherOptions = signal<TeacherOption[]>([]);
  /** Map of teacher id -> id of class they are already assigned to. */
  private teacherAssignments = signal<Record<string, number>>({});

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    class_teacher_id: ['', Validators.required],
    sections: this.fb.array<FormControl<SectionInput>>([]),
  });

  ngOnInit(): void {
    this.loadInitial();
  }

  get sectionsArray(): FormArray<FormControl<SectionInput>> {
    return this.form.controls.sections;
  }

  private loadInitial(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;
    if (id) {
      this.editId.set(id);
    }

    this.loading.set(true);
    forkJoin({
      classes: this.api.listClasses(false).pipe(catchError(() => of([] as SchoolClassDto[]))),
      teachers: this.teachers.list({ pageSize: 200 }).pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load teachers',
            life: 5000,
          });
          return of({ data: [] as TeacherListRow[], total: 0, page: 1, pageSize: 0, totalPages: 1 });
        })
      ),
      currentClass: id
        ? this.api.getClass(id).pipe(
            catchError((e: { error?: { message?: string } }) => {
              this.messages.add({
                severity: 'error',
                summary: 'Error',
                detail: e.error?.message || 'Failed to load class',
                life: 5000,
              });
              return of(null as SchoolClassDto | null);
            })
          )
        : of(null as SchoolClassDto | null),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ classes, teachers, currentClass }) => {
        const assignments: Record<string, number> = {};
        for (const cls of classes) {
          if (cls.class_teacher_id) {
            assignments[cls.class_teacher_id] = cls.id;
          }
        }
        this.teacherAssignments.set(assignments);
        this.buildTeacherOptions(teachers.data);

        if (id && !currentClass) {
          void this.router.navigate(['/classes']);
          return;
        }

        if (currentClass) {
          this.applyClass(currentClass);
        } else {
          this.addSection('A');
        }
      });
  }

  private buildTeacherOptions(rows: TeacherListRow[]): void {
    const editId = this.editId();
    const assignments = this.teacherAssignments();
    const options: TeacherOption[] = rows.map((t) => {
      const fullName = `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || t.email;
      const assignedTo = assignments[t.id];
      const taken = assignedTo != null && assignedTo !== editId;
      return {
        label: t.designation ? `${fullName} — ${t.designation}` : fullName,
        value: t.id,
        disabled: taken,
        hint: taken ? 'Already assigned to another class' : undefined,
      };
    });
    options.sort((a, b) => a.label.localeCompare(b.label));
    this.teacherOptions.set(options);
  }

  private applyClass(cls: SchoolClassDto): void {
    this.form.patchValue({
      name: cls.name ?? '',
      class_teacher_id: cls.class_teacher_id ?? '',
    });
    const arr = this.sectionsArray;
    arr.clear();
    const sections = (cls.sections ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    if (sections.length === 0) {
      this.addSection('A');
    } else {
      for (const s of sections) {
        arr.push(this.fb.nonNullable.control<SectionInput>({ id: s.id, name: s.name }));
      }
    }
  }

  addSection(initialName = ''): void {
    this.sectionsArray.push(
      this.fb.nonNullable.control<SectionInput>({ name: initialName })
    );
  }

  removeSection(index: number): void {
    if (this.sectionsArray.length <= 1) {
      this.messages.add({
        severity: 'warn',
        summary: 'At least one section',
        detail: 'A class must have at least one section.',
        life: 4000,
      });
      return;
    }
    this.sectionsArray.removeAt(index);
  }

  updateSectionName(index: number, value: string): void {
    const ctrl = this.sectionsArray.at(index);
    if (!ctrl) return;
    const current = ctrl.value;
    ctrl.setValue({ ...current, name: value });
    ctrl.markAsTouched();
  }

  trackSection(index: number): number {
    return index;
  }

  /** Show error from the FormArray controls — currently only validates at submit. */
  hasDuplicateSections(): boolean {
    const seen = new Set<string>();
    for (const ctrl of this.sectionsArray.controls) {
      const name = ctrl.value.name?.trim().toLowerCase() ?? '';
      if (!name) continue;
      if (seen.has(name)) return true;
      seen.add(name);
    }
    return false;
  }

  hasEmptySection(): boolean {
    return this.sectionsArray.controls.some((c) => !c.value.name?.trim());
  }

  submit(): void {
    this.form.markAllAsTouched();
    const sectionInputs: SectionInput[] = this.sectionsArray.controls.map((c) => {
      const v = c.value;
      const name = (v.name ?? '').trim();
      return v.id != null ? { id: v.id, name } : { name };
    });

    if (this.hasEmptySection()) {
      this.messages.add({
        severity: 'warn',
        summary: 'Sections',
        detail: 'All section names must be filled.',
        life: 4000,
      });
      return;
    }
    if (this.hasDuplicateSections()) {
      this.messages.add({
        severity: 'warn',
        summary: 'Sections',
        detail: 'Section names must be unique within the class.',
        life: 4000,
      });
      return;
    }
    if (this.form.invalid) {
      return;
    }

    const id = this.editId();
    const v = this.form.getRawValue();

    if (id != null) {
      const payload: UpdateClassPayload = {
        name: v.name.trim(),
        class_teacher_id: v.class_teacher_id,
        sections: sectionInputs,
      };
      this.submitting.set(true);
      this.api
        .updateClass(id, payload)
        .pipe(
          finalize(() => this.submitting.set(false)),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe({
          next: () => {
            this.lookup.invalidateClasses();
            this.messages.add({
              severity: 'success',
              summary: 'Saved',
              detail: 'Class updated.',
              life: 4000,
            });
            void this.router.navigate(['/classes']);
          },
          error: (e: { error?: { message?: string } }) => {
            this.messages.add({
              severity: 'error',
              summary: 'Error',
              detail: e.error?.message || 'Update failed',
              life: 5000,
            });
          },
        });
      return;
    }

    const createPayload: CreateClassPayload = {
      name: v.name.trim(),
      class_teacher_id: v.class_teacher_id,
      sections: sectionInputs.map((s) => ({ name: s.name })),
    };
    this.submitting.set(true);
    this.api
      .createClass(createPayload)
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.lookup.invalidateClasses();
          this.messages.add({
            severity: 'success',
            summary: 'Created',
            detail: 'Class created with sections.',
            life: 4000,
          });
          void this.router.navigate(['/classes']);
        },
        error: (e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Create failed',
            life: 5000,
          });
        },
      });
  }
}
