import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { formatRelativeTime } from '../../../utils/relative-time';
import { CreateTenantDialogComponent } from './create-tenant-dialog/create-tenant-dialog.component';
import { ToastService } from '../../../services/toast.service';

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

@Component({
  selector: 'app-tenant-list',
  imports: [RouterLink, CreateTenantDialogComponent],
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

  pageNumbers(): number[] {
    const totalP = this.totalPages();
    const cur = this.pageIndex();
    const window = 5;
    const start = Math.max(0, Math.min(cur - 2, totalP - window));
    const end = Math.min(totalP, start + window);
    const arr: number[] = [];
    for (let i = start; i < end; i++) {
      arr.push(i);
    }
    return arr;
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
