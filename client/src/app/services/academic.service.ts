import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { environment } from '../../environments/environment';

export interface SchoolClassDto {
  id: number;
  name: string;
  display_order: number | null;
}

export interface SectionDto {
  id: number;
  class_id: number;
  name: string;
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

  listClasses() {
    return this.http.get<SchoolClassDto[]>(`${this.base}/classes`);
  }

  listSections(classId: number) {
    return this.http.get<SectionDto[]>(`${this.base}/sections`, {
      params: { class_id: String(classId) },
    });
  }

  listAcademicYears() {
    return this.http.get<AcademicYearDto[]>(`${this.base}/academic-years`);
  }
}
