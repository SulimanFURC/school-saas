import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export type ExpenseType =
  | 'Salary'
  | 'Rent'
  | 'Electricity'
  | 'Water'
  | 'Internet'
  | 'Supplies'
  | 'Maintenance'
  | 'Transport'
  | 'Miscellaneous';

export type ExpenseStatus = 'Paid' | 'Due' | 'Other';

export interface Expense {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  amount: number;
  expense_date: string;
  expense_type: ExpenseType;
  status: ExpenseStatus;
  attachment_url: string | null;
  created_by_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
  createdBy?: { id: string; name?: string; email?: string } | null;
}

export interface ExpenseListResponse {
  data: Expense[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateExpensePayload {
  name: string;
  description?: string | null;
  amount: number;
  expense_date: string;
  expense_type: string;
  status: string;
}

export interface CreateExpenseResponse {
  message: string;
  data: Expense;
}

function toNum(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function normalizeExpense(raw: Record<string, unknown>): Expense {
  return {
    id: String(raw['id'] ?? ''),
    tenant_id: String(raw['tenant_id'] ?? raw['tenantId'] ?? ''),
    name: String(raw['name'] ?? ''),
    description: raw['description'] != null ? String(raw['description']) : null,
    amount: toNum(raw['amount']),
    expense_date: String(raw['expense_date'] ?? raw['expenseDate'] ?? ''),
    expense_type: raw['expense_type'] as Expense['expense_type'],
    status: raw['status'] as Expense['status'],
    attachment_url:
      raw['attachment_url'] != null && String(raw['attachment_url']).trim() !== ''
        ? String(raw['attachment_url'])
        : null,
    created_by_user_id:
      raw['created_by_user_id'] != null ? String(raw['created_by_user_id']) : null,
    created_at: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    updated_at: raw['updated_at'] != null ? String(raw['updated_at']) : undefined,
    createdBy: (raw['createdBy'] as Expense['createdBy']) ?? undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    expense_type?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }): Observable<ExpenseListResponse> {
    let httpParams = new HttpParams();
    if (params.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params.limit != null) httpParams = httpParams.set('limit', String(params.limit));
    if (params.search != null && params.search.trim() !== '') {
      httpParams = httpParams.set('search', params.search.trim());
    }
    if (params.status != null && params.status.trim() !== '') {
      httpParams = httpParams.set('status', params.status.trim());
    }
    if (params.expense_type != null && params.expense_type.trim() !== '') {
      httpParams = httpParams.set('expense_type', params.expense_type.trim());
    }
    if (params.sort_by != null && params.sort_by.trim() !== '') {
      httpParams = httpParams.set('sort_by', params.sort_by.trim());
    }
    if (params.sort_order != null) {
      httpParams = httpParams.set('sort_order', params.sort_order);
    }
    return this.http.get<unknown>(`${this.base}/expenses`, { params: httpParams }).pipe(
      map((body) => {
        const o = body as Record<string, unknown>;
        const rows = Array.isArray(o['data']) ? (o['data'] as Record<string, unknown>[]) : [];
        return {
          data: rows.map((r) => normalizeExpense(r)),
          total: Number(o['total'] ?? 0),
          page: Number(o['page'] ?? 1),
          limit: Number(o['limit'] ?? 20),
        };
      })
    );
  }

  getById(id: string): Observable<Expense> {
    return this.http
      .get<Record<string, unknown>>(`${this.base}/expenses/${id}`)
      .pipe(map((r) => normalizeExpense(r)));
  }

  create(payload: CreateExpensePayload): Observable<CreateExpenseResponse> {
    return this.http.post<unknown>(`${this.base}/expenses`, payload).pipe(
      map((body) => {
        const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
        const dataRaw = o['data'];
        const dataObj =
          dataRaw && typeof dataRaw === 'object' ? (dataRaw as Record<string, unknown>) : {};
        return {
          message: String(o['message'] ?? ''),
          data: normalizeExpense(dataObj),
        };
      })
    );
  }

  update(id: string, payload: Partial<CreateExpensePayload>): Observable<Expense> {
    return this.http
      .put<Record<string, unknown>>(`${this.base}/expenses/${id}`, payload)
      .pipe(map((r) => normalizeExpense(r)));
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/expenses/${id}`);
  }

  uploadReceipt(id: string, file: File): Observable<{ message: string; data: Expense }> {
    const fd = new FormData();
    fd.append('receipt', file, file.name);
    return this.http.post<unknown>(`${this.base}/expenses/${id}/receipt`, fd).pipe(
      map((body) => {
        const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
        const dataRaw = o['data'];
        const dataObj =
          dataRaw && typeof dataRaw === 'object' ? (dataRaw as Record<string, unknown>) : {};
        return {
          message: String(o['message'] ?? ''),
          data: normalizeExpense(dataObj),
        };
      })
    );
  }

  deleteReceipt(id: string): Observable<{ message: string; data: Expense }> {
    return this.http.delete<unknown>(`${this.base}/expenses/${id}/receipt`).pipe(
      map((body) => {
        const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
        const dataRaw = o['data'];
        const dataObj =
          dataRaw && typeof dataRaw === 'object' ? (dataRaw as Record<string, unknown>) : {};
        return {
          message: String(o['message'] ?? ''),
          data: normalizeExpense(dataObj),
        };
      })
    );
  }
}
