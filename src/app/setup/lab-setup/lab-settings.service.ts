import { Injectable, Injector } from '@angular/core';
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
  private labNameService: any;

  constructor(
    private http: HttpClient,
    private injector: Injector
  ) {}

  private getLabNameService(): any {
    if (!this.labNameService) {
      try {
        // Lazy load to avoid circular dependency
        this.labNameService = this.injector.get('LabNameService' as any);
      } catch (e) {
        // Service not available yet
      }
    }
    return this.labNameService;
  }

  getMyLab(): Observable<{ lab: LabSettings | null }> {
    return this.http.get<{ lab: LabSettings | null }>(this.base).pipe(
      tap(res => {
        localStorage.setItem('labSettings', JSON.stringify(res.lab || {}));
        // Update lab name service if available
        const labNameSvc = this.getLabNameService();
        if (labNameSvc && res.lab?.labName) {
          labNameSvc.setLabName(res.lab.labName);
        }
      })
    );
  }

  saveMyLab(lab: LabSettings): Observable<{ message: string; lab: LabSettings }> {
    return this.http.post<{ message: string; lab: LabSettings }>(this.base, { lab }).pipe(
      tap((res) => {
        localStorage.setItem('labSettings', JSON.stringify(res.lab || {}));
        // Update lab name service if available
        const labNameSvc = this.getLabNameService();
        if (labNameSvc && res.lab?.labName) {
          labNameSvc.setLabName(res.lab.labName);
        }
      })
    );
  }
}

