import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { formatRelativeTime } from '../../../utils/relative-time';
import { CreateTenantDialogComponent } from './create-tenant-dialog/create-tenant-dialog.component';
import { ToastService } from '../../../services/toast.service';
import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';
import { compareNullableString, nextSortDir, type SortDir, sortCopy } from '../../../utils/table-sort';

export interface TenantRow {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  updatedAt?: string;
}

export interface TenantListResponse {
  data: TenantRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type TenantStatusKind = 'active' | 'inactive' | 'pending' | 'unknown';

export type TenantSortKey = 'name' | 'status' | 'updated';

@Component({
  selector: 'app-tenant-list',
  imports: [RouterLink, CreateTenantDialogComponent, TablePaginationFooterComponent],
  templateUrl: './tenant-list.component.html',
  styleUrl: './tenant-list.component.scss',
})
export class TenantListComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  readonly tenants = signal<TenantRow[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly showCreate = signal(false);

  readonly pageSizeOptions = [5, 10, 25, 50];

  sortKey = signal<TenantSortKey | null>(null);
  sortDir = signal<SortDir>('asc');

  readonly sortedTenants = computed(() => {
    const rows = this.tenants();
    const key = this.sortKey();
    if (!key) return rows;
    return sortCopy(rows, (a, b) => this.compareByKey(a, b, key), this.sortDir());
  });

  loading = true;

  ngOnInit(): void {
    this.loadTenants();
  }

  loadTenants(): void {
    this.loading = true;
    const params = new HttpParams()
      .set('page', String(this.pageIndex() + 1))
      .set('limit', String(this.pageSize()));
    this.http.get<TenantListResponse>(`${environment.apiBaseUrl}/super-admin/tenants`, { params }).subscribe({
      next: (res) => {
        this.tenants.set(res.data ?? []);
        this.total.set(res.total ?? 0);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.open('Could not load tenants', 'Dismiss', { duration: 5000 });
      },
    });
  }

  onPageIndexChange(index: number): void {
    this.pageIndex.set(index);
    this.loadTenants();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(0);
    this.loadTenants();
  }

  totalPages(): number {
    const t = this.total();
    const ps = this.pageSize();
    if (ps <= 0) return 0;
    return Math.max(1, Math.ceil(t / ps));
  }

  toggleSort(key: TenantSortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update(nextSortDir);
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  sortAria(key: TenantSortKey): 'none' | 'ascending' | 'descending' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  sortIconClass(key: TenantSortKey): string {
    if (this.sortKey() !== key) return 'bi bi-arrow-down-up';
    return this.sortDir() === 'asc' ? 'bi bi-caret-up-fill' : 'bi bi-caret-down-fill';
  }

  private compareByKey(a: TenantRow, b: TenantRow, key: TenantSortKey): number {
    switch (key) {
      case 'name':
        return compareNullableString(a.name, b.name);
      case 'status':
        return compareNullableString(a.status, b.status);
      case 'updated':
        return compareNullableString(a.updatedAt ?? '', b.updatedAt ?? '');
      default:
        return 0;
    }
  }

  onFooterPageChange(oneBasedPage: number): void {
    this.onPageIndexChange(oneBasedPage - 1);
  }

  openCreateTenant(): void {
    this.showCreate.set(true);
  }

  onCreateClosed(created: boolean): void {
    this.showCreate.set(false);
    if (created) {
      this.pageIndex.set(0);
      this.loadTenants();
    }
  }

  relativeUpdated(row: TenantRow): string {
    return formatRelativeTime(row.updatedAt ?? null);
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  avatarToneClass(id: string): string {
    let n = 0;
    for (let i = 0; i < id.length; i++) {
      n += id.charCodeAt(i);
    }
    return `tenant-table__avatar tenant-table__avatar--t${n % 5}`;
  }

  statusKind(status: string): TenantStatusKind {
    const s = String(status ?? '')
      .trim()
      .toLowerCase();
    if (s === 'active') return 'active';
    if (s === 'inactive' || s === 'suspended') return 'inactive';
    if (s === 'pending') return 'pending';
    return 'unknown';
  }

  statusLabel(status: string): string {
    const s = String(status ?? '').trim();
    if (!s) return 'Unknown';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
}
