import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { DatePipe } from '@angular/common';

import { StudentService, StudentListRow } from '../../../services/student.service';

@Component({
  selector: 'app-student-list',
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    DatePipe,
  ],
  templateUrl: './student-list.component.html',
  styleUrl: './student-list.component.scss',
})
export class StudentListComponent implements OnInit {
  private studentsApi = inject(StudentService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  loading = true;
  rows: StudentListRow[] = [];
  displayedColumns = ['admission_no', 'name', 'class', 'dob', 'gender', 'phone', 'actions'];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.studentsApi.list().subscribe({
      next: (data) => {
        this.rows = data;
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.snack.open(e.error?.message || 'Failed to load students', 'Dismiss', { duration: 5000 });
      },
    });
  }

  displayName(row: StudentListRow): string {
    const parts = [row.first_name, row.last_name].filter(Boolean);
    return parts.length ? parts.join(' ') : '—';
  }

  openProfile(row: StudentListRow): void {
    void this.router.navigate(['/students', row.id]);
  }

  deleteRow(row: StudentListRow, ev: Event): void {
    ev.stopPropagation();
    if (!confirm(`Delete student ${row.admission_no}?`)) return;
    this.studentsApi.delete(row.id).subscribe({
      next: () => {
        this.snack.open('Student removed', 'Dismiss', { duration: 3000 });
        this.load();
      },
      error: (e) =>
        this.snack.open(e.error?.message || 'Delete failed', 'Dismiss', { duration: 5000 }),
    });
  }
}
