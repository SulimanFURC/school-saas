import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface FeeCollection {
  id: string;
  student_id: string;
  invoice_number: string;
  registration_no: string;
  student_name: string;
  class_name: string | null;
  roll_number?: number | null;
  fee_type: 'Tuition' | 'Annual' | 'Library' | 'Transport' | 'Exam' | 'Miscellaneous';
  amount: number;
  collection_date: string;
  payment_method: 'Cash' | 'Credit Card' | 'Debit Card' | 'Cheque' | 'Bank Transfer' | 'Online';
  status: 'Paid' | 'Pending' | 'Unpaid';
  payment_reference_number?: string | null;
  notes?: string | null;
  collected_by_user_id: string;
  created_at?: string;
  updated_at?: string;
  is_latest?: boolean;
}

export interface FeeListResponse {
  data: FeeCollection[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateFeePayload {
  student_id: string;
  fee_type: string;
  amount: number;
  collection_date: string;
  payment_method: string;
  status: string;
  payment_reference_number?: string;
  notes?: string;
}

export interface CreateFeeResponse {
  message: string;
  data: FeeCollection;
  invoice_number: string;
}

function toNum(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function normalizeFee(raw: Record<string, unknown>): FeeCollection {
  return {
    id: String(raw['id'] ?? ''),
    student_id: String(raw['student_id'] ?? raw['studentId'] ?? ''),
    invoice_number: String(raw['invoice_number'] ?? raw['invoiceNumber'] ?? ''),
    registration_no: String(raw['registration_no'] ?? raw['registrationNo'] ?? ''),
    student_name: String(raw['student_name'] ?? raw['studentName'] ?? ''),
    class_name:
      raw['class_name'] != null || raw['className'] != null
        ? String(raw['class_name'] ?? raw['className'])
        : null,
    roll_number:
      raw['roll_number'] != null && raw['roll_number'] !== ''
        ? Number(raw['roll_number'])
        : null,
    fee_type: raw['fee_type'] as FeeCollection['fee_type'],
    amount: toNum(raw['amount']),
    collection_date: String(raw['collection_date'] ?? raw['collectionDate'] ?? ''),
    payment_method: raw['payment_method'] as FeeCollection['payment_method'],
    status: raw['status'] as FeeCollection['status'],
    payment_reference_number:
      raw['payment_reference_number'] != null
        ? String(raw['payment_reference_number'])
        : null,
    notes: raw['notes'] != null ? String(raw['notes']) : null,
    collected_by_user_id: String(raw['collected_by_user_id'] ?? raw['collectedByUserId'] ?? ''),
    created_at: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    updated_at: raw['updated_at'] != null ? String(raw['updated_at']) : undefined,
    is_latest: raw['is_latest'] === true,
  };
}

@Injectable({ providedIn: 'root' })
export class FeeService {
  private http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  createFee(payload: CreateFeePayload): Observable<CreateFeeResponse> {
    return this.http.post<unknown>(`${this.base}/fees`, payload).pipe(
      map((body) => {
        const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
        const dataRaw = o['data'];
        const dataObj =
          dataRaw && typeof dataRaw === 'object' ? (dataRaw as Record<string, unknown>) : {};
        return {
          message: String(o['message'] ?? ''),
          data: normalizeFee(dataObj),
          invoice_number: String(o['invoice_number'] ?? dataObj['invoice_number'] ?? ''),
        };
      })
    );
  }

  getFees(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    fee_type?: string;
  }): Observable<FeeListResponse> {
    let httpParams = new HttpParams();
    if (params.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params.limit != null) httpParams = httpParams.set('limit', String(params.limit));
    if (params.search != null && params.search.trim() !== '') {
      httpParams = httpParams.set('search', params.search.trim());
    }
    if (params.status != null && params.status.trim() !== '') {
      httpParams = httpParams.set('status', params.status.trim());
    }
    if (params.fee_type != null && params.fee_type.trim() !== '') {
      httpParams = httpParams.set('fee_type', params.fee_type.trim());
    }
    return this.http.get<unknown>(`${this.base}/fees`, { params: httpParams }).pipe(
      map((body) => {
        const o = body as Record<string, unknown>;
        const rows = Array.isArray(o['data']) ? (o['data'] as Record<string, unknown>[]) : [];
        return {
          data: rows.map((r) => normalizeFee(r)),
          total: Number(o['total'] ?? 0),
          page: Number(o['page'] ?? 1),
          limit: Number(o['limit'] ?? 20),
        };
      })
    );
  }

  getFeeById(id: string): Observable<FeeCollection> {
    return this.http.get<Record<string, unknown>>(`${this.base}/fees/${id}`).pipe(map((r) => normalizeFee(r)));
  }

  getFeesByStudent(studentId: string): Observable<FeeCollection[]> {
    return this.http.get<unknown[]>(`${this.base}/fees/student/${studentId}`).pipe(
      map((arr) => (Array.isArray(arr) ? arr : []).map((item) => normalizeFee(item as Record<string, unknown>)))
    );
  }

  updateFee(id: string, payload: Partial<CreateFeePayload>): Observable<FeeCollection> {
    return this.http
      .put<Record<string, unknown>>(`${this.base}/fees/${id}`, payload)
      .pipe(map((r) => normalizeFee(r)));
  }

  deleteFee(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/fees/${id}`);
  }
}
