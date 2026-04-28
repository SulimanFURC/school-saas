import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { environment } from '../../environments/environment';

export interface SubjectDto {
  id: number;
  tenant_id?: string;
  name: string;
  name_key?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SubjectCreatePayload {
  name: string;
  is_active?: boolean;
}

export interface SubjectUpdatePayload {
  name?: string;
  is_active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SubjectService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  list(params?: { q?: string; activeOnly?: boolean }) {
    let httpParams = new HttpParams();
    const q = params?.q != null ? params.q.trim() : '';
    if (q) httpParams = httpParams.set('q', q);
    if (params?.activeOnly === true) httpParams = httpParams.set('activeOnly', 'true');
    return this.http.get<SubjectDto[]>(`${this.base}/subjects`, { params: httpParams });
  }

  create(body: SubjectCreatePayload) {
    return this.http.post<SubjectDto>(`${this.base}/subjects`, body);
  }

  update(id: number, body: SubjectUpdatePayload) {
    return this.http.patch<SubjectDto>(`${this.base}/subjects/${id}`, body);
  }

  delete(id: number) {
    return this.http.delete<void>(`${this.base}/subjects/${id}`);
  }
}

