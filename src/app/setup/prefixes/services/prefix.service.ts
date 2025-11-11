import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface Prefix {
  _id?: string;
  name: string;
  gender: 'Male' | 'Female' | 'Other';
  isActive?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

@Injectable({ providedIn: 'root' })
export class PrefixService {
  private apiUrl = `${environment.apiUrl}/prefixes`;
  constructor(private http: HttpClient) {}

  getPrefixes(page = 1, limit = 50, search = ''): Observable<{ prefixes: Prefix[]; pagination: any }> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (search) params = params.set('search', search);
    return this.http.get<{ success: boolean; prefixes: Prefix[]; pagination: any }>(this.apiUrl, { params });
  }

  getPrefixList(): Observable<Prefix[]> {
    return this.http
      .get<{ success: boolean; prefixes: Prefix[] }>(`${this.apiUrl}/list`)
      .pipe(map(res => res.prefixes || []));
  }

  createPrefix(data: Partial<Prefix>): Observable<Prefix> {
    return this.http.post<{ success: boolean; prefix: Prefix }>(this.apiUrl, data).pipe(map(r => r.prefix));
  }

  updatePrefix(id: string, data: Partial<Prefix>): Observable<Prefix> {
    return this.http.put<{ success: boolean; prefix: Prefix }>(`${this.apiUrl}/${id}`, data).pipe(map(r => r.prefix));
  }

  deletePrefix(id: string): Observable<{ message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/${id}`).pipe(map(r => ({ message: r.message })));
  }
}

