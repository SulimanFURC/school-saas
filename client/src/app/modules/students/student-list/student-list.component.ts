import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { Menu, MenuModule } from 'primeng/menu';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { catchError, debounceTime, distinctUntilChanged, finalize, of, Subject } from 'rxjs';

import { InlineErrorComponent } from '../../../shared/inline-error/inline-error.component';
import { SkeletonTableComponent } from '../../../shared/skeleton-table/skeleton-table.component';
import {
  StudentService,
  StudentListRow,
  resolveStudentDisplayName,
} from '../../../services/student.service';
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
  imports: [
    RouterLink,
    TableModule,
    ButtonModule,
    MenuModule,
    InputTextModule,
    ToastModule,
    ConfirmDialogModule,
    IconFieldModule,
    InputIconModule,
    SkeletonTableComponent,
    InlineErrorComponent,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './student-list.component.html',
  styleUrl: './student-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentListComponent implements OnInit {
  private studentsApi = inject(StudentService);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  private readonly rowActionMenu = viewChild<Menu>('rowActionMenu');

  /** Bound to popup `p-menu`; refreshed per row before opening (OnPush). */
  rowActionMenuModel: MenuItem[] = [];

  private readonly searchInput$ = new Subject<string>();

  loading = signal(true);
  hasError = signal(false);
  rows = signal<StudentListRow[]>([]);
  page = signal(1);
  pageSize = signal(20);
  total = signal(0);
  totalPages = signal(1);
  searchQuery = signal('');

  sortKey = signal<StudentSortKey | null>(null);
  sortDir = signal<SortDir>('asc');

  readonly sortedRows = computed(() => {
    const data = this.rows();
    const key = this.sortKey();
    if (!key) return data;
    const dir = this.sortDir();
    return sortCopy(data, (a, b) => this.compareByKey(a, b, key), dir);
  });

  readonly firstIndex = computed(() => Math.max(0, (this.page() - 1) * this.pageSize()));

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((raw) => {
        const q = raw.trim();
        this.searchQuery.set(q);
        this.page.set(1);
        this.load();
      });
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.pageSize();
    const first = event.first ?? 0;
    const nextPage = Math.floor(first / rows) + 1;
    this.pageSize.set(rows);
    this.page.set(nextPage);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.hasError.set(false);
    const q = this.searchQuery().trim();
    this.studentsApi
      .list({
        page: this.page(),
        pageSize: this.pageSize(),
        ...(q ? { q } : {}),
      })
      .pipe(
        catchError((e: { error?: { message?: string }; message?: string }) => {
          this.hasError.set(true);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || e.message || 'Failed to load students',
            life: 5000,
          });
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
    if (this.sortKey() !== key) return 'pi pi-arrows-v';
    return this.sortDir() === 'asc' ? 'pi pi-sort-up-fill' : 'pi pi-sort-down-fill';
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

  editStudent(row: StudentListRow): void {
    void this.router.navigate(['/students', row.id, 'edit']);
  }

  deleteRow(row: StudentListRow): void {
    this.confirmationService.confirm({
      message: this.deleteConfirmMessage(row),
      header: 'Delete student?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.studentsApi
          .delete(row.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.messageService.add({
                severity: 'success',
                summary: 'Removed',
                detail: 'Student removed',
                life: 3000,
              });
              this.load();
            },
            error: (e: { error?: { message?: string } }) => {
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: e.error?.message || 'Delete failed',
                life: 5000,
              });
            },
          });
      },
    });
  }

  openRowActionMenu(event: MouseEvent, row: StudentListRow): void {
    event.stopPropagation();
    this.rowActionMenuModel = [
      {
        label: 'View profile',
        icon: 'pi pi-eye',
        command: () => this.openProfile(row),
      },
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.editStudent(row),
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        styleClass: 'student-row-actions-menu__item--danger',
        command: () => this.deleteRow(row),
      },
    ];
    this.cdr.detectChanges();
    this.rowActionMenu()?.toggle(event);
  }

  private deleteConfirmMessage(row: StudentListRow): string {
    const name = this.displayName(row);
    const adm = row.admission_no?.trim() || 'this student';
    return `Remove ${adm} (${name}) from your school? This cannot be undone.`;
  }
}
