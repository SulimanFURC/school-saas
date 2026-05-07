import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { normalizePaginatedResponse, PaginatedResponse } from '../shared/data-table/pagination.types';

export type ExamType = 'first_term' | 'second_term' | 'mid_term' | 'final' | 'unit_test' | 'mock';
export type ExamStatus =
  | 'draft'
  | 'scheduled'
  | 'ongoing'
  | 'result_pending'
  | 'published'
  | 'archived';
export type MarkEntryStatus = 'present' | 'absent' | 'exempted' | 'withheld';

export interface ExamClassDto {
  id: string;
  class_id: number;
  class_name: string | null;
  grade_level: number | null;
}

export interface ExamDto {
  id: string;
  title: string;
  exam_type: ExamType;
  academic_year_id: number;
  academicYear?: { id: number; name: string | null; is_active: boolean } | null;
  start_date: string;
  end_date: string;
  status: ExamStatus;
  live_status?: ExamStatus;
  is_internal: boolean;
  timetable_finalized_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  recheck_window_days: number;
  recheck_open: boolean;
  classes?: ExamClassDto[];
}

export interface ExamCreatePayload {
  title: string;
  exam_type: ExamType;
  academic_year_id: number;
  start_date: string;
  end_date: string;
  is_internal?: boolean;
  class_ids?: number[];
}

export interface ExamUpdatePayload {
  title?: string;
  exam_type?: ExamType;
  academic_year_id?: number;
  start_date?: string;
  end_date?: string;
  is_internal?: boolean;
  class_ids?: number[];
  recheck_open?: boolean;
  recheck_window_days?: number;
}

export interface ExamTimetableDto {
  id: string;
  exam_id?: string;
  class_id: number;
  class_name: string | null;
  subject_id: number;
  subject_name: string | null;
  exam_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  total_marks: number;
  passing_marks: number;
  is_locked: boolean;
  locked_at: string | null;
  deadline_at: string | null;
}

export interface ExamTimetableUpsertPayload {
  class_id: number;
  subject_id: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  room?: string | null;
  total_marks: number;
  passing_marks: number;
  deadline_at?: string | null;
}

export interface ExamTimetableResponse {
  data: ExamTimetableDto[];
  exam: { id: string; status: ExamStatus; timetable_finalized_at: string | null };
}

export interface MarkSheetEntry {
  enrollment_id: number;
  student_id: string;
  admission_no: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  section_id: number | null;
  section_name: string | null;
  roll_number: number | null;
  mark: {
    id: string;
    student_id: string;
    entry_status: MarkEntryStatus;
    marks_obtained: number | null;
    percentage: number | null;
    updated_at: string;
  } | null;
}

export interface MarksSheetResponse {
  timetable: {
    id: string;
    class_id: number;
    class_name: string | null;
    subject_id: number;
    subject_name: string | null;
    exam_date: string;
    start_time: string;
    end_time: string;
    total_marks: number;
    passing_marks: number;
    is_locked: boolean;
    deadline_at: string | null;
  };
  data: MarkSheetEntry[];
  total: number;
  entered: number;
  can_edit: boolean;
}

export interface UpsertMarkEntry {
  student_id: string;
  entry_status: MarkEntryStatus;
  marks_obtained?: number | null;
}

export interface UpsertMarksPayload {
  exam_timetable_id: string;
  reason?: string;
  entries: UpsertMarkEntry[];
}

export interface UpsertMarksResponse {
  message: string;
  results: { student_id: string; status: 'created' | 'updated' | 'unchanged' }[];
  errors: { student_id: string; message: string }[];
}

export interface AdminProgressRow {
  timetable_id: string;
  class_id: number;
  class_name: string | null;
  subject_id: number;
  subject_name: string | null;
  total_students: number;
  entered: number;
  is_locked: boolean;
}

export interface AdminProgressResponse {
  data: AdminProgressRow[];
  overall: { total: number; entered: number; complete: boolean };
}

export interface GradingBandDto {
  id?: string;
  grade_label: string;
  min_percent: number;
  max_percent: number;
  grade_point: number | null;
  remarks: string | null;
  is_failing: boolean;
}

export interface GradingSchemeDto {
  id: string;
  name: string;
  description: string | null;
  has_grade_points: boolean;
  archived_at: string | null;
  bands: GradingBandDto[];
}

export interface GradingSchemeCreatePayload {
  name: string;
  description?: string | null;
  bands: GradingBandDto[];
}

export interface ExamGradingConfigDto {
  grading_scheme_id: string;
  grading_mode: 'per_subject' | 'aggregate';
  scheme: {
    id: string;
    name: string;
    description: string | null;
    has_grade_points: boolean;
    archived_at: string | null;
  } | null;
  bands: GradingBandDto[];
}

export interface GradeDistributionEntry extends GradingBandDto {
  count: number;
}

export interface GradeDistributionResponse {
  configured: boolean;
  grading_mode?: 'per_subject' | 'aggregate';
  totals: { students?: number; papers?: number };
  distribution: GradeDistributionEntry[];
}

export interface ClassResultsRow {
  student_id: string;
  admission_no: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  section_id: number | null;
  section_name: string | null;
  roll_number: number | null;
  papers: {
    timetable_id: string;
    subject_id: number;
    subject_name: string | null;
    total_marks: number;
    passing_marks: number;
    mark: { entry_status: MarkEntryStatus; marks_obtained: number | null } | null;
    percentage: number | null;
    grade: { grade_label: string; remarks: string | null; is_failing: boolean; grade_point: number | null } | null;
    below_passing: boolean;
  }[];
  totals: { total_max: number; total_obtained: number; percentage: number | null };
  overall_grade: { grade_label: string; remarks: string | null; is_failing: boolean; grade_point: number | null } | null;
  cgpa: number | null;
  has_failure: boolean;
  rank?: number;
}

export interface ClassResultsResponse {
  data: {
    rows: ClassResultsRow[];
    grading_mode: 'per_subject' | 'aggregate' | null;
    timetables: {
      id: string;
      class_id: number;
      subject_id: number;
      subject_name: string | null;
      total_marks: number;
      passing_marks: number;
      exam_date: string;
      start_time: string;
      end_time: string;
    }[];
  };
}

export interface AuditEntryDto {
  id: string;
  exam_timetable_id: string;
  student_id: string;
  action: 'create' | 'update' | 'delete';
  before: { entry_status?: string; marks_obtained?: number | null } | null;
  after: { entry_status?: string; marks_obtained?: number | null } | null;
  reason: string | null;
  created_at: string;
  actor: { id: string; name: string; role: string } | null;
}

export interface RecheckRequestDto {
  id: string;
  exam_id: string;
  exam_timetable_id: string;
  student_id: string;
  status: 'open' | 'assigned' | 'resolved' | 'rejected' | 'closed';
  student_comment: string | null;
  teacher_comment: string | null;
  assigned_teacher_id: string | null;
  created_at: string;
  resolved_at: string | null;
  student?: {
    id: string;
    admission_no: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  timetable?: {
    id: string;
    class_id: number;
    class_name: string | null;
    subject_id: number;
    subject_name: string | null;
  } | null;
  exam?: { id: string; title: string; exam_type: ExamType } | null;
}

export interface MyExamSummary {
  id: string;
  title: string;
  exam_type: ExamType;
  start_date: string;
  end_date: string;
  status: ExamStatus;
  timetable_finalized_at: string | null;
  published_at: string | null;
  can_view_results?: boolean;
  can_download_admit_card?: boolean;
  recheck_open?: boolean;
}

export interface MyExamTimetableEntry {
  id: string;
  subject_id: number;
  subject_name: string | null;
  exam_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  total_marks: number;
  passing_marks: number;
}

export interface MyResultData {
  student: {
    id: string;
    admission_no: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  enrollment: {
    class_id: number;
    class_name: string | null;
    section_id: number | null;
    section_name: string | null;
    roll_number: number | null;
  };
  papers: ClassResultsRow['papers'];
  totals: ClassResultsRow['totals'];
  overall_grade: ClassResultsRow['overall_grade'];
  cgpa: number | null;
  has_failure: boolean;
  grading_mode: 'per_subject' | 'aggregate' | null;
}

export interface TeacherExamPaperRow {
  id: string;
  class_id: number;
  class_name: string | null;
  subject_id: number;
  subject_name: string | null;
  exam_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  total_marks: number;
  passing_marks: number;
  is_locked: boolean;
  deadline_at: string | null;
  section_ids: number[];
  total_students: number;
  entered: number;
}

export interface TeacherExamSummaryRow {
  student_id: string;
  admission_no: string | null;
  display_name: string;
  class_id: number;
  class_name: string | null;
  section_id: number;
  section_name: string | null;
  roll_number: number | null;
  totals: {
    total_obtained: number | null;
    total_max: number;
    percentage: number | null;
  };
  overall_grade: {
    grade_label: string;
    grade_point: number | null;
    remarks: string | null;
    is_failing: boolean;
  } | null;
  cgpa: number | null;
  has_failure: boolean;
  rank?: number;
}

export interface CsvImportPreview {
  total: number;
  errors: { line: number; admission_no: string; message: string }[];
  summary: { to_create: number; to_update: number; unchanged: number };
  rows: {
    line: number;
    admission_no: string;
    student_id: string;
    entry_status: MarkEntryStatus;
    marks_obtained: number | null;
    reason: string;
    is_existing: boolean;
    will_change: boolean;
  }[];
}

@Injectable({ providedIn: 'root' })
export class ExamService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  list(params?: {
    academic_year_id?: number;
    status?: ExamStatus | '';
    q?: string;
    include_archived?: boolean;
    page?: number;
    limit?: number;
  }): Observable<PaginatedResponse<ExamDto>> {
    let p = new HttpParams();
    if (params?.academic_year_id != null) p = p.set('academic_year_id', String(params.academic_year_id));
    if (params?.status) p = p.set('status', params.status);
    if (params?.q) p = p.set('q', params.q);
    if (params?.include_archived) p = p.set('include_archived', 'true');
    if (params?.page != null) p = p.set('page', String(params.page));
    if (params?.limit != null) p = p.set('limit', String(params.limit));
    return this.http
      .get<unknown>(`${this.base}/exams`, { params: p })
      .pipe(map((body) => normalizePaginatedResponse<ExamDto>(body, { page: params?.page ?? 1, limit: params?.limit ?? 20 })));
  }

  get(id: string): Observable<{ data: ExamDto }> {
    return this.http.get<{ data: ExamDto }>(`${this.base}/exams/${encodeURIComponent(id)}`);
  }

  create(body: ExamCreatePayload): Observable<{ data: ExamDto; message: string }> {
    return this.http.post<{ data: ExamDto; message: string }>(`${this.base}/exams`, body);
  }

  update(id: string, body: ExamUpdatePayload): Observable<{ data: ExamDto; message: string }> {
    return this.http.patch<{ data: ExamDto; message: string }>(
      `${this.base}/exams/${encodeURIComponent(id)}`,
      body
    );
  }

  setClasses(id: string, class_ids: number[]) {
    return this.http.post<{ data: ExamDto; message: string }>(
      `${this.base}/exams/${encodeURIComponent(id)}/classes`,
      { class_ids }
    );
  }

  transition(id: string, status: ExamStatus) {
    return this.http.post<{ data: ExamDto; message: string }>(
      `${this.base}/exams/${encodeURIComponent(id)}/transition`,
      { status }
    );
  }

  archive(id: string) {
    return this.http.post<{ data: ExamDto; message: string }>(
      `${this.base}/exams/${encodeURIComponent(id)}/archive`,
      {}
    );
  }

  clone(id: string, body: Partial<ExamCreatePayload>) {
    return this.http.post<{ data: ExamDto; message: string }>(
      `${this.base}/exams/${encodeURIComponent(id)}/clone`,
      body
    );
  }

  listTimetable(id: string, classId?: number): Observable<ExamTimetableResponse> {
    let p = new HttpParams();
    if (classId != null) p = p.set('class_id', String(classId));
    return this.http.get<ExamTimetableResponse>(
      `${this.base}/exams/${encodeURIComponent(id)}/timetable`,
      { params: p }
    );
  }

  addTimetableEntry(id: string, body: ExamTimetableUpsertPayload) {
    return this.http.post<{ data: ExamTimetableDto; message: string }>(
      `${this.base}/exams/${encodeURIComponent(id)}/timetable`,
      body
    );
  }

  updateTimetableEntry(id: string, entryId: string, body: Partial<ExamTimetableUpsertPayload>) {
    return this.http.patch<{ data: ExamTimetableDto; message: string }>(
      `${this.base}/exams/${encodeURIComponent(id)}/timetable/${encodeURIComponent(entryId)}`,
      body
    );
  }

  deleteTimetableEntry(id: string, entryId: string) {
    return this.http.delete<void>(
      `${this.base}/exams/${encodeURIComponent(id)}/timetable/${encodeURIComponent(entryId)}`
    );
  }

  finalizeTimetable(id: string) {
    return this.http.post<{ message: string; data: { exam_id: string; timetable_finalized_at: string } }>(
      `${this.base}/exams/${encodeURIComponent(id)}/timetable/finalize`,
      {}
    );
  }

  toggleLock(id: string, entryId: string, locked: boolean) {
    return this.http.post<{ message: string; data: { id: string; is_locked: boolean; locked_at: string | null } }>(
      `${this.base}/exams/${encodeURIComponent(id)}/timetable/${encodeURIComponent(entryId)}/lock`,
      { locked }
    );
  }

  getMarksSheet(id: string, params: { exam_timetable_id: string; section_id?: number }) {
    let p = new HttpParams().set('exam_timetable_id', params.exam_timetable_id);
    if (params.section_id != null) p = p.set('section_id', String(params.section_id));
    return this.http.get<MarksSheetResponse>(
      `${this.base}/exams/${encodeURIComponent(id)}/marks-sheet`,
      { params: p }
    );
  }

  upsertMarks(id: string, body: UpsertMarksPayload) {
    return this.http.put<UpsertMarksResponse>(
      `${this.base}/exams/${encodeURIComponent(id)}/marks`,
      body
    );
  }

  getProgress(id: string) {
    return this.http.get<AdminProgressResponse>(
      `${this.base}/exams/${encodeURIComponent(id)}/progress`
    );
  }

  listAudits(id: string, params?: { exam_timetable_id?: string; student_id?: string }) {
    let p = new HttpParams();
    if (params?.exam_timetable_id) p = p.set('exam_timetable_id', params.exam_timetable_id);
    if (params?.student_id) p = p.set('student_id', params.student_id);
    return this.http.get<{ data: AuditEntryDto[] }>(
      `${this.base}/exams/${encodeURIComponent(id)}/audits`,
      { params: p }
    );
  }

  listGradingSchemes(includeArchived = false) {
    let p = new HttpParams();
    if (includeArchived) p = p.set('include_archived', 'true');
    return this.http.get<{ data: GradingSchemeDto[] }>(
      `${this.base}/exams/grading-schemes`,
      { params: p }
    );
  }

  createGradingScheme(body: GradingSchemeCreatePayload) {
    return this.http.post<{ data: GradingSchemeDto; message: string }>(
      `${this.base}/exams/grading-schemes`,
      body
    );
  }

  updateGradingScheme(id: string, body: Partial<GradingSchemeCreatePayload>) {
    return this.http.patch<{ data: GradingSchemeDto; message: string }>(
      `${this.base}/exams/grading-schemes/${encodeURIComponent(id)}`,
      body
    );
  }

  archiveGradingScheme(id: string) {
    return this.http.post<{ data: GradingSchemeDto; message: string }>(
      `${this.base}/exams/grading-schemes/${encodeURIComponent(id)}/archive`,
      {}
    );
  }

  getGradingConfig(id: string) {
    return this.http.get<{ data: ExamGradingConfigDto | null }>(
      `${this.base}/exams/${encodeURIComponent(id)}/grading`
    );
  }

  setGradingConfig(id: string, body: { grading_scheme_id: string; grading_mode: 'per_subject' | 'aggregate' }) {
    return this.http.post<{ message: string }>(
      `${this.base}/exams/${encodeURIComponent(id)}/grading`,
      body
    );
  }

  getDistribution(id: string) {
    return this.http.get<{ data: GradeDistributionResponse }>(
      `${this.base}/exams/${encodeURIComponent(id)}/grade-distribution`
    );
  }

  publish(id: string) {
    return this.http.post<{ message: string; data: { id: string; published_at: string } }>(
      `${this.base}/exams/${encodeURIComponent(id)}/publish`,
      {}
    );
  }

  classResults(id: string, classId: number) {
    return this.http.get<ClassResultsResponse>(
      `${this.base}/exams/${encodeURIComponent(id)}/classes/${classId}/results`
    );
  }

  admitCardUrl(id: string, studentId: string): string {
    return `${this.base}/exams/${encodeURIComponent(id)}/students/${encodeURIComponent(studentId)}/admit-card.pdf`;
  }

  resultCardUrl(id: string, studentId: string): string {
    return `${this.base}/exams/${encodeURIComponent(id)}/students/${encodeURIComponent(studentId)}/result-card.pdf`;
  }

  bulkAdmitCardsZipUrl(id: string, classId: number): string {
    return `${this.base}/exams/${encodeURIComponent(id)}/classes/${classId}/admit-cards.zip`;
  }

  bulkResultCardsZipUrl(id: string, classId: number): string {
    return `${this.base}/exams/${encodeURIComponent(id)}/classes/${classId}/result-cards.zip`;
  }

  studentAdmitCardUrl(id: string): string {
    return `${this.base}/exams/students/me/${encodeURIComponent(id)}/admit-card.pdf`;
  }

  studentResultCardUrl(id: string): string {
    return `${this.base}/exams/students/me/${encodeURIComponent(id)}/result-card.pdf`;
  }

  marksTemplateUrl(id: string, ttId: string): string {
    return `${this.base}/exams/${encodeURIComponent(id)}/marks-template.csv?exam_timetable_id=${encodeURIComponent(ttId)}`;
  }

  importMarksPreview(id: string, ttId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('exam_timetable_id', ttId);
    return this.http.post<{ data: CsvImportPreview }>(
      `${this.base}/exams/${encodeURIComponent(id)}/marks-import/preview`,
      fd
    );
  }

  importMarksCommit(id: string, ttId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('exam_timetable_id', ttId);
    return this.http.post<{ message: string; data: { created: number; updated: number; unchanged: number } }>(
      `${this.base}/exams/${encodeURIComponent(id)}/marks-import/commit`,
      fd
    );
  }

  /** Student endpoints */
  myExams() {
    return this.http.get<{ data: MyExamSummary[] }>(`${this.base}/exams/students/me`);
  }

  myTimetable(id: string) {
    return this.http.get<{
      exam: {
        id: string;
        title: string;
        exam_type: ExamType;
        status: ExamStatus;
        start_date: string;
        end_date: string;
        timetable_finalized_at: string | null;
        published_at: string | null;
      };
      data: MyExamTimetableEntry[];
    }>(`${this.base}/exams/students/me/${encodeURIComponent(id)}/timetable`);
  }

  myResult(id: string) {
    return this.http.get<{
      exam: { id: string; title: string; exam_type: ExamType; start_date: string; end_date: string; published_at: string | null };
      data: MyResultData;
    }>(`${this.base}/exams/students/me/${encodeURIComponent(id)}/result`);
  }

  submitRecheck(id: string, body: { exam_timetable_id: string; comment?: string }) {
    return this.http.post<{ message: string; data: { id: string; status: string } }>(
      `${this.base}/exams/students/me/${encodeURIComponent(id)}/recheck`,
      body
    );
  }

  myRechecks() {
    return this.http.get<{ data: RecheckRequestDto[] }>(
      `${this.base}/exams/students/me/rechecks`
    );
  }

  /** Teacher endpoints */
  teacherListMyExams() {
    return this.http.get<{ data: MyExamSummary[] }>(
      `${this.base}/exams/teachers/me/exams`
    );
  }

  teacherGetMyPapers(id: string) {
    return this.http.get<{ data: TeacherExamPaperRow[] }>(
      `${this.base}/exams/teachers/me/exams/${encodeURIComponent(id)}/papers`
    );
  }

  teacherGetMyExamSummary(id: string) {
    return this.http.get<{
      data: TeacherExamSummaryRow[];
      grading_mode: 'per_subject' | 'aggregate' | null;
    }>(`${this.base}/exams/teachers/me/exams/${encodeURIComponent(id)}/summary`);
  }

  /** Admin recheck management */
  listRecheckRequests(examId?: string, status?: string) {
    let p = new HttpParams();
    if (status) p = p.set('status', status);
    if (examId) {
      return this.http.get<{ data: RecheckRequestDto[] }>(
        `${this.base}/exams/${encodeURIComponent(examId)}/recheck-requests`,
        { params: p }
      );
    }
    return this.http.get<{ data: RecheckRequestDto[] }>(
      `${this.base}/exams/recheck-requests`,
      { params: p }
    );
  }

  assignRecheck(requestId: string, teacherId: string) {
    return this.http.post<{ data: RecheckRequestDto; message: string }>(
      `${this.base}/exams/recheck-requests/${encodeURIComponent(requestId)}/assign`,
      { teacher_id: teacherId }
    );
  }

  resolveRecheck(requestId: string, body: { status: 'resolved' | 'rejected' | 'closed'; teacher_comment: string }) {
    return this.http.post<{ data: RecheckRequestDto; message: string }>(
      `${this.base}/exams/recheck-requests/${encodeURIComponent(requestId)}/resolve`,
      body
    );
  }
}
