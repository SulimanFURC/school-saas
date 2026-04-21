import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputSwitchModule } from 'primeng/inputswitch';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../services/auth.service';
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

type ModuleTone = 'blue' | 'teal' | 'indigo' | 'amber' | 'cyan' | 'violet' | 'pink' | 'orange' | 'green' | 'slate';

const MODULE_META: Record<
  string,
  { description: string; icon: string; tone: ModuleTone }
> = {
  students: {
    description: 'Manage student records, enrollments, and profiles.',
    icon: 'pi pi-users',
    tone: 'blue',
  },
  teachers: {
    description: 'Directory, profiles, and staff access for instructors.',
    icon: 'pi pi-id-card',
    tone: 'teal',
  },
  classes: {
    description: 'Grade levels, sections, and class structure.',
    icon: 'pi pi-building',
    tone: 'indigo',
  },
  attendance: {
    description: 'Track daily or period attendance by class.',
    icon: 'pi pi-calendar',
    tone: 'amber',
  },
  fees: {
    description: 'Fee structures, billing, and payment tracking.',
    icon: 'pi pi-dollar',
    tone: 'cyan',
  },
  expenses: {
    description: 'School expenses, approvals, and receipts.',
    icon: 'pi pi-wallet',
    tone: 'orange',
  },
  exams: {
    description: 'Exam schedules, papers, and grading workflows.',
    icon: 'pi pi-pencil',
    tone: 'violet',
  },
  results: {
    description: 'Publish and distribute result sheets to students.',
    icon: 'pi pi-chart-line',
    tone: 'pink',
  },
  library: {
    description: 'Catalog, lending, and inventory for the library.',
    icon: 'pi pi-book',
    tone: 'green',
  },
  transport: {
    description: 'Routes, vehicles, and student transport assignments.',
    icon: 'pi pi-car',
    tone: 'slate',
  },
  reports: {
    description: 'Operational and academic reports for administrators.',
    icon: 'pi pi-chart-bar',
    tone: 'blue',
  },
};

function formatSavedTimestamp(d: Date): string {
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today at ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${time}`;
}

@Component({
  selector: 'app-feature-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CardModule,
    InputSwitchModule,
    MessageModule,
    TagModule,
  ],
  templateUrl: './feature-management.component.html',
  styleUrl: './feature-management.component.scss',
})
export class FeatureManagementComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  readonly tenant = signal<TenantSummary | null>(null);
  readonly modules = signal<TenantModuleRow[]>([]);
  private readonly baseline = signal<string>('');
  readonly lastSavedLine = signal<string | null>(null);

  readonly hasChanges = computed(() => {
    const b = this.baseline();
    if (!b) return false;
    const cur = JSON.stringify(this.modules().map((m) => ({ k: m.module_key, e: m.is_enabled })));
    return cur !== b;
  });

  /** How many module toggles differ from the last saved baseline */
  readonly unsavedCount = computed(() => {
    const b = this.baseline();
    if (!b) return 0;
    let base: { k: string; e: boolean }[];
    try {
      base = JSON.parse(b) as { k: string; e: boolean }[];
    } catch {
      return 0;
    }
    const map = new Map(base.map((x) => [x.k, x.e]));
    let n = 0;
    for (const m of this.modules()) {
      if (map.get(m.module_key) !== m.is_enabled) n++;
    }
    return n;
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
        this.baseline.set(JSON.stringify(list.map((m) => ({ k: m.module_key, e: m.is_enabled }))));
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.open('Could not load modules', 'Dismiss', { duration: 5000 });
      },
    });
  }

  metaFor(row: TenantModuleRow): { description: string; icon: string; tone: ModuleTone } {
    return (
      MODULE_META[row.module_key] ?? {
        description: 'Enable or disable this module for the school portal.',
        icon: 'pi pi-th-large',
        tone: 'slate',
      }
    );
  }

  /** Display host for subtitle (portal URL style) */
  tenantPortalLabel(subdomain: string): string {
    const s = String(subdomain ?? '').trim();
    if (!s) return '';
    return `${s}.schoolos.app`;
  }

  onToggle(moduleKey: string, enabled: boolean): void {
    this.modules.update((rows) =>
      rows.map((r) => (r.module_key === moduleKey ? { ...r, is_enabled: enabled } : r))
    );
  }

  discard(): void {
    const b = this.baseline();
    if (!b) return;
    try {
      const base = JSON.parse(b) as { k: string; e: boolean }[];
      const map = new Map(base.map((x) => [x.k, x.e]));
      this.modules.update((rows) =>
        rows.map((r) => ({ ...r, is_enabled: map.get(r.module_key) ?? false }))
      );
    } catch {
      /* ignore */
    }
  }

  save(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.hasChanges() || this.saving) return;
    const body = this.modules().map((m) => ({
      module_key: m.module_key,
      is_enabled: m.is_enabled,
    }));
    this.saving = true;
    this.http.put<{ modules: TenantModuleRow[] }>(`${environment.apiBaseUrl}/super-admin/tenants/${id}/modules`, body).subscribe({
      next: (res) => {
        const list = res.modules.map((m) => ({ ...m }));
        this.modules.set(list);
        this.baseline.set(JSON.stringify(list.map((m) => ({ k: m.module_key, e: m.is_enabled }))));
        this.saving = false;
        const who = this.auth.user()?.name?.trim() || 'Super admin';
        this.lastSavedLine.set(`Last saved: ${formatSavedTimestamp(new Date())} by ${who}`);
        this.toast.open('Saved', 'Dismiss', { duration: 3000 });
      },
      error: () => {
        this.saving = false;
        this.toast.open('Save failed', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
