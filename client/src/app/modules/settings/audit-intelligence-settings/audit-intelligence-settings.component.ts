import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { TabViewModule } from 'primeng/tabview';
import { TagModule } from 'primeng/tag';

import { AuditLogService, type AuditSource, type UnifiedAuditLogRow } from '@app/services';
import { ToastService } from '@app/services';
import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';

type ViewMode = 'stream' | 'entity' | 'user';

@Component({
  selector: 'app-audit-intelligence-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, TabViewModule, TagModule, TablePaginationFooterComponent],
  templateUrl: './audit-intelligence-settings.component.html',
  styleUrl: './audit-intelligence-settings.component.scss',
})
export class AuditIntelligenceSettingsComponent {
  private auditService = inject(AuditLogService);
  private toast = inject(ToastService);

  readonly rows = signal<UnifiedAuditLogRow[]>([]);
  readonly loading = signal(false);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(25);
  readonly pageSizeOptions = [10, 25, 50, 100];

  readonly searchQuery = signal('');
  readonly actionFilter = signal('');
  readonly entityTypeFilter = signal('');
  readonly entityIdFilter = signal('');
  readonly actorUserIdFilter = signal('');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly sourceFilter = signal<'' | AuditSource>('');

  readonly viewMode = signal<ViewMode>('stream');

  constructor() {
    this.load();
  }

  onTabChange(index: number): void {
    const nextMode: ViewMode = index === 1 ? 'entity' : index === 2 ? 'user' : 'stream';
    if (this.viewMode() === nextMode) return;
    this.viewMode.set(nextMode);
    this.pageIndex.set(0);
    this.rows.set([]);
    this.total.set(0);
    if (nextMode === 'entity') this.actorUserIdFilter.set('');
    if (nextMode === 'user') {
      this.entityTypeFilter.set('');
      this.entityIdFilter.set('');
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const mode = this.viewMode();
    const common = {
      q: this.searchQuery() || undefined,
      action: this.actionFilter() || undefined,
      entityType: this.entityTypeFilter() || undefined,
      entityId: this.entityIdFilter() || undefined,
      source: this.sourceFilter() || undefined,
      from: this.fromDate() || undefined,
      to: this.toDate() || undefined,
      page: this.pageIndex() + 1,
      limit: this.pageSize(),
    };

    const request$ =
      mode === 'entity' && this.entityTypeFilter() && this.entityIdFilter()
        ? this.auditService.listEntityHistory(this.entityTypeFilter().trim(), this.entityIdFilter().trim(), common)
        : mode === 'user' && this.actorUserIdFilter()
          ? this.auditService.listUserTimeline(this.actorUserIdFilter().trim(), common)
          : this.auditService.list(common);

    request$.subscribe({
      next: (res) => {
        this.rows.set(res.data ?? []);
        this.total.set(res.total ?? 0);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.toast.open(err?.error?.message ?? 'Could not load audit intelligence', 'Dismiss', { duration: 5000 });
      },
    });
  }

  applyFilters(): void {
    if (this.viewMode() === 'entity' && (!this.entityTypeFilter().trim() || !this.entityIdFilter().trim())) {
      this.toast.open('Entity type and entity ID are required for entity history.', 'Dismiss', { duration: 4500 });
      return;
    }
    if (this.viewMode() === 'user' && !this.actorUserIdFilter().trim()) {
      this.toast.open('User ID is required for user timeline.', 'Dismiss', { duration: 4500 });
      return;
    }
    this.pageIndex.set(0);
    this.load();
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.actionFilter.set('');
    this.entityTypeFilter.set('');
    this.entityIdFilter.set('');
    this.actorUserIdFilter.set('');
    this.sourceFilter.set('');
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
