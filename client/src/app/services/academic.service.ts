import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { environment } from '../../environments/environment';

export interface ClassTeacherSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  designation?: string | null;
}

export interface SchoolClassDto {
  id: number;
  name: string;
  class_teacher_id: string;
  classTeacher?: ClassTeacherSummary | null;
  is_active?: boolean;
  sections?: SectionDto[];
}

export interface SectionDto {
  id: number;
  class_id: number;
  name: string;
}

export interface SectionInput {
  id?: number;
  name: string;
}

export interface CreateClassPayload {
  name: string;
  class_teacher_id: string;
  sections: SectionInput[];
  is_active?: boolean;
}

export interface UpdateClassPayload {
  name?: string;
  class_teacher_id?: string;
  is_active?: boolean;
  sections?: SectionInput[];
}

export interface AcademicYearDto {
  id: number;
  name: string | null;
  is_active: boolean;
}

@Injectable({ providedIn: 'root' })
export class AcademicService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  listClasses(includeSections = false) {
    const params = includeSections ? { include: 'sections' } : undefined;
    return this.http.get<SchoolClassDto[]>(`${this.base}/classes`, { params });
  }

  getClass(id: number) {
    return this.http.get<SchoolClassDto>(`${this.base}/classes/${id}`);
  }

  createClass(body: CreateClassPayload) {
    return this.http.post<SchoolClassDto>(`${this.base}/classes`, body);
  }

  updateClass(id: number, body: UpdateClassPayload) {
    return this.http.patch<SchoolClassDto>(`${this.base}/classes/${id}`, body);
  }

  deleteClass(id: number) {
    return this.http.delete(`${this.base}/classes/${id}`);
  }

  listSections(classId: number) {
    return this.http.get<SectionDto[]>(`${this.base}/sections`, {
      params: { class_id: String(classId) },
    });
  }

  createSection(classId: number, name: string) {
    return this.http.post<SectionDto>(`${this.base}/sections`, { class_id: classId, name });
  }

  updateSection(id: number, name: string) {
    return this.http.patch<SectionDto>(`${this.base}/sections/${id}`, { name });
  }

  deleteSection(id: number) {
    return this.http.delete(`${this.base}/sections/${id}`);
  }

  listAcademicYears() {
    return this.http.get<AcademicYearDto[]>(`${this.base}/academic-years`);
  }

  getCurrentAcademicYear() {
    return this.http.get<AcademicYearDto>(`${this.base}/academic-years/current`);
  }
}
