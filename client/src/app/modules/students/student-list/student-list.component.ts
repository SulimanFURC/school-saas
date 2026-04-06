import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { StudentService, StudentListRow } from '../../../services/student.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-student-list',
  imports: [RouterLink, DatePipe],
  templateUrl: './student-list.component.html',
  styleUrl: './student-list.component.scss',
})
export class StudentListComponent implements OnInit {
  private studentsApi = inject(StudentService);
  private router = inject(Router);
  private toast = inject(ToastService);

  loading = true;
  rows: StudentListRow[] = [];

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
        this.toast.open(e.error?.message || 'Failed to load students', 'Dismiss', { duration: 5000 });
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
        this.toast.open('Student removed', 'Dismiss', { duration: 3000 });
        this.load();
      },
      error: (e) =>
        this.toast.open(e.error?.message || 'Delete failed', 'Dismiss', { duration: 5000 }),
    });
  }
}
