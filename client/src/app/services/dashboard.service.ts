import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface AdminDashboardPayload {
  students: { total: number; active: number; new_this_month: number };
  teachers: { total: number; active: number };
  classes: { total: number };
  fees: {
    collected_this_month: number;
    collected_this_year: number;
    pending_defaulters: number;
  };
  expenses: { total_this_month: number; total_this_year: number };
  exams: { upcoming: number; ongoing: number; completed: number };
  recent_admissions: Array<{
    id: string;
    name: string;
    admission_no: string;
    class_name: string | null;
    section_name: string | null;
    admitted_on: string | null;
  }>;
  recent_fee_collections: Array<{
    id: string;
    student_name: string;
    amount: number;
    date: string;
    receipt_no: string;
  }>;
}

export interface TeacherDashboardPayload {
  my_assignments: Array<{
    class_name: string;
    section_name: string;
    subject_name: string;
    academic_year: string;
  }>;
  my_exams: { upcoming: number; marks_pending: number; completed: number };
  recent_notifications: Array<{
    id: string;
    title: string;
    message: string;
    created_at: string;
    is_read: boolean;
  }>;
}

export interface StudentDashboardPayload {
  enrollment: {
    class_name: string | null;
    section_name: string | null;
    roll_number: number | null;
    academic_year: string | null;
  };
  attendance_summary: { present: number; absent: number; total: number };
  recent_exams: Array<{
    exam_name: string;
    subject: string;
    marks_obtained: number | null;
    total_marks: number | null;
    grade: string | null;
    date: string | null;
  }>;
  pending_recheck_requests: number;
  fee_status: {
    last_payment_amount: number | null;
    last_payment_date: string | null;
    total_paid_this_year: number;
  };
}

export interface SuperAdminDashboardPayload {
  tenants: {
    total: number;
    active: number;
    inactive: number;
    new_this_month: number;
  };
  users: { total_across_tenants: number };
  modules: {
    most_enabled: Array<{ key: string; label: string; enabled_count: number }>;
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  getAdminDashboard(): Observable<AdminDashboardPayload> {
    return this.http.get<AdminDashboardPayload>(`${this.base}/dashboard/admin`);
  }

  getTeacherDashboard(): Observable<TeacherDashboardPayload> {
    return this.http.get<TeacherDashboardPayload>(`${this.base}/dashboard/teacher`);
  }

  getStudentDashboard(): Observable<StudentDashboardPayload> {
    return this.http.get<StudentDashboardPayload>(`${this.base}/dashboard/student`);
  }

  getSuperAdminDashboard(): Observable<SuperAdminDashboardPayload> {
    return this.http.get<SuperAdminDashboardPayload>(`${this.base}/super-admin/dashboard`);
  }
}
