import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';

import {
  StudentService,
  StudentListRow,
  resolveStudentDisplayName,
} from '../../../services/student.service';
import { ToastService } from '../../../services/toast.service';
import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';
import {
  compareDates,
  compareNullableString,
  nextSortDir,
  type SortDir,
  sortCopy,
} from '../../../utils/table-sort';

export type StudentSortKey = 'admission_no' | 'name' | 'class' | 'dob' | 'gender' | 'phone';

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

@Component({
  selector: 'app-student-list',
  imports: [RouterLink, TablePaginationFooterComponent],
  templateUrl: './student-list.component.html',
  styleUrl: './student-list.component.scss',
})
export class StudentListComponent implements OnInit {
  private studentsApi = inject(StudentService);
  private router = inject(Router);
  private toast = inject(ToastService);

  loading = signal(true);
  rows = signal<StudentListRow[]>([]);
  page = signal(1);
  pageSize = signal(20);
  total = signal(0);
  totalPages = signal(1);

  sortKey = signal<StudentSortKey | null>(null);
  sortDir = signal<SortDir>('asc');

  readonly sortedRows = computed(() => {
    const data = this.rows();
    const key = this.sortKey();
    if (!key) return data;
    const dir = this.sortDir();
    return sortCopy(data, (a, b) => this.compareByKey(a, b, key), dir);
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.studentsApi
      .list({
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .pipe(
        catchError((e) => {
          this.toast.open(
            e.error?.message || e.message || 'Failed to load students',
            'Dismiss',
            { duration: 5000 }
          );
          return of({
            data: [] as StudentListRow[],
            total: 0,
            page: 1,
            pageSize: this.pageSize(),
            totalPages: 1,
          });
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (res) => {
          this.rows.set(Array.isArray(res.data) ? res.data : []);
          this.total.set(res.total ?? 0);
          this.totalPages.set(Math.max(1, res.totalPages ?? 1));
        },
      });
  }

  setPage(p: number): void {
    const next = Math.min(Math.max(1, p), this.totalPages());
    this.page.set(next);
    this.load();
  }

  toggleSort(key: StudentSortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update(nextSortDir);
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  sortAria(key: StudentSortKey): 'none' | 'ascending' | 'descending' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  sortIconClass(key: StudentSortKey): string {
    if (this.sortKey() !== key) return 'bi bi-arrow-down-up';
    return this.sortDir() === 'asc' ? 'bi bi-caret-up-fill' : 'bi bi-caret-down-fill';
  }

  private compareByKey(a: StudentListRow, b: StudentListRow, key: StudentSortKey): number {
    switch (key) {
      case 'admission_no':
        return compareNullableString(a.admission_no, b.admission_no);
      case 'name':
        return compareNullableString(this.displayName(a), this.displayName(b));
      case 'class':
        return compareNullableString(a.class_name, b.class_name);
      case 'dob':
        return compareDates(a.dob, b.dob);
      case 'gender':
        return compareNullableString(a.gender, b.gender);
      case 'phone':
        return compareNullableString(a.phone, b.phone);
      default:
        return 0;
    }
  }

  displayName(row: StudentListRow): string {
    const s = resolveStudentDisplayName(row as unknown as Record<string, unknown>);
    return s || '—';
  }

  avatarInitials(row: StudentListRow): string {
    const n = this.displayName(row);
    if (n === '—') return '?';
    return initialsFromName(n);
  }

  /** Avoid DatePipe on raw API values — invalid dates throw and break the whole table. */
  formatDob(value: string | null | undefined): string {
    if (value == null || value === '') return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }

  trackRow(row: StudentListRow, index: number): string {
    return row.id ? String(row.id) : `idx-${index}-${row.admission_no ?? ''}`;
  }

  openProfile(row: StudentListRow): void {
    void this.router.navigate(['/students', row.id]);
  }

  editStudent(row: StudentListRow, ev: Event): void {
    ev.stopPropagation();
    void this.router.navigate(['/students', row.id, 'edit']);
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

  openProfileFromMenu(row: StudentListRow, ev: Event): void {
    ev.stopPropagation();
    void this.router.navigate(['/students', row.id]);
  }
}
