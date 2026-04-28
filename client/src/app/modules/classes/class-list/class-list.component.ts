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
import { Menu, MenuModule } from 'primeng/menu';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { AcademicService, SchoolClassDto } from '../../../services/academic.service';
import { compareNullableString, nextSortDir, type SortDir, sortCopy } from '../../../utils/table-sort';

export type ClassSortKey = 'name' | 'teacher' | 'sections';

@Component({
  selector: 'app-class-list',
  imports: [
    RouterLink,
    TableModule,
    ButtonModule,
    MenuModule,
    ConfirmDialogModule,
    ToastModule,
    TagModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './class-list.component.html',
  styleUrl: './class-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassListComponent implements OnInit {
  private api = inject(AcademicService);
  private router = inject(Router);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  private readonly rowActionMenu = viewChild<Menu>('rowActionMenu');

  rowActionMenuModel: MenuItem[] = [];

  loading = signal(true);
  rows = signal<SchoolClassDto[]>([]);

  sortKey = signal<ClassSortKey | null>(null);
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
    this.api
      .listClasses(true)
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load classes',
            life: 5000,
          });
          return of([] as SchoolClassDto[]);
        }),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((data) => {
        this.rows.set(Array.isArray(data) ? data : []);
      });
  }

  toggleSort(key: ClassSortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update(nextSortDir);
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  sortAria(key: ClassSortKey): 'none' | 'ascending' | 'descending' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  sortIconClass(key: ClassSortKey): string {
    if (this.sortKey() !== key) return 'pi pi-arrows-v';
    return this.sortDir() === 'asc' ? 'pi pi-sort-up-fill' : 'pi pi-sort-down-fill';
  }

  private compareByKey(a: SchoolClassDto, b: SchoolClassDto, key: ClassSortKey): number {
    switch (key) {
      case 'name':
        return compareNullableString(a.name, b.name);
      case 'teacher':
        return compareNullableString(this.teacherName(a), this.teacherName(b));
      case 'sections':
        return (a.sections?.length ?? 0) - (b.sections?.length ?? 0);
      default:
        return 0;
    }
  }

  teacherName(c: SchoolClassDto): string {
    const t = c.classTeacher;
    if (!t) return '';
    return `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || (t.email ?? '');
  }

  sectionsLabel(c: SchoolClassDto): string {
    const list = c.sections ?? [];
    if (list.length === 0) return '—';
    return list.map((s) => s.name).join(', ');
  }

  openRowActionMenu(event: MouseEvent, row: SchoolClassDto): void {
    event.stopPropagation();
    this.rowActionMenuModel = [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => void this.router.navigate(['/classes', row.id, 'edit']),
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        styleClass: 'class-row-actions-menu__item--danger',
        command: () => this.confirmDelete(row),
      },
    ];
    this.cdr.detectChanges();
    this.rowActionMenu()?.toggle(event);
  }

  confirmDelete(c: SchoolClassDto): void {
    this.confirmation.confirm({
      message: `Delete class "${c.name}"? This cannot be undone if the server allows removal.`,
      header: 'Delete class?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api
          .deleteClass(c.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.messages.add({
                severity: 'success',
                summary: 'Removed',
                detail: 'Class deleted',
                life: 3000,
              });
              this.load();
            },
            error: (e: { error?: { message?: string } }) => {
              this.messages.add({
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
