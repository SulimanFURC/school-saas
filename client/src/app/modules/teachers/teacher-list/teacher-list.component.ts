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
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, debounceTime, distinctUntilChanged, finalize, of, Subject } from 'rxjs';

import { InlineErrorComponent } from '../../../shared/inline-error/inline-error.component';
import { SkeletonTableComponent } from '../../../shared/skeleton-table/skeleton-table.component';
import { TeacherAssignmentStatsRow, TeacherListRow, TeacherService } from '../../../services/teacher.service';
import {
  compareNullableString,
  nextSortDir,
  type SortDir,
  sortCopy,
} from '../../../utils/table-sort';
import { TeacherLoginCredentialsModalComponent } from '../../../shared/teacher-login-credentials-modal/teacher-login-credentials-modal.component';

export type TeacherSortKey = 'name' | 'email' | 'designation' | 'username' | 'account';

@Component({
  selector: 'app-teacher-list',
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
    TagModule,
    TeacherLoginCredentialsModalComponent,
    SkeletonTableComponent,
    InlineErrorComponent,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './teacher-list.component.html',
  styleUrl: './teacher-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherListComponent implements OnInit {
  private api = inject(TeacherService);
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
  rows = signal<TeacherListRow[]>([]);
  page = signal(1);
  pageSize = signal(20);
  total = signal(0);
  totalPages = signal(1);
  searchQuery = signal('');

  sortKey = signal<TeacherSortKey | null>(null);
  sortDir = signal<SortDir>('asc');

  readonly sortedRows = computed(() => {
    const data = this.rows();
    const key = this.sortKey();
    if (!key) return data;
    const dir = this.sortDir();
    return sortCopy(data, (a, b) => this.compareByKey(a, b, key), dir);
  });

  readonly firstIndex = computed(() => Math.max(0, (this.page() - 1) * this.pageSize()));

  loginCredentials = signal<{ username: string; password: string } | null>(null);

  /** teacher_id -> stats for current/active academic year */
  assignmentStats = signal<Record<string, TeacherAssignmentStatsRow>>({});

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
    this.api
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
            detail: e.error?.message || e.message || 'Failed to load teachers',
            life: 5000,
          });
          return of({
            data: [] as TeacherListRow[],
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
          const data = Array.isArray(res.data) ? res.data : [];
          this.rows.set(data);
          this.total.set(res.total ?? 0);
          this.totalPages.set(Math.max(1, res.totalPages ?? 1));
          const ids = data.map((r) => r.id).filter(Boolean);
          if (ids.length > 0) {
            this.api.assignmentStats({ teacher_ids: ids }).subscribe({
              next: (statsRes) => {
                const map: Record<string, TeacherAssignmentStatsRow> = {};
                for (const row of statsRes.data || []) {
                  map[row.teacher_id] = row;
                }
                this.assignmentStats.set(map);
              },
              error: () => this.assignmentStats.set({}),
            });
          } else {
            this.assignmentStats.set({});
          }
        },
      });
  }

  statsFor(row: TeacherListRow): TeacherAssignmentStatsRow | null {
    return this.assignmentStats()[row.id] ?? null;
  }

  toggleSort(key: TeacherSortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update(nextSortDir);
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  sortAria(key: TeacherSortKey): 'none' | 'ascending' | 'descending' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  sortIconClass(key: TeacherSortKey): string {
    if (this.sortKey() !== key) return 'pi pi-arrows-v';
    return this.sortDir() === 'asc' ? 'pi pi-sort-up-fill' : 'pi pi-sort-down-fill';
  }

  private compareByKey(a: TeacherListRow, b: TeacherListRow, key: TeacherSortKey): number {
    switch (key) {
      case 'name':
        return compareNullableString(this.displayName(a), this.displayName(b));
      case 'email':
        return compareNullableString(a.email, b.email);
      case 'designation':
        return compareNullableString(a.designation, b.designation);
      case 'username':
        return compareNullableString(a.login?.username ?? null, b.login?.username ?? null);
      case 'account':
        return compareNullableString(a.login?.status ?? null, b.login?.status ?? null);
      default:
        return 0;
    }
  }

  displayName(row: TeacherListRow): string {
    return `${row.first_name} ${row.last_name}`.trim();
  }

  accountSeverity(row: TeacherListRow): 'success' | 'secondary' | 'warn' {
    const s = row.login?.status?.toLowerCase() ?? '';
    if (!row.login) return 'secondary';
    if (s === 'active') return 'success';
    return 'warn';
  }

  accountLabel(row: TeacherListRow): string {
    if (!row.login) return 'No account';
    return row.login.status || '—';
  }

  openDetail(row: TeacherListRow): void {
    void this.router.navigate(['/teachers', row.id]);
  }

  openRowActionMenu(event: MouseEvent, row: TeacherListRow): void {
    event.stopPropagation();
    const items: MenuItem[] = [
      {
        label: 'View profile',
        icon: 'pi pi-eye',
        command: () => this.openDetail(row),
      },
    ];
    if (row.login) {
      items.push({
        label: 'New password',
        icon: 'pi pi-key',
        command: () => this.generateAndShowPassword(row),
      });
    }
    items.push(
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.editTeacher(row),
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        styleClass: 'teacher-row-actions-menu__item--danger',
        command: () => this.deleteRow(row),
      }
    );
    this.rowActionMenuModel = items;
    this.cdr.detectChanges();
    this.rowActionMenu()?.toggle(event);
  }

  editTeacher(row: TeacherListRow): void {
    void this.router.navigate(['/teachers', row.id, 'edit']);
  }

  generateAndShowPassword(row: TeacherListRow): void {
    if (!row.login?.username) {
      this.messageService.add({
        severity: 'warn',
        summary: 'No login',
        detail: 'This teacher has no login account.',
        life: 4000,
      });
      return;
    }
    this.confirmationService.confirm({
      message: `For ${this.displayName(row)}: the current password cannot be shown. A new password will be created and the old one will stop working.`,
      header: 'Generate new password?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Generate',
      rejectLabel: 'Cancel',
      accept: () => {
        this.api
          .resetPassword(row.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (res) => {
              this.loginCredentials.set({ username: res.username, password: res.password });
              this.messageService.add({
                severity: 'info',
                summary: 'Password ready',
                detail: 'Copy the password from the dialog before closing.',
                life: 5000,
              });
              this.load();
            },
            error: (e: { error?: { message?: string } }) => {
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: e.error?.message || 'Failed to generate password',
                life: 5000,
              });
            },
          });
      },
    });
  }

  onCredentialsDismissed(): void {
    this.loginCredentials.set(null);
  }

  deleteRow(row: TeacherListRow): void {
    this.confirmationService.confirm({
      message: `Remove ${this.displayName(row)} and their login account? This cannot be undone.`,
      header: 'Delete teacher?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api
          .delete(row.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.messageService.add({
                severity: 'success',
                summary: 'Removed',
                detail: 'Teacher deleted',
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
}
