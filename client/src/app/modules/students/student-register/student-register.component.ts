import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AcademicService, SchoolClassDto } from '../../../services/academic.service';
import { StudentService } from '../../../services/student.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-student-register',
  imports: [FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './student-register.component.html',
  styleUrl: './student-register.component.scss',
})
export class StudentRegisterComponent implements OnInit {
  private fb = inject(FormBuilder);
  private academic = inject(AcademicService);
  private students = inject(StudentService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly step = signal(0);
  readonly stepLabels = ['Personal', 'Guardian', 'Medical', 'Previous school', 'Address & enrollment'];

  classes: SchoolClassDto[] = [];
  sections: { id: number; name: string }[] = [];
  years: { id: number; name: string | null }[] = [];

  s1 = this.fb.nonNullable.group({
    admission_no: ['', Validators.required],
    first_name: [''],
    last_name: [''],
    gender: [''],
    dob: [''],
    phone: [''],
    email: [''],
  });

  s2 = this.fb.group({
    guardian_type: ['father'],
    father_name: [''],
    father_phone: [''],
    father_occupation: [''],
    mother_name: [''],
    mother_occupation: [''],
    guardian_name: [''],
    guardian_phone: [''],
    guardian_occupation: [''],
    guardian_relation: [''],
    guardian_address: [''],
  });

  s3 = this.fb.group({
    blood_group: [''],
    height_cm: [''],
    weight_kg: [''],
  });

  s4 = this.fb.group({
    school_name: [''],
    school_address: [''],
    current_school_name: [''],
  });

  s5 = this.fb.nonNullable.group({
    current_address: [''],
    permanent_address: [''],
    extra_details: [''],
    bank_name: [''],
    bank_branch: [''],
    bank_ifsc: [''],
    hostel_name: [''],
    room_no: [''],
    room_type: [''],
    academic_year_id: [null as number | null, Validators.required],
    class_id: [null as number | null, Validators.required],
    section_id: [null as number | null, Validators.required],
    roll_number: [null as number | null],
    category: [''],
    create_student_login: [false],
  });

  submitting = false;

  ngOnInit(): void {
    this.academic.listClasses().subscribe({
      next: (c) => (this.classes = c),
      error: (e) => this.toast.open(e.error?.message || 'Failed to load classes', 'Dismiss', { duration: 4000 }),
    });
    this.academic.listAcademicYears().subscribe({
      next: (y) => (this.years = y),
      error: (e) => this.toast.open(e.error?.message || 'Failed to load years', 'Dismiss', { duration: 4000 }),
    });

    this.s5.get('class_id')?.valueChanges.subscribe((id) => {
      this.s5.patchValue({ section_id: null }, { emitEvent: false });
      if (!id) {
        this.sections = [];
        return;
      }
      this.academic.listSections(id).subscribe({
        next: (s) => (this.sections = s),
        error: () => (this.sections = []),
      });
    });
  }

  private formForStep(i: number): FormGroup | null {
    switch (i) {
      case 0:
        return this.s1;
      case 1:
        return this.s2;
      case 2:
        return this.s3;
      case 3:
        return this.s4;
      case 4:
        return this.s5;
      default:
        return null;
    }
  }

  goNext(): void {
    const i = this.step();
    const fg = this.formForStep(i);
    if (fg) {
      fg.markAllAsTouched();
      if (fg.invalid) return;
    }
    this.step.set(Math.min(4, i + 1));
  }

  goPrev(): void {
    this.step.update((s) => Math.max(0, s - 1));
  }

  progressPercent(): number {
    return ((this.step() + 1) / 5) * 100;
  }

  categoryOptions(): string[] {
    const cid = this.s5.getRawValue().class_id;
    const cls = this.classes.find((c) => c.id === cid);
    const name = cls?.name?.trim() || '';
    const n = parseInt(name.replace(/\D/g, ''), 10);
    if (n === 9 || n === 10) return ['Science', 'Arts'];
    if (n === 11 || n === 12) return ['Pre-Engineering', 'Medical', 'Computer Science'];
    return [];
  }

  submit(): void {
    const v1 = this.s1.getRawValue();
    const v5 = this.s5.getRawValue();
    if (this.s1.invalid || this.s5.invalid) {
      this.s1.markAllAsTouched();
      this.s5.markAllAsTouched();
      this.toast.open('Please complete required fields', 'Dismiss', { duration: 4000 });
      return;
    }

    this.submitting = true;
    const g = this.s2.getRawValue();
    const m = this.s3.getRawValue();
    const ps = this.s4.getRawValue();

    this.students
      .register({
        admission_no: v1.admission_no.trim(),
        first_name: v1.first_name || undefined,
        last_name: v1.last_name || undefined,
        gender: v1.gender || undefined,
        dob: v1.dob || undefined,
        phone: v1.phone || undefined,
        email: v1.email || undefined,
        blood_group: m.blood_group || undefined,
        height_cm: m.height_cm || undefined,
        weight_kg: m.weight_kg || undefined,
        current_address: v5.current_address || undefined,
        permanent_address: v5.permanent_address || undefined,
        extra_details: v5.extra_details || undefined,
        bank_name: v5.bank_name || undefined,
        bank_branch: v5.bank_branch || undefined,
        bank_ifsc: v5.bank_ifsc || undefined,
        hostel_name: v5.hostel_name || undefined,
        room_no: v5.room_no || undefined,
        room_type: v5.room_type || undefined,
        guardian: {
          guardian_type: g.guardian_type || undefined,
          father_name: g.father_name || undefined,
          father_phone: g.father_phone || undefined,
          father_occupation: g.father_occupation || undefined,
          mother_name: g.mother_name || undefined,
          mother_occupation: g.mother_occupation || undefined,
          guardian_name: g.guardian_name || undefined,
          guardian_phone: g.guardian_phone || undefined,
          guardian_occupation: g.guardian_occupation || undefined,
          guardian_relation: g.guardian_relation || undefined,
          guardian_address: g.guardian_address || undefined,
        },
        previous_school: {
          school_name: ps.school_name || undefined,
          school_address: ps.school_address || undefined,
          current_school_name: ps.current_school_name || undefined,
        },
        enrollment: {
          academic_year_id: Number(v5.academic_year_id),
          class_id: Number(v5.class_id),
          section_id: Number(v5.section_id),
          roll_number: v5.roll_number ?? undefined,
          category: v5.category || undefined,
        },
        create_student_login: !!v5.create_student_login,
      })
      .subscribe({
        next: (res) => {
          this.submitting = false;
          const st = res.student as { id?: string };
          const msg = res.login?.username
            ? `Created. Student login: ${res.login.username} (inactive)`
            : 'Student registered';
          this.toast.open(msg, 'Dismiss', { duration: 6000 });
          if (st?.id) void this.router.navigate(['/students', st.id]);
          else void this.router.navigate(['/students']);
        },
        error: (e) => {
          this.submitting = false;
          this.toast.open(e.error?.message || 'Registration failed', 'Dismiss', { duration: 6000 });
        },
      });
  }
}
