import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { CreateTenantDialogComponent } from './create-tenant-dialog/create-tenant-dialog.component';
import { EditTenantDialogComponent } from './edit-tenant-dialog/edit-tenant-dialog.component';
import { ToastService } from '../../../services/toast.service';
import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';
import { compareNullableString, nextSortDir, type SortDir, sortCopy } from '../../../utils/table-sort';

export interface TenantRow {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  updatedAt?: string;
  contact_email?: string | null;
  enabled_modules?: string;
}

export interface TenantListStats {
  totalSchools: number;
  activeSchools: number;
  pendingSchools: number;
  totalStudents: number;
}

export interface TenantListResponse {
  data: TenantRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats?: TenantListStats;
}

export type TenantStatusKind = 'active' | 'inactive' | 'pending' | 'unknown';

export type TenantSortKey = 'name' | 'status';

@Component({
  selector: 'app-tenant-list',
  imports: [
    CommonModule,
    RouterLink,
    CreateTenantDialogComponent,
    EditTenantDialogComponent,
    TablePaginationFooterComponent,
    TableModule,
    ButtonModule,
    TagModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
  ],
  templateUrl: './tenant-list.component.html',
  styleUrl: './tenant-list.component.scss',
})
export class TenantListComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  private readonly searchInput$ = new Subject<string>();

  readonly tenants = signal<TenantRow[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly showCreate = signal(false);
  readonly editTenantId = signal<string | null>(null);
  readonly stats = signal<TenantListStats | null>(null);
  readonly searchQuery = signal('');

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

  readonly activationRate = computed(() => {
    const s = this.stats();
    if (!s || s.totalSchools <= 0) return 0;
    return Math.round((s.activeSchools / s.totalSchools) * 1000) / 10;
  });

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((raw) => {
        this.searchQuery.set(raw.trim());
        this.pageIndex.set(0);
        this.loadTenants();
      });
    this.loadTenants();
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  loadTenants(): void {
    this.loading = true;
    let params = new HttpParams()
      .set('page', String(this.pageIndex() + 1))
      .set('limit', String(this.pageSize()));
    const q = this.searchQuery();
    if (q) {
      params = params.set('q', q);
    }
    this.http.get<TenantListResponse>(`${environment.apiBaseUrl}/super-admin/tenants`, { params }).subscribe({
      next: (res) => {
        this.tenants.set(res.data ?? []);
        this.total.set(res.total ?? 0);
        this.stats.set(res.stats ?? null);
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

  openEditTenant(id: string): void {
    this.editTenantId.set(id);
  }

  onEditClosed(updated: boolean): void {
    this.editTenantId.set(null);
    if (updated) {
      this.loadTenants();
    }
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

  statusSeverity(
    status: string
  ): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | undefined {
    const k = this.statusKind(status);
    if (k === 'active') return 'info';
    if (k === 'pending') return 'warn';
    if (k === 'inactive') return 'secondary';
    return 'secondary';
  }

  formatNumber(n: number): string {
    return new Intl.NumberFormat().format(n);
  }

  contactEmail(row: TenantRow): string {
    const e = row.contact_email;
    if (e == null || String(e).trim() === '') return '—';
    return String(e).trim();
  }
}
