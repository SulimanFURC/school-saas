import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { environment } from '../../../../environments/environment';
import { formatRelativeTime } from '../../../utils/relative-time';
import { CreateTenantDialogComponent } from './create-tenant-dialog/create-tenant-dialog.component';

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
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    MatPaginatorModule,
    MatDialogModule,
    RouterLink,
  ],
  templateUrl: './tenant-list.component.html',
  styleUrl: './tenant-list.component.scss',
})
export class TenantListComponent implements OnInit {
  private http = inject(HttpClient);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  readonly displayedColumns: string[] = ['tenant', 'status', 'lastUpdated', 'actions'];
  readonly tenants = signal<TenantRow[]>([]);
  readonly menuRow = signal<TenantRow | null>(null);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
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
        this.snackBar.open('Could not load tenants', 'Dismiss', { duration: 5000 });
      },
    });
  }

  onPage(ev: PageEvent): void {
    this.pageIndex.set(ev.pageIndex);
    this.pageSize.set(ev.pageSize);
    this.loadTenants();
  }

  openCreateTenant(): void {
    this.dialog
      .open(CreateTenantDialogComponent, {
        width: 'min(96vw, 36rem)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((created) => {
        if (created) {
          this.pageIndex.set(0);
          this.loadTenants();
        }
      });
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
