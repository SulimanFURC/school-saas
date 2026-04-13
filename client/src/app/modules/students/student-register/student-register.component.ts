import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';

import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { Textarea as PrimeTextarea } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';

import { AcademicService, SchoolClassDto } from '../../../services/academic.service';
import { StudentService, resolveStudentFirstLast } from '../../../services/student.service';

const BLOOD_OPTIONS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'A1+',
  'A1-',
  'Bombay',
  'Unknown',
];

function optionalEmailValidator(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  if (v == null || String(v).trim() === '') return null;
  return Validators.email(control);
}

function optionalLoginPasswordValidator(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  if (v == null || String(v).trim() === '') return null;
  return String(v).length >= 6 ? null : { minlength: { requiredLength: 6, actualLength: String(v).length } };
}

const PHOTO_ACCEPT = 'image/png,image/jpeg,image/jpg';

const GUARDIAN_TYPE_OPTIONS = [
  { label: 'Father', value: 'father' },
  { label: 'Mother', value: 'mother' },
  { label: 'Other', value: 'other' },
] as const;

const GENDER_OPTIONS: { label: string; value: string }[] = [
  { label: '—', value: '' },
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];

function parseYmdToLocalDate(ymd: string): Date | null {
  const parts = ymd.trim().split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDobForApi(v: Date | string | null | undefined): string | undefined {
  if (v == null || v === '') return undefined;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return undefined;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  return s ? s.slice(0, 10) : undefined;
}

function readFileAsBase64Payload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf('base64,');
      resolve(i >= 0 ? s.slice(i + 7) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

@Component({
  selector: 'app-student-register',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    PrimeTextarea,
    SelectModule,
    DatePickerModule,
    InputNumberModule,
    CheckboxModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './student-register.component.html',
  styleUrl: './student-register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentRegisterComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private academic = inject(AcademicService);
  private students = inject(StudentService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private messages = inject(MessageService);

  readonly bloodOptions = BLOOD_OPTIONS;
  readonly guardianTypeOptions: { label: string; value: string }[] = [...GUARDIAN_TYPE_OPTIONS];
  readonly genderOptions = GENDER_OPTIONS;

  /** Set when route is `/students/:id/edit` */
  readonly editStudentId = signal<string | null>(null);
  readonly loadingEdit = signal(false);
  readonly pageTitle = computed(() =>
    this.editStudentId() ? 'Edit student' : 'Register student'
  );

  hasLoginAccount = false;

  classes: SchoolClassDto[] = [];
  sections: { id: number; name: string }[] = [];
  years: { id: number; name: string | null }[] = [];

  s1 = this.fb.nonNullable.group({
    admission_no: ['', [Validators.required, Validators.maxLength(50)]],
    first_name: ['', [Validators.required, Validators.maxLength(100)]],
    last_name: ['', [Validators.maxLength(100)]],
    gender: [''],
    dob: [null as Date | null],
    phone: ['', [Validators.maxLength(20)]],
    email: ['', [optionalEmailValidator]],
  });

  s2 = this.fb.group({
    guardian_type: ['father'],
    father_name: [''],
    father_phone: [''],
    father_occupation: [''],
    mother_name: [''],
    mother_phone: [''],
    mother_occupation: [''],
    guardian_name: [''],
    guardian_phone: [''],
    guardian_occupation: [''],
    guardian_relation: [''],
    guardian_address: [''],
  });

  s3 = this.fb.group({
    blood_group: [''],
  });

  s4 = this.fb.group({
    school_name: [''],
    school_address: [''],
  });

  s5 = this.fb.nonNullable.group({
    current_address: [''],
    permanent_address: [''],
    extra_details: [''],
    room_type: [''],
    academic_year_id: [null as number | null, Validators.required],
    class_id: [null as number | null, Validators.required],
    section_id: [null as number | null, Validators.required],
    roll_number: [null as number | null],
    category: [''],
    create_student_login: [true],
    login_password: ['', [optionalLoginPasswordValidator]],
  });

  submitting = false;

  /** New file chosen for upload (register / edit). */
  photoFile: File | null = null;
  /** Object URL for `photoFile` preview. */
  private localPreviewUrl: string | null = null;
  /** Data URL built from API `photo_base64` (edit). */
  private existingPhotoDataUrl: string | null = null;
  /** Legacy external HTTP photo URL. */
  legacyPhotoHttp: string | null = null;
  /** User removes saved photo on edit (no new file). */
  removeExistingPhoto = false;
  readonly photoInputAccept = PHOTO_ACCEPT;

  ngOnDestroy(): void {
    this.revokeLocalPreview();
  }

  private revokeLocalPreview(): void {
    if (this.localPreviewUrl) {
      URL.revokeObjectURL(this.localPreviewUrl);
      this.localPreviewUrl = null;
    }
  }

  /** Shown in the preview box (new selection, or existing photo). */
  photoPreviewDisplay(): string | null {
    if (this.removeExistingPhoto && !this.localPreviewUrl) return null;
    return this.localPreviewUrl || this.existingPhotoDataUrl || this.legacyPhotoHttp;
  }

  onPhotoFileChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.removeExistingPhoto = false;
    if (!file) {
      this.photoFile = null;
      this.revokeLocalPreview();
      return;
    }
    const ok = /^image\/(png|jpeg|jpg)$/i.test(file.type);
    if (!ok) {
      this.notifyError('Please choose a PNG or JPEG image', 4000);
      input.value = '';
      this.photoFile = null;
      this.revokeLocalPreview();
      return;
    }
    this.photoFile = file;
    this.revokeLocalPreview();
    this.localPreviewUrl = URL.createObjectURL(file);
  }

  clearPhotoFile(): void {
    this.photoFile = null;
    this.revokeLocalPreview();
  }

  removeSavedPhoto(): void {
    this.removeExistingPhoto = true;
    this.existingPhotoDataUrl = null;
    this.legacyPhotoHttp = null;
  }

  ngOnInit(): void {
    const editId = this.route.snapshot.paramMap.get('id');
    this.loadingEdit.set(!!editId);

    forkJoin({
      classes: this.academic.listClasses(),
      years: this.academic.listAcademicYears(),
      student: editId ? this.students.getById(editId) : of(null),
    }).subscribe({
      next: ({ classes, years, student }) => {
        this.classes = classes;
        this.years = years;
        if (editId) {
          this.editStudentId.set(editId);
          if (student && typeof student === 'object') {
            this.applyStudentData(student as Record<string, unknown>);
          } else {
            this.notifyError('Student not found', 4000);
            void this.router.navigate(['/students']);
          }
        }
        this.loadingEdit.set(false);
      },
      error: (e) => {
        this.loadingEdit.set(false);
        this.notifyError(e.error?.message || 'Failed to load form data', 5000);
        if (editId) void this.router.navigate(['/students']);
      },
    });

    this.s5.get('class_id')?.valueChanges.subscribe((id) => {
      this.s5.patchValue({ section_id: null, category: '' }, { emitEvent: false });
      if (!id) {
        this.sections = [];
        this.updateCategoryValidators();
        return;
      }
      this.academic.listSections(id).subscribe({
        next: (s) => (this.sections = s),
        error: () => (this.sections = []),
      });
      this.updateCategoryValidators();
    });

    this.s2.get('guardian_type')?.valueChanges.subscribe((t) => {
      this.applyGuardianValidators(String(t || 'father'));
    });
    this.applyGuardianValidators('father');
  }

  private applyStudentData(d: Record<string, unknown>): void {
    this.clearPhotoFile();
    this.existingPhotoDataUrl = null;
    this.legacyPhotoHttp = null;
    this.removeExistingPhoto = false;

    const rawPhotoUrl = d['photo_url'];
    const legacyHttp =
      typeof rawPhotoUrl === 'string' && /^https?:\/\//i.test(String(rawPhotoUrl).trim());
    if (legacyHttp) {
      this.legacyPhotoHttp = String(rawPhotoUrl).trim();
    } else {
      const b64 = d['photo_base64'];
      const mime = String(d['photo_mime'] || 'image/jpeg');
      if (typeof b64 === 'string' && b64.trim()) {
        this.existingPhotoDataUrl = `data:${mime};base64,${b64.trim()}`;
      }
    }

    const dobRaw = d['dob'];
    let dobStr = '';
    if (dobRaw != null && dobRaw !== '') {
      const s =
        typeof dobRaw === 'string'
          ? dobRaw
          : dobRaw instanceof Date
            ? dobRaw.toISOString()
            : String(dobRaw);
      dobStr = s.slice(0, 10);
    }

    const { first_name: fn, last_name: ln } = resolveStudentFirstLast(d);
    this.s1.patchValue({
      admission_no: String(d['admission_no'] ?? d['admissionNo'] ?? ''),
      first_name: fn,
      last_name: ln,
      gender: String(d['gender'] ?? ''),
      dob: dobStr ? parseYmdToLocalDate(dobStr) : null,
      phone: String(d['phone'] ?? ''),
      email: String(d['email'] ?? ''),
    });

    const g = d['guardian'] as Record<string, unknown> | undefined;
    if (g && typeof g === 'object') {
      const gt = String(g['guardian_type'] ?? 'father');
      this.s2.patchValue({
        guardian_type: gt,
        father_name: String(g['father_name'] ?? ''),
        father_phone: String(g['father_phone'] ?? ''),
        father_occupation: String(g['father_occupation'] ?? ''),
        mother_name: String(g['mother_name'] ?? ''),
        mother_phone: String(g['mother_phone'] ?? ''),
        mother_occupation: String(g['mother_occupation'] ?? ''),
        guardian_name: String(g['guardian_name'] ?? ''),
        guardian_phone: String(g['guardian_phone'] ?? ''),
        guardian_occupation: String(g['guardian_occupation'] ?? ''),
        guardian_relation: String(g['guardian_relation'] ?? ''),
        guardian_address: String(g['guardian_address'] ?? ''),
      });
      this.applyGuardianValidators(gt);
    }

    this.s3.patchValue({
      blood_group: String(d['blood_group'] ?? ''),
    });

    const ps = (d['previousSchool'] ?? d['previous_school']) as Record<string, unknown> | undefined;
    if (ps && typeof ps === 'object') {
      this.s4.patchValue({
        school_name: String(ps['school_name'] ?? ''),
        school_address: String(ps['school_address'] ?? ''),
      });
    }

    this.s5.patchValue({
      current_address: String(d['current_address'] ?? ''),
      permanent_address: String(d['permanent_address'] ?? ''),
      extra_details: String(d['extra_details'] ?? ''),
      room_type: String(d['room_type'] ?? ''),
      create_student_login: false,
      login_password: '',
    });

    const login = d['login_user'] as Record<string, unknown> | undefined;
    this.hasLoginAccount = !!(login && login['username']);

    let ce = d['current_enrollment'] as Record<string, unknown> | undefined;
    if (!ce || !ce['academic_year_id']) {
      const enrollments = d['enrollments'] as Record<string, unknown>[] | undefined;
      if (Array.isArray(enrollments) && enrollments.length) {
        ce = enrollments[0];
      }
    }
    if (ce && ce['academic_year_id'] != null) {
      const ayId = Number(ce['academic_year_id']);
      const cid = Number(ce['class_id']);
      const sid = Number(ce['section_id']);
      this.s5.patchValue({
        academic_year_id: Number.isNaN(ayId) ? null : ayId,
        class_id: Number.isNaN(cid) ? null : cid,
        roll_number:
          ce['roll_number'] != null && ce['roll_number'] !== ''
            ? Number(ce['roll_number'])
            : null,
        category: String(ce['category'] ?? ''),
      });
      if (!Number.isNaN(cid) && cid) {
        this.academic.listSections(cid).subscribe({
          next: (secList) => {
            this.sections = secList;
            this.s5.patchValue(
              { section_id: Number.isNaN(sid) ? null : sid },
              { emitEvent: false }
            );
            this.updateCategoryValidators();
          },
          error: () => (this.sections = []),
        });
      }
    }
  }

  updateCategoryValidators(): void {
    const cat = this.s5.get('category');
    if (!cat) return;
    if (this.categoryOptions().length > 0) {
      cat.setValidators([Validators.required]);
    } else {
      cat.clearValidators();
    }
    cat.updateValueAndValidity({ emitEvent: false });
  }

  private applyGuardianValidators(type: string): void {
    const fields = [
      'father_name',
      'father_phone',
      'father_occupation',
      'mother_name',
      'mother_phone',
      'mother_occupation',
      'guardian_name',
      'guardian_phone',
      'guardian_occupation',
      'guardian_relation',
      'guardian_address',
    ];
    for (const f of fields) {
      this.s2.get(f)?.clearValidators();
    }
    if (type === 'father') {
      this.s2.get('father_name')?.setValidators([Validators.required, Validators.maxLength(100)]);
      this.s2.get('father_phone')?.setValidators([Validators.required, Validators.maxLength(20)]);
    } else if (type === 'mother') {
      this.s2.get('mother_name')?.setValidators([Validators.required, Validators.maxLength(100)]);
      this.s2.get('mother_phone')?.setValidators([Validators.required, Validators.maxLength(20)]);
    } else {
      this.s2.get('guardian_name')?.setValidators([Validators.required, Validators.maxLength(100)]);
      this.s2.get('guardian_phone')?.setValidators([Validators.required, Validators.maxLength(20)]);
      this.s2.get('guardian_occupation')?.setValidators([Validators.maxLength(100)]);
      this.s2.get('guardian_relation')?.setValidators([Validators.required, Validators.maxLength(100)]);
      this.s2.get('guardian_address')?.setValidators([Validators.required]);
    }
    for (const f of fields) {
      this.s2.get(f)?.updateValueAndValidity({ emitEvent: false });
    }
  }

  showErr(fg: FormGroup, name: string): boolean {
    const c = fg.get(name);
    return !!(c && c.invalid && c.touched);
  }

  errMsg(fg: FormGroup, name: string): string {
    const c = fg.get(name);
    if (!c || !c.errors || !c.touched) return '';
    const e = c.errors;
    if (e['required']) return 'This field is required';
    if (e['email']) return 'Enter a valid email address';
    if (e['maxlength']) {
      const max = e['maxlength'].requiredLength as number;
      return `Maximum length is ${max} characters`;
    }
    if (e['minlength']) {
      const min = e['minlength'].requiredLength as number;
      return `Must be at least ${min} characters`;
    }
    return 'Invalid value';
  }

  private firstInvalidMessage(fg: FormGroup): string | null {
    for (const name of Object.keys(fg.controls)) {
      const c = fg.get(name);
      if (c && c.invalid && c.touched) {
        const m = this.errMsg(fg, name);
        if (m) return m;
      }
    }
    return null;
  }

  categoryOptions(): string[] {
    const cid = this.s5.getRawValue().class_id;
    const cls = this.classes.find((c) => c.id === cid);
    const code = cls?.code?.trim() || '';
    if (code === 'C9' || code === 'C10') return ['Science', 'Arts'];
    if (code === 'C11' || code === 'C12') {
      return ['Pre-engineering', 'Medical', 'Computer science'];
    }
    return [];
  }

  categorySelectItems(): { label: string; value: string }[] {
    return this.categoryOptions().map((v) => ({ label: v, value: v }));
  }

  bloodSelectItems(): { label: string; value: string }[] {
    return [{ label: '—', value: '' }, ...this.bloodOptions.map((b) => ({ label: b, value: b }))];
  }

  get yearSelectOptions(): { id: number; label: string }[] {
    return this.years.map((y) => ({
      id: y.id,
      label: y.name != null && String(y.name).trim() ? String(y.name) : `Year ${y.id}`,
    }));
  }

  private notifyError(detail: string, life: number): void {
    this.messages.add({ severity: 'error', summary: 'Error', detail: String(detail), life });
  }

  private notifySuccess(detail: string, life: number): void {
    this.messages.add({ severity: 'success', summary: 'Success', detail: String(detail), life });
  }

  private notifyInfo(detail: string, life: number): void {
    this.messages.add({ severity: 'info', summary: 'Notice', detail: String(detail), life });
  }

  guardianType(): string {
    return String(this.s2.get('guardian_type')?.value || 'father');
  }

  submit(): void {
    if (this.editStudentId()) {
      this.submitEdit();
      return;
    }
    this.updateCategoryValidators();
    this.s1.markAllAsTouched();
    this.s2.markAllAsTouched();
    this.s3.markAllAsTouched();
    this.s4.markAllAsTouched();
    this.s5.markAllAsTouched();

    if (this.s1.invalid || this.s2.invalid || this.s5.invalid) {
      const order = [this.s1, this.s2, this.s5];
      for (const fg of order) {
        if (fg.invalid) {
          const m = this.firstInvalidMessage(fg);
          this.notifyError(m || 'Please complete required fields', 5000);
          return;
        }
      }
      this.notifyError('Please complete required fields', 4000);
      return;
    }

    this.submitting = true;
    const v1 = this.s1.getRawValue();
    const v5 = this.s5.getRawValue();
    const g = this.s2.getRawValue();
    const m = this.s3.getRawValue();
    const ps = this.s4.getRawValue();
    const gt = String(g.guardian_type || 'father');

    let guardianPayload: Record<string, string | undefined> = { guardian_type: gt };
    if (gt === 'father') {
      guardianPayload = {
        guardian_type: 'father',
        father_name: g.father_name || undefined,
        father_phone: g.father_phone || undefined,
        father_occupation: g.father_occupation || undefined,
      };
    } else if (gt === 'mother') {
      guardianPayload = {
        guardian_type: 'mother',
        mother_name: g.mother_name || undefined,
        mother_phone: g.mother_phone || undefined,
        mother_occupation: g.mother_occupation || undefined,
      };
    } else {
      guardianPayload = {
        guardian_type: 'other',
        guardian_name: g.guardian_name || undefined,
        guardian_phone: g.guardian_phone || undefined,
        guardian_occupation: g.guardian_occupation || undefined,
        guardian_relation: g.guardian_relation || undefined,
        guardian_address: g.guardian_address || undefined,
      };
    }

    const file = this.photoFile;
    void (async () => {
      let photo_base64: string | undefined;
      if (file) {
        try {
          photo_base64 = await readFileAsBase64Payload(file);
        } catch {
          this.submitting = false;
          this.notifyError('Could not read photo file', 4000);
          return;
        }
      }

      this.students
        .register({
          admission_no: v1.admission_no.trim(),
          first_name: v1.first_name.trim(),
          last_name: v1.last_name?.trim() || undefined,
          gender: v1.gender || undefined,
          dob: formatDobForApi(v1.dob),
          phone: v1.phone || undefined,
          email: v1.email || undefined,
          blood_group: m.blood_group || undefined,
          current_address: v5.current_address || undefined,
          permanent_address: v5.permanent_address || undefined,
          extra_details: v5.extra_details || undefined,
          room_type: v5.room_type || undefined,
          photo_base64,
          guardian: guardianPayload,
          previous_school: {
            school_name: ps.school_name || undefined,
            school_address: ps.school_address || undefined,
          },
          enrollment: {
            academic_year_id: Number(v5.academic_year_id),
            class_id: Number(v5.class_id),
            section_id: Number(v5.section_id),
            roll_number: v5.roll_number ?? undefined,
            category: v5.category || undefined,
          },
          create_student_login: !!v5.create_student_login,
          login_password: v5.login_password?.trim() || undefined,
        })
        .subscribe({
          next: (res) => {
            this.submitting = false;
            const st = res.student as { id?: string };
            let msg = 'Student registered';
            if (res.login?.username) {
              const pw = res.login.password ? ` Password: ${res.login.password}` : '';
              msg = `Login: ${res.login.username}${pw}. Account is inactive until activated.`;
            }
            this.notifyInfo(msg, 12000);
            if (st?.id) void this.router.navigate(['/students', st.id]);
            else void this.router.navigate(['/students']);
          },
          error: (e) => {
            this.submitting = false;
            this.notifyError(e.error?.message || 'Registration failed', 6000);
          },
        });
    })();
  }

  private submitEdit(): void {
    this.updateCategoryValidators();
    this.s1.markAllAsTouched();
    this.s2.markAllAsTouched();
    this.s3.markAllAsTouched();
    this.s4.markAllAsTouched();
    this.s5.markAllAsTouched();

    if (this.s1.invalid || this.s2.invalid || this.s5.invalid) {
      const order = [this.s1, this.s2, this.s5];
      for (const fg of order) {
        if (fg.invalid) {
          const m = this.firstInvalidMessage(fg);
          this.notifyError(m || 'Please complete required fields', 5000);
          return;
        }
      }
      this.notifyError('Please complete required fields', 4000);
      return;
    }

    const id = this.editStudentId();
    if (!id) return;

    this.submitting = true;
    const v1 = this.s1.getRawValue();
    const v5 = this.s5.getRawValue();
    const g = this.s2.getRawValue();
    const m = this.s3.getRawValue();
    const ps = this.s4.getRawValue();
    const gt = String(g.guardian_type || 'father');

    let guardianPayload: Record<string, string | undefined> = { guardian_type: gt };
    if (gt === 'father') {
      guardianPayload = {
        guardian_type: 'father',
        father_name: g.father_name || undefined,
        father_phone: g.father_phone || undefined,
        father_occupation: g.father_occupation || undefined,
      };
    } else if (gt === 'mother') {
      guardianPayload = {
        guardian_type: 'mother',
        mother_name: g.mother_name || undefined,
        mother_phone: g.mother_phone || undefined,
        mother_occupation: g.mother_occupation || undefined,
      };
    } else {
      guardianPayload = {
        guardian_type: 'other',
        guardian_name: g.guardian_name || undefined,
        guardian_phone: g.guardian_phone || undefined,
        guardian_occupation: g.guardian_occupation || undefined,
        guardian_relation: g.guardian_relation || undefined,
        guardian_address: g.guardian_address || undefined,
      };
    }

    const body: Record<string, unknown> = {
      admission_no: v1.admission_no.trim(),
      first_name: v1.first_name.trim(),
      last_name: v1.last_name?.trim() || undefined,
      gender: v1.gender || undefined,
      dob: formatDobForApi(v1.dob),
      phone: v1.phone || undefined,
      email: v1.email || undefined,
      blood_group: m.blood_group || undefined,
      current_address: v5.current_address || undefined,
      permanent_address: v5.permanent_address || undefined,
      extra_details: v5.extra_details || undefined,
      room_type: v5.room_type || undefined,
      guardian: guardianPayload,
      previous_school: {
        school_name: ps.school_name || undefined,
        school_address: ps.school_address || undefined,
      },
      enrollment: {
        academic_year_id: Number(v5.academic_year_id),
        class_id: Number(v5.class_id),
        section_id: Number(v5.section_id),
        roll_number: v5.roll_number ?? undefined,
        category: v5.category || undefined,
      },
    };

    if (v5.login_password?.trim()) {
      body['login_user'] = { password: v5.login_password.trim() };
    }

    const file = this.photoFile;
    const removePhoto = this.removeExistingPhoto && !file;
    if (removePhoto) {
      body['remove_photo'] = true;
    }

    void (async () => {
      if (file) {
        try {
          body['photo_base64'] = await readFileAsBase64Payload(file);
        } catch {
          this.submitting = false;
          this.notifyError('Could not read photo file', 4000);
          return;
        }
      }

      this.students.update(id, body).subscribe({
        next: () => {
          this.submitting = false;
          this.notifySuccess('Student updated', 4000);
          void this.router.navigate(['/students', id]);
        },
        error: (e) => {
          this.submitting = false;
          this.notifyError(e.error?.message || 'Update failed', 6000);
        },
      });
    })();
  }
}
