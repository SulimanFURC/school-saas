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

export interface TeacherAssignmentRow {
  id: string;
  teacher_id: string;
  academic_year_id: number;
  class_id: number;
  section_id: number;
  subject_id: number | null;
  subject_name: string;
  subject?: { id: number; name: string; is_active?: boolean } | null;
  academicYear: { id: number; name: string | null } | null;
  schoolClass: { id: number; name: string } | null;
  section: { id: number; name: string } | null;
}

export interface DashboardSummarySectionEntry {
  section_id: number;
  section_name: string;
  subjects: string[];
}

export interface DashboardSummaryClassEntry {
  class_id: number;
  class_name: string;
  sections: DashboardSummarySectionEntry[];
}

export interface DashboardHomeroomClass {
  class_id: number;
  class_name: string;
  sections: { section_id: number; section_name: string }[];
}

export interface TeacherDashboardResponse {
  teacher: { id: string; first_name: string; last_name: string; designation: string | null };
  academic_year: { id: number; name: string | null; is_active: boolean } | null;
  is_active_year: boolean;
  class_teacher_of: DashboardHomeroomClass[];
  teaching_assignments: TeacherAssignmentRow[];
  summary: DashboardSummaryClassEntry[];
}

export interface MyStudentRow {
  id: string;
  admission_no: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  gender: string | null;
  dob: string | null;
  phone: string | null;
  status: string;
  class_name: string | null;
  section_name: string | null;
  roll_number: number | null;
}

export interface MyStudentsResponse {
  data: MyStudentRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  academic_year: { id: number; name: string | null; is_active: boolean } | null;
  is_active_year: boolean;
}

export interface TeacherAssignmentCreatePayload {
  academic_year_id: number;
  class_id: number;
  section_id: number;
  subject_id: number;
}

export interface TeacherAssignmentStatsRow {
  teacher_id: string;
  assignment_count: number;
  distinct_class_count: number;
  distinct_section_count: number;
  homeroom_class_count: number;
}

export interface TeacherAssignmentStatsResponse {
  academic_year: { id: number; name: string | null; is_active: boolean } | null;
  is_active_year: boolean;
  data: TeacherAssignmentStatsRow[];
}

export interface ChangeMyPasswordPayload {
  current_password: string;
  new_password: string;
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

  changeMyPassword(body: ChangeMyPasswordPayload): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/teachers/me/password`, body);
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

  getMyDashboard(academicYearId?: number): Observable<TeacherDashboardResponse> {
    let params = new HttpParams();
    if (academicYearId != null) {
      params = params.set('academic_year_id', String(academicYearId));
    }
    return this.http.get<TeacherDashboardResponse>(`${this.base}/teachers/me/dashboard`, { params });
  }

  listMyStudents(params?: {
    academic_year_id?: number;
    class_id?: number;
    section_id?: number;
    page?: number;
    pageSize?: number;
    q?: string;
  }): Observable<MyStudentsResponse> {
    let httpParams = new HttpParams();
    if (params?.academic_year_id != null) {
      httpParams = httpParams.set('academic_year_id', String(params.academic_year_id));
    }
    if (params?.class_id != null) {
      httpParams = httpParams.set('class_id', String(params.class_id));
    }
    if (params?.section_id != null) {
      httpParams = httpParams.set('section_id', String(params.section_id));
    }
    if (params?.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params?.pageSize != null) httpParams = httpParams.set('pageSize', String(params.pageSize));
    const q = params?.q != null ? params.q.trim() : '';
    if (q) httpParams = httpParams.set('q', q);
    return this.http.get<MyStudentsResponse>(`${this.base}/teachers/me/students`, { params: httpParams });
  }

  listAssignments(
    teacherId: string,
    academicYearId?: number
  ): Observable<{ data: TeacherAssignmentRow[] }> {
    let httpParams = new HttpParams();
    if (academicYearId != null) {
      httpParams = httpParams.set('academic_year_id', String(academicYearId));
    }
    return this.http.get<{ data: TeacherAssignmentRow[] }>(
      `${this.base}/teachers/${encodeURIComponent(teacherId)}/assignments`,
      { params: httpParams }
    );
  }

  createAssignment(
    teacherId: string,
    body: TeacherAssignmentCreatePayload
  ): Observable<{ message: string; data: TeacherAssignmentRow }> {
    return this.http.post<{ message: string; data: TeacherAssignmentRow }>(
      `${this.base}/teachers/${encodeURIComponent(teacherId)}/assignments`,
      body
    );
  }

  deleteAssignment(teacherId: string, assignmentId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/teachers/${encodeURIComponent(teacherId)}/assignments/${encodeURIComponent(assignmentId)}`
    );
  }

  assignmentStats(params?: {
    academic_year_id?: number;
    teacher_ids?: string[];
  }): Observable<TeacherAssignmentStatsResponse> {
    let httpParams = new HttpParams();
    if (params?.academic_year_id != null) {
      httpParams = httpParams.set('academic_year_id', String(params.academic_year_id));
    }
    if (params?.teacher_ids && params.teacher_ids.length > 0) {
      httpParams = httpParams.set('teacher_ids', params.teacher_ids.map((x) => x.trim()).filter(Boolean).join(','));
    }
    return this.http.get<TeacherAssignmentStatsResponse>(`${this.base}/teachers/assignment-stats`, {
      params: httpParams,
    });
  }
}
