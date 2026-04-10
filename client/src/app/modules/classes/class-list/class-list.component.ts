import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AcademicService, SchoolClassDto } from '../../../services/academic.service';
import { ConfirmDialogService } from '../../../services/confirm-dialog.service';
import { ToastService } from '../../../services/toast.service';
import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';
import { compareNullableString, nextSortDir, type SortDir, sortCopy } from '../../../utils/table-sort';

export type ClassSortKey = 'name';

@Component({
  selector: 'app-class-list',
  imports: [RouterLink, TablePaginationFooterComponent],
  templateUrl: './class-list.component.html',
  styleUrl: './class-list.component.scss',
})
export class ClassListComponent implements OnInit {
  private api = inject(AcademicService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);

  loading = signal(true);
  rows = signal<SchoolClassDto[]>([]);
  page = signal(1);
  readonly pageSize = 10;

  sortKey = signal<ClassSortKey | null>(null);
  sortDir = signal<SortDir>('asc');

  readonly sortedRows = computed(() => {
    const data = this.rows();
    const key = this.sortKey();
    if (!key) return data;
    const dir = this.sortDir();
    return sortCopy(data, (a, b) => this.compareByKey(a, b, key), dir);
  });

  readonly pagedRows = computed(() => {
    const sorted = this.sortedRows();
    const start = (this.page() - 1) * this.pageSize;
    return sorted.slice(start, start + this.pageSize);
  });

  readonly totalCount = computed(() => this.rows().length);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.listClasses(true).subscribe({
      next: (data) => {
        this.rows.set(data);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.open(e.error?.message || 'Failed to load classes', 'Dismiss', { duration: 5000 });
      },
    });
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.rows().length / this.pageSize));
  }

  setPage(p: number): void {
    this.page.set(Math.min(Math.max(1, p), this.totalPages()));
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
    if (this.sortKey() !== key) return 'bi bi-arrow-down-up';
    return this.sortDir() === 'asc' ? 'bi bi-caret-up-fill' : 'bi bi-caret-down-fill';
  }

  private compareByKey(a: SchoolClassDto, b: SchoolClassDto, key: ClassSortKey): number {
    switch (key) {
      case 'name':
        return compareNullableString(a.name, b.name);
      default:
        return 0;
    }
  }

  deleteClass(c: SchoolClassDto, ev: Event): void {
    ev.stopPropagation();
    void this.runDeleteClass(c);
  }

  private async runDeleteClass(c: SchoolClassDto): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Delete class?',
      message: `Delete class "${c.name}"? This cannot be undone if the server allows removal.`,
      variant: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      ariaIdPrefix: 'class-delete',
    });
    if (!ok) return;

    this.confirmDialog.setBusy(true);
    this.api.deleteClass(c.id).subscribe({
      next: () => {
        this.confirmDialog.complete();
        this.toast.open('Class removed', 'Dismiss', { duration: 3000 });
        this.load();
      },
      error: (e) => {
        this.confirmDialog.complete();
        this.toast.open(e.error?.message || 'Delete failed', 'Dismiss', { duration: 6000 });
      },
    });
  }
}
