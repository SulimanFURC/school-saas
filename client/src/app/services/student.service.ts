import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { environment } from '../../environments/environment';

export interface StudentListRow {
  id: string;
  admission_no: string;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  status: string;
  class_name: string | null;
  current_enrollment?: unknown;
}

export interface RegisterPayload {
  admission_no: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  dob?: string;
  phone?: string;
  email?: string;
  blood_group?: string;
  current_address?: string;
  permanent_address?: string;
  extra_details?: string;
  bank_name?: string;
  bank_branch?: string;
  bank_ifsc?: string;
  height_cm?: string;
  weight_kg?: string;
  hostel_name?: string;
  room_no?: string;
  room_type?: string;
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
}

@Injectable({ providedIn: 'root' })
export class StudentService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  list() {
    return this.http.get<StudentListRow[]>(`${this.base}/students`);
  }

  getById(id: string) {
    return this.http.get<Record<string, unknown>>(`${this.base}/students/${id}`);
  }

  register(body: RegisterPayload) {
    return this.http.post<{ student: Record<string, unknown>; login: { username: string } | null }>(
      `${this.base}/students/register`,
      body
    );
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
    new_class_id: number;
    new_section_id: number;
    academic_year_id: number;
    roll_number?: number | null;
  }) {
    return this.http.post(`${this.base}/students/promote`, payload);
  }
}
