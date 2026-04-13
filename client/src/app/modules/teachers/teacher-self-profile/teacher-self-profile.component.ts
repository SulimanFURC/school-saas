import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { TeacherDetail, TeacherService } from '../../../services/teacher.service';

@Component({
  selector: 'app-teacher-self-profile',
  imports: [
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    Textarea,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './teacher-self-profile.component.html',
  styleUrl: './teacher-self-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherSelfProfileComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(TeacherService);
  private messages = inject(MessageService);

  readonly photoInputAccept = 'image/png,image/jpeg,image/jpg';

  loading = signal(true);
  submitting = signal(false);
  teacher = signal<TeacherDetail | null>(null);

  photoDataUrl = signal<string | null>(null);
  private photoTouched = false;

  form = this.fb.nonNullable.group({
    first_name: ['', Validators.required],
    last_name: ['', Validators.required],
    mobile_number: [''],
    address: [''],
    qualification: [''],
    experience: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .getMe()
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load profile',
            life: 5000,
          });
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (t) => {
          if (!t) return;
          this.teacher.set(t);
          this.form.patchValue({
            first_name: t.first_name ?? '',
            last_name: t.last_name ?? '',
            mobile_number: (t.mobile_number as string) ?? '',
            address: (t.address as string) ?? '',
            qualification: (t.qualification as string) ?? '',
            experience: (t.experience as string) ?? '',
          });
          if (t.photo_base64 && t.photo_mime) {
            this.photoDataUrl.set(`data:${t.photo_mime};base64,${t.photo_base64}`);
          } else {
            this.photoDataUrl.set(null);
          }
          this.photoTouched = false;
        },
      });
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
    const body: Record<string, unknown> = {
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      mobile_number: v.mobile_number.trim() || null,
      address: v.address.trim() || null,
      qualification: v.qualification.trim() || null,
      experience: v.experience.trim() || null,
    };
    if (this.photoTouched) {
      body['photo_base64'] = this.photoDataUrl();
    }
    this.submitting.set(true);
    this.api.updateMe(body).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.teacher.set(res.data as TeacherDetail);
        this.messages.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Profile updated',
          life: 4000,
        });
        this.photoTouched = false;
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
  }
}
