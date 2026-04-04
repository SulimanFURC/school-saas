import { Component, OnInit, inject } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';

import { StudentService } from '../../../services/student.service';

@Component({
  selector: 'app-student-detail',
  imports: [
    RouterLink,
    JsonPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './student-detail.component.html',
  styleUrl: './student-detail.component.scss',
})
export class StudentDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private students = inject(StudentService);
  private snack = inject(MatSnackBar);

  loading = true;
  studentId = '';
  student: Record<string, unknown> | null = null;
  enrollments: unknown[] = [];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.studentId = id;
    this.students.getById(id).subscribe({
      next: (data) => {
        this.student = data;
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.snack.open(e.error?.message || 'Failed to load student', 'Dismiss', { duration: 5000 });
      },
    });
    this.students.enrollments(id).subscribe({
      next: (rows) => (this.enrollments = rows),
      error: () => (this.enrollments = []),
    });
  }

  displayName(s: Record<string, unknown>): string {
    const a = String(s['first_name'] ?? '').trim();
    const b = String(s['last_name'] ?? '').trim();
    return [a, b].filter(Boolean).join(' ') || '—';
  }

  chipStatus(s: Record<string, unknown>): string {
    return String(s['status'] ?? '—');
  }

  dobDisplay(v: unknown): string {
    if (v == null || v === '') return '—';
    if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) {
      const d = v instanceof Date ? v : new Date(v);
      return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
    }
    return '—';
  }

  photoUrl(): string | null {
    const u = this.student?.['photo_url'];
    return typeof u === 'string' && u ? u : null;
  }

  asDocList(raw: unknown): { file_name: string; file_url: string }[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((d) => d && typeof d === 'object') as { file_name: string; file_url: string }[];
  }

  loginInfo(): void {
    if (!this.studentId) return;
    this.students.loginDetails(this.studentId).subscribe({
      next: (d) => {
        const msg = d.has_account
          ? `Username: ${d.username || '—'} · status: ${d.status || '—'}`
          : 'No student login account';
        this.snack.open(msg, 'Dismiss', { duration: 6000 });
      },
      error: (e) => this.snack.open(e.error?.message || 'Failed', 'Dismiss', { duration: 4000 }),
    });
  }

  suspend(): void {
    if (!this.studentId || !this.student) return;
    if (!confirm('Mark this student as suspended?')) return;
    this.students.update(this.studentId, { status: 'suspended' }).subscribe({
      next: () => {
        this.snack.open('Updated', 'Dismiss', { duration: 3000 });
        this.student = { ...this.student!, status: 'suspended' };
      },
      error: (e) => this.snack.open(e.error?.message || 'Update failed', 'Dismiss', { duration: 5000 }),
    });
  }
}

