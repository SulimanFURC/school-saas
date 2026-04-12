import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface TeacherLoginSummary {
  username: string | null;
  status: string | null;
  email?: string | null;
}

export interface TeacherListRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  designation: string | null;
  joining_date: string | null;
  mobile_number: string | null;
  has_photo: boolean;
  has_cv: boolean;
  login: TeacherLoginSummary | null;
}

export interface TeacherListResponse {
  data: TeacherListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TeacherDetail extends Record<string, unknown> {
  id: string;
  tenant_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_number?: string | null;
  address?: string | null;
  joining_date?: string | null;
  designation?: string | null;
  dob?: string | null;
  gender?: string | null;
  qualification?: string | null;
  experience?: string | null;
  photo_base64?: string | null;
  photo_mime?: string | null;
  cv_file_name?: string | null;
  cv_file_url?: string | null;
  has_photo?: boolean;
  login_user?: { id: string; username: string | null; email: string | null; status: string } | null;
}

export interface TeacherCreatePayload {
  first_name: string;
  last_name: string;
  email: string;
  mobile_number?: string | null;
  address?: string | null;
  joining_date?: string | null;
  designation?: string | null;
  dob?: string | null;
  gender?: string | null;
  qualification?: string | null;
  experience?: string | null;
  photo_base64?: string | null;
  login_password?: string | null;
  account_status?: 'active' | 'inactive';
  cv_file_name?: string | null;
  cv_file_url?: string | null;
}

export interface TeacherCreateResponse {
  teacher: TeacherDetail;
  login: { username: string; password: string; user_status: string };
}

function normalizeList(body: unknown, defaultPageSize: number): TeacherListResponse {
  if (!body || typeof body !== 'object') {
    return { data: [], total: 0, page: 1, pageSize: defaultPageSize, totalPages: 1 };
  }
  const o = body as Record<string, unknown>;
  const data = Array.isArray(o['data']) ? (o['data'] as Record<string, unknown>[]) : [];
  return {
    data: data.map((row) => ({
      id: String(row['id'] ?? ''),
      first_name: String(row['first_name'] ?? ''),
      last_name: String(row['last_name'] ?? ''),
      email: String(row['email'] ?? ''),
      designation: (row['designation'] as string | null) ?? null,
      joining_date: (row['joining_date'] as string | null) ?? null,
      mobile_number: (row['mobile_number'] as string | null) ?? null,
      has_photo: !!row['has_photo'],
      has_cv: !!row['has_cv'],
      login: (row['login'] as TeacherLoginSummary | null) ?? null,
    })),
    total: Number(o['total'] ?? 0),
    page: Number(o['page'] ?? 1),
    pageSize: Number(o['pageSize'] ?? defaultPageSize),
    totalPages: Number(o['totalPages'] ?? 1),
  };
}

@Injectable({ providedIn: 'root' })
export class TeacherService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}`;

  list(params?: { page?: number; pageSize?: number; q?: string }): Observable<TeacherListResponse> {
    let httpParams = new HttpParams();
    const pageSize = params?.pageSize ?? 20;
    if (params?.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params?.pageSize != null) httpParams = httpParams.set('pageSize', String(params.pageSize));
    if (params?.q != null && params.q.trim() !== '') httpParams = httpParams.set('q', params.q.trim());
    return this.http
      .get<unknown>(`${this.base}/teachers`, { params: httpParams })
      .pipe(map((body) => normalizeList(body, pageSize)));
  }

  getById(id: string): Observable<TeacherDetail> {
    return this.http.get<TeacherDetail>(`${this.base}/teachers/${encodeURIComponent(id)}`);
  }

  create(body: TeacherCreatePayload): Observable<TeacherCreateResponse> {
    return this.http.post<TeacherCreateResponse>(`${this.base}/teachers`, body);
  }

  update(id: string, body: Record<string, unknown>): Observable<{ data: TeacherDetail }> {
    return this.http.put<{ message?: string; data: TeacherDetail }>(
      `${this.base}/teachers/${encodeURIComponent(id)}`,
      body
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/teachers/${encodeURIComponent(id)}`);
  }

  getMe(): Observable<TeacherDetail> {
    return this.http.get<TeacherDetail>(`${this.base}/teachers/me`);
  }

  updateMe(body: Record<string, unknown>): Observable<{ data: TeacherDetail }> {
    return this.http.patch<{ message?: string; data: TeacherDetail }>(`${this.base}/teachers/me`, body);
  }

  uploadCv(id: string, file: File): Observable<{ cv_file_url: string; cv_file_name: string }> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return this.http.post<{ cv_file_url: string; cv_file_name: string }>(
      `${this.base}/teachers/${encodeURIComponent(id)}/cv`,
      fd
    );
  }

  resetPassword(id: string): Observable<{ username: string; password: string }> {
    return this.http.patch<{ username: string; password: string }>(
      `${this.base}/teachers/${encodeURIComponent(id)}/password`,
      {}
    );
  }

  getLoginDetails(id: string): Observable<{ username: string | null; status: string | null; has_account: boolean }> {
    return this.http.get<{ username: string | null; status: string | null; has_account: boolean }>(
      `${this.base}/teachers/${encodeURIComponent(id)}/login-details`
    );
  }
}
