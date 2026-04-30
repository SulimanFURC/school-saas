import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuditLogService, type UnifiedAuditLogRow } from '@app/services';
import { ToastService } from '@app/services';
import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';

@Component({
  selector: 'app-audit-log-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, TagModule, TablePaginationFooterComponent],
  templateUrl: './audit-log-viewer.component.html',
  styleUrl: './audit-log-viewer.component.scss',
})
export class AuditLogViewerComponent {
  private auditService = inject(AuditLogService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private searchInput$ = new Subject<string>();

  readonly rows = signal<UnifiedAuditLogRow[]>([]);
  readonly loading = signal(false);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(25);
  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly searchQuery = signal('');
  readonly actionFilter = signal('');
  readonly entityTypeFilter = signal('');
  readonly fromDate = signal('');
  readonly toDate = signal('');

  readonly sourceFilter = signal<'all' | 'audit_logs' | 'exam_mark_audits'>('all');

  readonly displayedRows = computed(() => {
    const source = this.sourceFilter();
    if (source === 'all') return this.rows();
    return this.rows().filter((r) => r.source === source);
  });

  constructor() {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.searchQuery.set(value.trim());
        this.pageIndex.set(0);
        this.load();
      });

    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.auditService
      .list({
        q: this.searchQuery(),
        action: this.actionFilter() || undefined,
        entityType: this.entityTypeFilter() || undefined,
        from: this.fromDate() || undefined,
        to: this.toDate() || undefined,
        page: this.pageIndex() + 1,
        limit: this.pageSize(),
      })
      .subscribe({
        next: (res) => {
          this.rows.set(res.data ?? []);
          this.total.set(res.total ?? 0);
          this.loading.set(false);
        },
        error: (err: { error?: { message?: string } }) => {
          this.loading.set(false);
          this.toast.open(err?.error?.message ?? 'Could not load audit logs', 'Dismiss', { duration: 5000 });
        },
      });
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  applyFilters(): void {
    this.pageIndex.set(0);
    this.load();
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.actionFilter.set('');
    this.entityTypeFilter.set('');
    this.sourceFilter.set('all');
    this.fromDate.set('');
    this.toDate.set('');
    this.pageIndex.set(0);
    this.load();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(0);
    this.load();
  }

  onFooterPageChange(oneBasedPage: number): void {
    this.pageIndex.set(Math.max(0, oneBasedPage - 1));
    this.load();
  }

  totalPages(): number {
    const ps = this.pageSize();
    if (ps <= 0) return 0;
    return Math.max(1, Math.ceil(this.total() / ps));
  }

  actorLabel(row: UnifiedAuditLogRow): string {
    if (!row.actor) return 'System';
    const role = row.actor.role ? ` (${row.actor.role})` : '';
    return `${row.actor.name}${role}`;
  }

  sourceLabel(source: UnifiedAuditLogRow['source']): string {
    return source === 'exam_mark_audits' ? 'Exam marks' : 'General';
  }

  sourceSeverity(source: UnifiedAuditLogRow['source']): 'info' | 'contrast' {
    return source === 'exam_mark_audits' ? 'contrast' : 'info';
  }

  pretty(value: unknown): string {
    if (value == null) return 'null';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  formatDate(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  }
}
