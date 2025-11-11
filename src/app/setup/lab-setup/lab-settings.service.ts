import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LabSettings {
  labName?: string;
  shortName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  website?: string;
  logoDataUrl?: string;
  sideLogoDataUrl?: string;
  signatureDataUrl?: string;
  headerNote?: string;
  footerNote?: string;
  reportDisclaimer?: string;
  prefixes?: {
    receipt?: string;
    report?: string;
    labYearlyPrefix?: string;
    labDailyPrefix?: string;
  };
  numbering?: {
    receiptStart?: number;
    reportStart?: number;
    resetRule?: 'yearly' | 'monthly' | 'never';
  };
  printLayout?: {
    template?: 'classic' | 'compact' | 'minimal';
    showHeader?: boolean;
    showFooter?: boolean;
    showQr?: boolean;
    showRefDoctor?: boolean;
    showAmount?: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class LabSettingsService {
  private base = `${environment.apiUrl}/settings/me/lab`;

  constructor(private http: HttpClient) {}

  getMyLab(): Observable<{ lab: LabSettings | null }> {
    return this.http.get<{ lab: LabSettings | null }>(this.base).pipe(
      tap(res => localStorage.setItem('labSettings', JSON.stringify(res.lab || {})))
    );
  }

  saveMyLab(lab: LabSettings): Observable<{ message: string; lab: LabSettings }> {
    return this.http.post<{ message: string; lab: LabSettings }>(this.base, { lab }).pipe(
      tap((res) => localStorage.setItem('labSettings', JSON.stringify(res.lab || {})))
    );
  }
}

