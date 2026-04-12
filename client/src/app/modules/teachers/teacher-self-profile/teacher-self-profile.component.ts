import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, finalize, of } from 'rxjs';

import { TeacherDetail, TeacherService } from '../../../services/teacher.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-teacher-self-profile',
  imports: [ReactiveFormsModule],
  templateUrl: './teacher-self-profile.component.html',
  styleUrl: './teacher-self-profile.component.scss',
})
export class TeacherSelfProfileComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(TeacherService);
  private toast = inject(ToastService);

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
        catchError((e) => {
          this.toast.open(e.error?.message || 'Failed to load profile', 'Dismiss', { duration: 5000 });
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
      this.toast.open('Please choose an image file', 'Dismiss', { duration: 4000 });
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
        this.toast.open('Profile updated', 'Dismiss', { duration: 4000 });
        this.photoTouched = false;
      },
      error: (e) => {
        this.submitting.set(false);
        this.toast.open(e.error?.message || 'Update failed', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
