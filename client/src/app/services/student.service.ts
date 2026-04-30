import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';

import { environment } from '../../environments/environment';

/** API payloads may use snake_case or camelCase; read the first non-empty string for any key. */
export function pickFirstNonEmpty(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
    const v = o[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

/** Display string for list/detail: matches server list row logic across naming styles. */
export function resolveStudentDisplayName(d: Record<string, unknown>): string {
  const disp = pickFirstNonEmpty(d, 'display_name', 'displayName');
  if (disp) return disp;
  const full = pickFirstNonEmpty(d, 'full_name', 'fullName', 'name');
  if (full) return full;
  const fn = pickFirstNonEmpty(d, 'first_name', 'firstName');
  const ln = pickFirstNonEmpty(d, 'last_name', 'lastName');
  return [fn, ln].filter(Boolean).join(' ').trim();
}

/** Split a single full-name string into first + remainder (matches server `splitFullName`). */
function splitFullNameForEdit(trimmed: string): { first_name: string; last_name: string } {
  const parts = trimmed.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

/** Values for first/last fields when editing (uses stored parts, or splits legacy `full_name`). */
export function resolveStudentFirstLast(d: Record<string, unknown>): {
  first_name: string;
  last_name: string;
} {
  const fn = pickFirstNonEmpty(d, 'first_name', 'firstName');
  const ln = pickFirstNonEmpty(d, 'last_name', 'lastName');
  if (fn || ln) {
    return { first_name: fn ?? '', last_name: ln ?? '' };
  }
  const full = pickFirstNonEmpty(d, 'full_name', 'fullName', 'name');
  if (full) return splitFullNameForEdit(full);
  const disp = pickFirstNonEmpty(d, 'display_name', 'displayName');
  if (disp) return splitFullNameForEdit(disp);
  return { first_name: '', last_name: '' };
}

/** Subset of enrollment fields returned by list / lookup (snake_case from API). */
export interface StudentCurrentEnrollmentDto {
  id?: number;
  academic_year_id?: number;
  class_id?: number;
  section_id?: number;
  roll_number?: number | null;
  academicYear?: { id: number; name: string | null } | null;
  schoolClass?: { id: number; name: string; code?: string | null } | null;
  section?: { id: number; name: string } | null;
}

export interface StudentListRow {
  id: string;
  admission_no: string;
  full_name?: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name?: string;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  status: string;
  class_name: string | null;
  current_enrollment?: StudentCurrentEnrollmentDto | null;
}

function normalizeStudentListRow(raw: Record<string, unknown>): StudentListRow {
  return {
    id: String(raw['id'] ?? ''),
    admission_no: String(raw['admission_no'] ?? raw['admissionNo'] ?? ''),
    full_name: pickFirstNonEmpty(raw, 'full_name', 'fullName') ?? null,
    first_name: (raw['first_name'] ?? raw['firstName'] ?? null) as string | null,
    last_name: (raw['last_name'] ?? raw['lastName'] ?? null) as string | null,
    display_name: pickFirstNonEmpty(raw, 'display_name', 'displayName') ?? undefined,
    dob: (raw['dob'] as string | null) ?? null,
    gender: (raw['gender'] as string | null) ?? null,
    phone: (raw['phone'] as string | null) ?? null,
    status: String(raw['status'] ?? 'active'),
    class_name: (raw['class_name'] ?? raw['className'] ?? null) as string | null,
    current_enrollment: (raw['current_enrollment'] ??
      raw['currentEnrollment'] ??
      null) as StudentCurrentEnrollmentDto | null,
  };
}

export interface StudentListResponse {
  data: StudentListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Accepts `{ data: [] }` or legacy/alternate keys so the table always receives rows. */
function normalizeStudentListResponse(body: unknown, defaultPageSize: number): StudentListResponse {
  if (Array.isArray(body)) {
    const data = (body as Record<string, unknown>[]).map((row) => normalizeStudentListRow(row));
    return {
      data,
      total: data.length,
      page: 1,
      pageSize: data.length || defaultPageSize,
      totalPages: 1,
    };
  }
  if (!body || typeof body !== 'object') {
    return {
      data: [],
      total: 0,
      page: 1,
      pageSize: defaultPageSize,
      totalPages: 1,
    };
  }
  const o = body as Record<string, unknown>;
  const raw =
    o['data'] ?? o['rows'] ?? o['students'] ?? o['items'] ?? o['results'];
  const data = Array.isArray(raw)
    ? (raw as Record<string, unknown>[]).map((row) => normalizeStudentListRow(row))
    : [];
  const total = typeof o['total'] === 'number' ? o['total'] : data.length;
  const page = typeof o['page'] === 'number' ? o['page'] : 1;
  const pageSize = typeof o['pageSize'] === 'number' ? o['pageSize'] : defaultPageSize;
  const totalPages =
    typeof o['totalPages'] === 'number'
      ? o['totalPages']
      : Math.max(1, Math.ceil(total / (pageSize || 1)));
  return { data, total, page, pageSize, totalPages };
}

export interface RegisterPayload {
  admission_no: string;
  first_name: string;
  last_name?: string;
  /** @deprecated Prefer first_name + last_name; still accepted by the API for compatibility */
  full_name?: string;
  gender?: string;
  dob?: string;
  phone?: string;
  email?: string;
  blood_group?: string;
  current_address?: string;
  permanent_address?: string;
  extra_details?: string;
  /** Raw base64 (no data: prefix); optimized on server */
  photo_base64?: string;
  guardian?: Record<string, string | undefined>;
  previous_school?: Record<string, string | undefined>;
  enrollment: {
    academic_year_id: number;
    class_id: number;
    section_id: number;
    roll_number?: number | null;
    category?: string | null;
  };
  documents?: { file_name: string; file_url: string }[];
  create_student_login?: boolean;
  login_password?: string;
}

@Injectable({ providedIn: 'root' })
export class StudentService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  list(params?: {
    page?: number;
    pageSize?: number;
    q?: string;
    class_id?: number;
    section_id?: number;
    academic_year_id?: number;
  }) {
    let httpParams = new HttpParams();
    if (params?.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params?.pageSize != null) httpParams = httpParams.set('pageSize', String(params.pageSize));
    const qTrim = params?.q != null ? String(params.q).trim() : '';
    if (qTrim.length > 0) httpParams = httpParams.set('q', qTrim);
    if (params?.class_id != null) httpParams = httpParams.set('class_id', String(params.class_id));
    if (params?.section_id != null) httpParams = httpParams.set('section_id', String(params.section_id));
    if (params?.academic_year_id != null) {
      httpParams = httpParams.set('academic_year_id', String(params.academic_year_id));
    }
    return this.http.get<unknown>(`${this.base}/students`, { params: httpParams }).pipe(
      map((body) => normalizeStudentListResponse(body, params?.pageSize ?? 20))
    );
  }

  /** Resolve student + current placement by exact admission number (case-insensitive). */
  lookupByAdmission(admissionNo: string) {
    const q = String(admissionNo).trim();
    return this.http
      .get<unknown>(`${this.base}/students/lookup`, {
        params: new HttpParams().set('admission_no', q),
      })
      .pipe(
        map((body) => {
          if (!body || typeof body !== 'object') return null;
          const data = (body as Record<string, unknown>)['data'];
          if (!data || typeof data !== 'object') return null;
          return normalizeStudentListRow(data as Record<string, unknown>);
        })
      );
  }

  getById(id: string) {
    return this.http.get<Record<string, unknown>>(`${this.base}/students/${id}`);
  }

  register(body: RegisterPayload) {
    return this.http.post<{
      student: Record<string, unknown>;
      login: { username: string; password?: string; user_status?: string } | null;
    }>(`${this.base}/students/register`, body);
  }

  update(id: string, body: Record<string, unknown>) {
    return this.http.put(`${this.base}/students/${id}`, body);
  }

  delete(id: string) {
    return this.http.delete(`${this.base}/students/${id}`);
  }

  enrollments(studentId: string) {
    return this.http.get<unknown[]>(`${this.base}/enrollments`, {
      params: { student_id: studentId },
    });
  }

  loginDetails(id: string) {
    return this.http.get<{ username: string | null; status: string | null; has_account: boolean }>(
      `${this.base}/students/${id}/login-details`
    );
  }

  promote(payload: {
    student_ids: string[];
    from_academic_year_id?: number;
    from_class_id?: number;
    to_academic_year_id: number;
    to_class_id: number;
    to_section_id: number;
    kind?: 'promote' | 'repeat';
    rolls?: { student_id: string; roll_number: number | null }[];
    roll_number?: number | null;
  }) {
    return this.http.post(`${this.base}/students/promote`, payload);
  }
}
