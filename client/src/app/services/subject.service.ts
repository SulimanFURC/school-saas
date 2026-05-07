import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';

import { environment } from '../../environments/environment';
import { normalizePaginatedResponse, PaginatedResponse } from '../shared/data-table/pagination.types';

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

  list(params?: { q?: string; activeOnly?: boolean; page?: number; limit?: number }) {
    let httpParams = new HttpParams();
    const q = params?.q != null ? params.q.trim() : '';
    if (q) httpParams = httpParams.set('q', q);
    if (params?.activeOnly === true) httpParams = httpParams.set('activeOnly', 'true');
    if (params?.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params?.limit != null) httpParams = httpParams.set('limit', String(params.limit));
    return this.http
      .get<unknown>(`${this.base}/subjects`, { params: httpParams })
      .pipe(
        map((body) =>
          normalizePaginatedResponse<SubjectDto>(body, { page: params?.page ?? 1, limit: params?.limit ?? 20 })
        )
      );
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

