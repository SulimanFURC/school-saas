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
}
