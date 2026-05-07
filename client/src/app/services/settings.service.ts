import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface SchoolProfileDto {
  name: string;
  contact_email: string | null;
  phone: string | null;
  address: string | null;
  subdomain?: string;
}

export interface AcademicYearSettingDto {
  id: number;
  name: string | null;
  is_active: boolean;
}

export interface NotificationPreferencesDto {
  email_notifications: boolean;
  sms_notifications: boolean;
  in_app_notifications: boolean;
}

export interface PlatformSettingsDto {
  platform_name: string;
  support_email: string;
  max_tenants_allowed: number;
}

export interface TenantRolePermissionDto {
  id: string;
  module_key: string;
  action: 'create' | 'read' | 'update' | 'delete';
  code: string;
}

export interface TenantRoleDto {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  permissions: TenantRolePermissionDto[];
}

export interface RoleAssignmentDto {
  id: string;
  name: string;
  email: string | null;
  role: string;
  status: string;
  assigned_role_id: string | null;
  assigned_role_name: string | null;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  getSchoolProfile(): Observable<{ data: SchoolProfileDto }> {
    return this.http.get<{ data: SchoolProfileDto }>(`${this.base}/settings/school-profile`);
  }

  updateSchoolProfile(body: Partial<SchoolProfileDto>): Observable<{ message: string; data: SchoolProfileDto }> {
    return this.http.put<{ message: string; data: SchoolProfileDto }>(
      `${this.base}/settings/school-profile`,
      body
    );
  }

  getAcademicYearSetting(): Observable<{ data: AcademicYearSettingDto }> {
    return this.http.get<{ data: AcademicYearSettingDto }>(`${this.base}/settings/academic-year`);
  }

  changePassword(body: { currentPassword: string; newPassword: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/settings/change-password`, body);
  }

  getNotificationPreferences(): Observable<{ data: NotificationPreferencesDto }> {
    return this.http.get<{ data: NotificationPreferencesDto }>(
      `${this.base}/settings/notification-preferences`
    );
  }

  updateNotificationPreferences(
    body: NotificationPreferencesDto
  ): Observable<{ message: string; data: NotificationPreferencesDto }> {
    return this.http.put<{ message: string; data: NotificationPreferencesDto }>(
      `${this.base}/settings/notification-preferences`,
      body
    );
  }

  getPlatformSettings(): Observable<{ data: PlatformSettingsDto }> {
    return this.http.get<{ data: PlatformSettingsDto }>(`${this.base}/super-admin/platform-settings`);
  }

  updatePlatformSettings(
    body: Partial<PlatformSettingsDto>
  ): Observable<{ message: string; data: PlatformSettingsDto }> {
    return this.http.put<{ message: string; data: PlatformSettingsDto }>(
      `${this.base}/super-admin/platform-settings`,
      body
    );
  }

  listRoles(): Observable<{ data: TenantRoleDto[] }> {
    return this.http.get<{ data: TenantRoleDto[] }>(`${this.base}/roles`);
  }

  createRole(body: { name: string; description?: string | null }): Observable<{ message: string; data: TenantRoleDto }> {
    return this.http.post<{ message: string; data: TenantRoleDto }>(`${this.base}/roles`, body);
  }

  updateRole(id: string, body: { name?: string; description?: string | null }): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/roles/${id}`, body);
  }

  deleteRole(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/roles/${id}`);
  }

  listPermissionCatalog(): Observable<{ data: TenantRolePermissionDto[] }> {
    return this.http.get<{ data: TenantRolePermissionDto[] }>(`${this.base}/roles/permissions/catalog`);
  }

  replaceRolePermissions(roleId: string, permissionIds: string[]): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.base}/roles/${roleId}/permissions`, {
      permission_ids: permissionIds,
    });
  }

  listRoleAssignments(): Observable<{ data: RoleAssignmentDto[] }> {
    return this.http.get<{ data: RoleAssignmentDto[] }>(`${this.base}/roles/users/assignments`);
  }

  assignUserRole(userId: string, roleId: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.base}/roles/users/${userId}/assign`, { role_id: roleId });
  }
}
