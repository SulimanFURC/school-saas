import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export type AuditSource = 'audit_logs' | 'exam_mark_audits';

export interface AuditActor {
  id: string;
  name: string;
  role: string;
}

export interface UnifiedAuditLogRow {
  id: string;
  source: AuditSource;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
  changeSummary?: Array<{
    field: string;
    changeType: 'added' | 'removed' | 'updated';
    before: unknown;
    after: unknown;
  }>;
  actorUserId: string | null;
  createdAt: string;
  actor: AuditActor | null;
}

export interface UnifiedAuditLogsResponse {
  data: UnifiedAuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditLogQuery {
  q?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  source?: AuditSource;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  list(params: AuditLogQuery): Observable<UnifiedAuditLogsResponse> {
    let hp = new HttpParams();
    if (params.q) hp = hp.set('q', params.q);
    if (params.action) hp = hp.set('action', params.action);
    if (params.entityType) hp = hp.set('entityType', params.entityType);
    if (params.entityId) hp = hp.set('entityId', params.entityId);
    if (params.actorUserId) hp = hp.set('actorUserId', params.actorUserId);
    if (params.source) hp = hp.set('source', params.source);
    if (params.from) hp = hp.set('from', params.from);
    if (params.to) hp = hp.set('to', params.to);
    if (params.page != null) hp = hp.set('page', String(params.page));
    if (params.limit != null) hp = hp.set('limit', String(params.limit));

    return this.http.get<UnifiedAuditLogsResponse>(`${this.base}/audit-logs`, { params: hp });
  }

  listEntityHistory(entityType: string, entityId: string, params: AuditLogQuery): Observable<UnifiedAuditLogsResponse> {
    let hp = new HttpParams();
    if (params.source) hp = hp.set('source', params.source);
    if (params.from) hp = hp.set('from', params.from);
    if (params.to) hp = hp.set('to', params.to);
    if (params.page != null) hp = hp.set('page', String(params.page));
    if (params.limit != null) hp = hp.set('limit', String(params.limit));
    return this.http.get<UnifiedAuditLogsResponse>(
      `${this.base}/audit-logs/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/history`,
      { params: hp }
    );
  }

  listUserTimeline(userId: string, params: AuditLogQuery): Observable<UnifiedAuditLogsResponse> {
    let hp = new HttpParams();
    if (params.q) hp = hp.set('q', params.q);
    if (params.action) hp = hp.set('action', params.action);
    if (params.entityType) hp = hp.set('entityType', params.entityType);
    if (params.entityId) hp = hp.set('entityId', params.entityId);
    if (params.source) hp = hp.set('source', params.source);
    if (params.from) hp = hp.set('from', params.from);
    if (params.to) hp = hp.set('to', params.to);
    if (params.page != null) hp = hp.set('page', String(params.page));
    if (params.limit != null) hp = hp.set('limit', String(params.limit));
    return this.http.get<UnifiedAuditLogsResponse>(`${this.base}/audit-logs/users/${encodeURIComponent(userId)}/timeline`, {
      params: hp,
    });
  }
}
