import { Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CustomRole {
  name: string;
  label?: string;
  description?: string;
  permissions?: string[];
  isActive?: boolean;
  createdAt?: Date;
}

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
  reportTemplate?: 'classic' | 'modern' | 'professional'; // NEW: Report template selection
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

  // =====================================================
  // CUSTOM ROLE MANAGEMENT
  // =====================================================

  private rolesBase = `${environment.apiUrl}/settings/roles`;

  /** Get all custom roles for the lab */
  getRoles(): Observable<{ success: boolean; roles: CustomRole[] }> {
    return this.http.get<{ success: boolean; roles: CustomRole[] }>(this.rolesBase);
  }

  /** Create a new custom role */
  createRole(role: Partial<CustomRole>): Observable<{ success: boolean; message: string; role: CustomRole }> {
    return this.http.post<{ success: boolean; message: string; role: CustomRole }>(this.rolesBase, role);
  }

  /** Update an existing custom role */
  updateRole(roleName: string, updates: Partial<CustomRole>): Observable<{ success: boolean; message: string; role: CustomRole }> {
    return this.http.put<{ success: boolean; message: string; role: CustomRole }>(`${this.rolesBase}/${encodeURIComponent(roleName)}`, updates);
  }

  /** Delete a custom role */
  deleteRole(roleName: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.rolesBase}/${encodeURIComponent(roleName)}`);
  }
}

