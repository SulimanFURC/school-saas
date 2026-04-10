import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AcademicService } from '../../../services/academic.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-class-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './class-form.component.html',
  styleUrl: './class-form.component.scss',
})
export class ClassFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(AcademicService);
  private router = inject(Router);
  private toast = inject(ToastService);

  submitting = false;

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    code: [''],
    display_order: [null as number | null],
  });

  ngOnInit(): void {}

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.submitting = true;
    this.api
      .createClass({
        name: v.name.trim(),
        code: v.code?.trim() || undefined,
        display_order: v.display_order != null ? Number(v.display_order) : null,
      })
      .subscribe({
        next: () => {
          this.submitting = false;
          this.toast.open('Class created with section A', 'Dismiss', { duration: 4000 });
          void this.router.navigate(['/classes']);
        },
        error: (e) => {
          this.submitting = false;
          this.toast.open(e.error?.message || 'Failed to create class', 'Dismiss', { duration: 5000 });
        },
      });
  }
}
