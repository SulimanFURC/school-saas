import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { finalize } from 'rxjs/operators';

import { ToastService } from '@app/services';
import {
  type RoleAssignmentDto,
  SettingsService,
  type TenantRoleDto,
  type TenantRolePermissionDto,
} from '@app/services';
import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';

@Component({
  selector: 'app-roles-permissions-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TablePaginationFooterComponent],
  templateUrl: './roles-permissions-settings.component.html',
  styleUrl: './roles-permissions-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesPermissionsSettingsComponent {
  private settings = inject(SettingsService);
  private toast = inject(ToastService);

  readonly roles = signal<TenantRoleDto[]>([]);
  readonly permissionCatalog = signal<TenantRolePermissionDto[]>([]);
  readonly assignments = signal<RoleAssignmentDto[]>([]);

  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly selectedRoleId = signal<string>('');
  readonly roleName = signal('');
  readonly roleDescription = signal('');
  readonly selectedPermissionIds = signal<Set<string>>(new Set());
  readonly assignmentPage = signal(1);
  readonly assignmentPageSize = signal(10);

  readonly groupedPermissions = computed(() => {
    const grouped = new Map<string, TenantRolePermissionDto[]>();
    for (const p of this.permissionCatalog()) {
      const arr = grouped.get(p.module_key) ?? [];
      arr.push(p);
      grouped.set(p.module_key, arr);
    }
    return Array.from(grouped.entries()).map(([moduleKey, permissions]) => ({
      moduleKey,
      permissions,
    }));
  });
  readonly assignmentTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.assignments().length / this.assignmentPageSize()))
  );
  readonly pagedAssignments = computed(() => {
    const start = (this.assignmentPage() - 1) * this.assignmentPageSize();
    return this.assignments().slice(start, start + this.assignmentPageSize());
  });

  constructor() {
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.settings
      .listPermissionCatalog()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ data }) => {
          this.permissionCatalog.set(data ?? []);
          this.loadRoles();
          this.loadAssignments();
        },
        error: () => this.toast.open('Could not load permission catalog', 'Dismiss', { duration: 4000 }),
      });
  }

  loadRoles(): void {
    this.settings.listRoles().subscribe({
      next: ({ data }) => {
        this.roles.set(data ?? []);
        const selected = this.selectedRoleId();
        if (!selected && data?.length) {
          this.selectRole(data[0]);
        } else if (selected) {
          const found = data.find((r) => r.id === selected);
          if (found) this.selectRole(found);
        }
      },
      error: () => this.toast.open('Could not load roles', 'Dismiss', { duration: 4000 }),
    });
  }

  loadAssignments(): void {
    this.settings.listRoleAssignments().subscribe({
      next: ({ data }) => {
        this.assignments.set(data ?? []);
        this.assignmentPage.set(1);
      },
      error: () => this.toast.open('Could not load role assignments', 'Dismiss', { duration: 4000 }),
    });
  }

  onAssignmentPageChange(page: number): void {
    this.assignmentPage.set(page);
  }

  selectRole(role: TenantRoleDto): void {
    this.selectedRoleId.set(role.id);
    this.roleName.set(role.name);
    this.roleDescription.set(role.description ?? '');
    this.selectedPermissionIds.set(new Set(role.permissions.map((p) => p.id)));
  }

  isPermissionChecked(permissionId: string): boolean {
    return this.selectedPermissionIds().has(permissionId);
  }

  togglePermission(permissionId: string, checked: boolean): void {
    const next = new Set(this.selectedPermissionIds());
    if (checked) next.add(permissionId);
    else next.delete(permissionId);
    this.selectedPermissionIds.set(next);
  }

  createRole(): void {
    const name = this.roleName().trim();
    if (!name) return;
    this.saving.set(true);
    this.settings
      .createRole({
        name,
        description: this.roleDescription().trim() || null,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.toast.open('Role created', 'Dismiss', { duration: 3000 });
          this.loadRoles();
        },
        error: (err) => this.toast.open(err?.error?.message || 'Could not create role', 'Dismiss', { duration: 4000 }),
      });
  }

  updateRole(): void {
    const id = this.selectedRoleId();
    if (!id) return;
    this.saving.set(true);
    this.settings
      .updateRole(id, {
        name: this.roleName().trim(),
        description: this.roleDescription().trim() || null,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.toast.open('Role updated', 'Dismiss', { duration: 3000 });
          this.loadRoles();
        },
        error: (err) => this.toast.open(err?.error?.message || 'Could not update role', 'Dismiss', { duration: 4000 }),
      });
  }

  savePermissions(): void {
    const id = this.selectedRoleId();
    if (!id) return;
    this.saving.set(true);
    this.settings
      .replaceRolePermissions(id, Array.from(this.selectedPermissionIds()))
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.toast.open('Role permissions updated', 'Dismiss', { duration: 3000 });
          this.loadRoles();
        },
        error: (err) =>
          this.toast.open(err?.error?.message || 'Could not update role permissions', 'Dismiss', { duration: 4000 }),
      });
  }

  assignRole(userId: string, roleId: string): void {
    if (!roleId) return;
    this.settings.assignUserRole(userId, roleId).subscribe({
      next: () => {
        this.toast.open('User role updated', 'Dismiss', { duration: 3000 });
        this.loadAssignments();
      },
      error: (err) => this.toast.open(err?.error?.message || 'Could not assign role', 'Dismiss', { duration: 4000 }),
    });
  }
}

