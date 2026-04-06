import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { environment } from '../../../../environments/environment';
import type { TenantModuleRow } from '../../../services/feature.service';
import { ToastService } from '../../../services/toast.service';

interface TenantSummary {
  id: string;
  name: string;
  subdomain: string;
  status: string;
}

interface LoadResponse {
  tenant: TenantSummary;
  modules: TenantModuleRow[];
}

const GROUP_ORDER = ['academic', 'finance', 'management', 'other'] as const;

const GROUP_LABEL: Record<string, string> = {
  academic: 'Academic',
  finance: 'Finance',
  management: 'Management',
  other: 'Other',
};

@Component({
  selector: 'app-feature-management',
  imports: [FormsModule],
  templateUrl: './feature-management.component.html',
  styleUrl: './feature-management.component.scss',
})
export class FeatureManagementComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  readonly tenant = signal<TenantSummary | null>(null);
  readonly modules = signal<TenantModuleRow[]>([]);
  private readonly baseline = signal<string>('');

  readonly grouped = computed(() => {
    const list = this.modules();
    const map = new Map<string, TenantModuleRow[]>();
    for (const m of list) {
      const g = m.group && GROUP_ORDER.includes(m.group as (typeof GROUP_ORDER)[number]) ? m.group : 'other';
      const arr = map.get(g) ?? [];
      arr.push(m);
      map.set(g, arr);
    }
    return GROUP_ORDER.filter((k) => (map.get(k)?.length ?? 0) > 0).map((key) => ({
      key,
      label: GROUP_LABEL[key] ?? key,
      items: map.get(key) ?? [],
    }));
  });

  readonly hasChanges = computed(() => {
    const b = this.baseline();
    if (!b) return false;
    const cur = JSON.stringify(
      this.modules().map((m) => ({ k: m.module_key, e: m.is_enabled }))
    );
    return cur !== b;
  });

  loading = true;
  saving = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading = false;
      return;
    }
    this.http.get<LoadResponse>(`${environment.apiBaseUrl}/super-admin/tenants/${id}/modules`).subscribe({
      next: (res) => {
        this.tenant.set(res.tenant);
        const list = res.modules.map((m) => ({ ...m }));
        this.modules.set(list);
        this.baseline.set(
          JSON.stringify(list.map((m) => ({ k: m.module_key, e: m.is_enabled })))
        );
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.open('Could not load modules', 'Dismiss', { duration: 5000 });
      },
    });
  }

  onToggle(moduleKey: string, enabled: boolean): void {
    this.modules.update((rows) =>
      rows.map((r) => (r.module_key === moduleKey ? { ...r, is_enabled: enabled } : r))
    );
  }

  save(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.hasChanges() || this.saving) return;
    const body = this.modules().map((m) => ({
      module_key: m.module_key,
      is_enabled: m.is_enabled,
    }));
    this.saving = true;
    this.http
      .put<{ modules: TenantModuleRow[] }>(
        `${environment.apiBaseUrl}/super-admin/tenants/${id}/modules`,
        body
      )
      .subscribe({
        next: (res) => {
          const list = res.modules.map((m) => ({ ...m }));
          this.modules.set(list);
          this.baseline.set(
            JSON.stringify(list.map((m) => ({ k: m.module_key, e: m.is_enabled })))
          );
          this.saving = false;
          this.toast.open('Saved', 'Dismiss', { duration: 3000 });
        },
        error: () => {
          this.saving = false;
          this.toast.open('Save failed', 'Dismiss', { duration: 5000 });
        },
      });
  }
}
