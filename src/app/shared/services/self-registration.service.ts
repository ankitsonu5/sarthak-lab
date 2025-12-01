import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SelfRegistrationPayload {
  firstName: string;
  lastName?: string;
  phone: string;
  gender?: string;
  age?: string;
  address?: string;
  city?: string;
  preferredDate?: string;
  preferredTime?: string;
  testsNote?: string;
  homeCollection?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SelfRegistrationService {
  private base = `${environment.apiUrl}/self-registration`;

  constructor(private http: HttpClient) {}

  // Backward-compat (by labId)
  submit(payload: SelfRegistrationPayload, labId: string): Observable<any> {
    return this.http.post(`${this.base}/${encodeURIComponent(labId)}`, payload);
  }
  listRecent(labId: string): Observable<{ success: boolean; items: any[] }> {
    return this.http.get<{ success: boolean; items: any[] }>(`${this.base}/${encodeURIComponent(labId)}/recent`);
  }

  // Preferred (by labCode)
  submitByCode(payload: SelfRegistrationPayload, labCode: string): Observable<any> {
    return this.http.post(`${this.base}/by-code/${encodeURIComponent(labCode)}`, payload);
  }
  listRecentByCode(labCode: string): Observable<{ success: boolean; items: any[] }> {
    return this.http.get<{ success: boolean; items: any[] }>(`${this.base}/by-code/${encodeURIComponent(labCode)}/recent`);
  }
}

