import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  getEnrollmentSummary(params: { academic_year_id: number; class_id?: number }): Observable<unknown> {
    let hp = new HttpParams().set('academic_year_id', String(params.academic_year_id));
    if (params.class_id != null) hp = hp.set('class_id', String(params.class_id));
    return this.http.get(`${this.base}/reports/students/enrollment-summary`, { params: hp });
  }

  getFeeCollectionSummary(params: { date_from: string; date_to: string }): Observable<unknown> {
    const hp = new HttpParams().set('date_from', params.date_from).set('date_to', params.date_to);
    return this.http.get(`${this.base}/reports/fees/collection-summary`, { params: hp });
  }

  getFeeDefaulters(params: { academic_year_id: number }): Observable<unknown> {
    const hp = new HttpParams().set('academic_year_id', String(params.academic_year_id));
    return this.http.get(`${this.base}/reports/fees/defaulters`, { params: hp });
  }

  getExpenseSummary(params: { date_from: string; date_to: string }): Observable<unknown> {
    const hp = new HttpParams().set('date_from', params.date_from).set('date_to', params.date_to);
    return this.http.get(`${this.base}/reports/expenses/summary`, { params: hp });
  }

  /** Client-side CSV download for tabular arrays */
  exportToCsv(rows: Record<string, unknown>[], filename: string, columns: { key: string; header: string }[]): void {
    const esc = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = columns.map((c) => esc(c.header)).join(',');
    const lines = rows.map((row) => columns.map((c) => esc(row[c.key])).join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
