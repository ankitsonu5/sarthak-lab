import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuditLogEntry {
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  by?: { userId?: string; role?: string; name?: string };
  diff?: Record<string, { before: any; after: any }>;
  meta?: any;
  at: string | Date;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private baseUrl = `${environment.apiUrl}/audit-logs`;
  constructor(private http: HttpClient) {}

  getDaily(dateYmd: string, entities?: string[]): Observable<{ success: boolean; date: string; count: number; grouped: Record<string, AuditLogEntry[]>; logs: AuditLogEntry[] }> {
    let params = new HttpParams().set('date', dateYmd);
    if (entities && entities.length) params = params.set('entities', entities.join(','));
    return this.http.get<{ success: boolean; date: string; count: number; grouped: Record<string, AuditLogEntry[]>; logs: AuditLogEntry[] }>(`${this.baseUrl}/daily`, { params });
  }

  recent(limit = 200) {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<{ success: boolean; count: number; logs: AuditLogEntry[] }>(`${this.baseUrl}/recent`, { params });
  }
}

