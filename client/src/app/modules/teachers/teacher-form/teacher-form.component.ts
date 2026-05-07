import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { TeacherService, type TeacherDetail } from '@app/services';
import { FormSectionComponent } from '../../../shared/form-section/form-section.component';
import { FormShellComponent } from '../../../shared/form-shell/form-shell.component';
import { TeacherLoginCredentialsModalComponent } from '../../../shared/teacher-login-credentials-modal/teacher-login-credentials-modal.component';
import { formatYmdForApi, parseYmdToLocalDate } from '../../../shared/utils/date-ymd';

function optionalPasswordValidator(control: { value: string | null }) {
  const v = control.value?.trim() ?? '';
  if (!v) return null;
  return v.length >= 6 ? null : { minlength: true };
}

const GENDER_OPTIONS: { label: string; value: string }[] = [
  { label: '—', value: '' },
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];

const ACCOUNT_STATUS_OPTIONS: { label: string; value: 'active' | 'inactive' }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

@Component({
  selector: 'app-teacher-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    FormShellComponent,
    FormSectionComponent,
    TeacherLoginCredentialsModalComponent,
    CardModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
    Textarea,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './teacher-form.component.html',
  styleUrl: './teacher-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(TeacherService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private messages = inject(MessageService);

  readonly genderOptions = GENDER_OPTIONS;
  readonly accountStatusOptions = ACCOUNT_STATUS_OPTIONS;
  readonly photoInputAccept = 'image/png,image/jpeg,image/jpg';

  readonly editId = signal<string | null>(null);
  loading = signal(false);
  submitting = signal(false);

  readonly pageTitle = signal('Add teacher');

  form = this.fb.nonNullable.group({
    first_name: ['', Validators.required],
    last_name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    mobile_number: [''],
    address: [''],
    joining_date: [null as Date | null],
    designation: [''],
    dob: [null as Date | null],
    gender: [''],
    qualification: [''],
    experience: [''],
    login_password: ['', optionalPasswordValidator],
    account_status: this.fb.nonNullable.control<'active' | 'inactive'>('active'),
  });

  photoDataUrl = signal<string | null>(null);
  /** When true, include `photo_base64` on update (set or clear). */
  private photoTouched = false;

  /** After creating a teacher, show login until admin dismisses. */
  postCreateCredentials = signal<{ username: string; password: string } | null>(null);
  private pendingNavigateTeacherId: string | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.pageTitle.set('Edit teacher');
      this.loadTeacher(id);
    }
  }

  loadTeacher(id: string): void {
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
          if (!t) {
            void this.router.navigate(['/teachers']);
            return;
          }
          this.applyTeacher(t);
        },
      });
  }

  private applyTeacher(t: TeacherDetail): void {
    const joinStr = String(t.joining_date ?? '').slice(0, 10);
    const dobStr = String(t.dob ?? '').slice(0, 10);
    this.form.patchValue({
      first_name: t.first_name ?? '',
      last_name: t.last_name ?? '',
      email: t.email ?? '',
      mobile_number: (t.mobile_number as string) ?? '',
      address: (t.address as string) ?? '',
      joining_date: joinStr ? parseYmdToLocalDate(joinStr) : null,
      designation: (t.designation as string) ?? '',
      dob: dobStr ? parseYmdToLocalDate(dobStr) : null,
      gender: (t.gender as string) ?? '',
      qualification: (t.qualification as string) ?? '',
      experience: (t.experience as string) ?? '',
      login_password: '',
      account_status: t.login_user?.status === 'inactive' ? 'inactive' : 'active',
    });
    if (t.photo_base64 && t.photo_mime) {
      this.photoDataUrl.set(`data:${t.photo_mime};base64,${t.photo_base64}`);
    } else {
      this.photoDataUrl.set(null);
    }
    this.photoTouched = false;
  }

  onPhotoSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.messages.add({
        severity: 'warn',
        summary: 'Invalid file',
        detail: 'Please choose an image file',
        life: 4000,
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') {
        this.photoDataUrl.set(r);
        this.photoTouched = true;
      }
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  clearPhoto(): void {
    this.photoDataUrl.set(null);
    this.photoTouched = true;
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const id = this.editId();

    const body: Record<string, unknown> = {
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      email: v.email.trim().toLowerCase(),
      mobile_number: v.mobile_number.trim() || null,
      address: v.address.trim() || null,
      joining_date: formatYmdForApi(v.joining_date),
      designation: v.designation.trim() || null,
      dob: formatYmdForApi(v.dob),
      gender: v.gender.trim() || null,
      qualification: v.qualification.trim() || null,
      experience: v.experience.trim() || null,
      account_status: v.account_status,
    };

    if (id) {
      if (this.photoTouched) {
        body['photo_base64'] = this.photoDataUrl();
      }
    } else if (this.photoDataUrl()) {
      body['photo_base64'] = this.photoDataUrl();
    }

    if (id) {
      this.submitting.set(true);
      this.api.update(id, body).subscribe({
        next: () => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'success',
            summary: 'Saved',
            detail: 'Teacher updated',
            life: 4000,
          });
          void this.router.navigate(['/teachers', id]);
        },
        error: (e: { error?: { message?: string } }) => {
          this.submitting.set(false);
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

    if (v.login_password.trim().length >= 6) {
      body['login_password'] = v.login_password.trim();
    }

    this.submitting.set(true);
    this.api.create(body as never).subscribe({
      next: (res) => {
        this.submitting.set(false);
        const u = res.login?.username ?? '';
        const p = res.login?.password ?? '';
        const tid = res.teacher?.id ? String(res.teacher.id) : null;
        if (u && p) {
          this.pendingNavigateTeacherId = tid;
          this.postCreateCredentials.set({ username: u, password: p });
        } else {
          this.messages.add({
            severity: 'success',
            summary: 'Created',
            detail: 'Teacher created.',
            life: 4000,
          });
          void this.router.navigate(tid ? ['/teachers', tid] : ['/teachers']);
        }
      },
      error: (e: { error?: { message?: string } }) => {
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Error',
          detail: e.error?.message || 'Create failed',
          life: 5000,
        });
      },
    });
  }

  onPostCreateCredentialsDismissed(): void {
    this.postCreateCredentials.set(null);
    const navId = this.pendingNavigateTeacherId;
    this.pendingNavigateTeacherId = null;
    void this.router.navigate(navId ? ['/teachers', navId] : ['/teachers']);
  }
}
