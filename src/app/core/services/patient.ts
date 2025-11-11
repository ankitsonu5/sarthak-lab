import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Patient {
  _id?: string;
  patientId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: Date;
  gender: 'Male' | 'Female' | 'Other';
  address: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
  medicalHistory?: Array<{
    condition: string;
    diagnosedDate: Date;
    status: 'Active' | 'Resolved' | 'Chronic';
  }>;
  allergies?: string[];
  bloodGroup?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PatientListResponse {
  patients: Patient[];
  totalPages: number;
  currentPage: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private apiUrl = `${environment.apiUrl}/patients`;

  // Subject for real-time patient updates
  patientUpdated$ = new Subject<void>();

  constructor(private http: HttpClient) { }

  getPatients(page: number = 1, limit: number = 10, search: string = ''): Observable<PatientListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (search) {
      params = params.set('search', search);
    }

    return this.http.get<PatientListResponse>(this.apiUrl, { params });
  }

  // Get all patients with additional filters
  getAllPatients(page: number = 1, limit: number = 50, search: string = '', todayOnly: boolean = false): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (search) {
      params = params.set('search', search);
    }

    if (todayOnly) {
      params = params.set('todayOnly', 'true');
    }

    return this.http.get<any>(this.apiUrl, { params });
  }

  getPatientById(id: string): Observable<Patient> {
    return this.http.get<Patient>(`${this.apiUrl}/${id}`);
  }

  createPatient(patient: Patient): Observable<{ message: string; patient: Patient }> {
    return this.http.post<{ message: string; patient: Patient }>(this.apiUrl, patient).pipe(
      tap(() => {
        console.log('🔔 Patient created, triggering update notification...');
        this.patientUpdated$.next();
      })
    );
  }

  // Register patient (alias for createPatient for compatibility)
  registerPatient(patient: Partial<Patient>): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, patient).pipe(
      tap(() => {
        console.log('🔔 Patient registered, triggering update notification...');
        this.patientUpdated$.next();
      })
    );
  }

  updatePatient(id: string, patient: Partial<Patient>): Observable<{ message: string; patient: Patient }> {
    return this.http.put<{ message: string; patient: Patient }>(`${this.apiUrl}/${id}`, patient).pipe(
      tap(() => {
        console.log('🔔 Patient updated, triggering update notification...');
        this.patientUpdated$.next();
      })
    );
  }

  deletePatient(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        console.log('🔔 Patient deleted, triggering update notification...');
        this.patientUpdated$.next();
      })
    );
  }

  getPatientMedicalHistory(id: string): Observable<Patient['medicalHistory']> {
    return this.http.get<Patient['medicalHistory']>(`${this.apiUrl}/${id}/medical-history`);
  }

  addMedicalHistory(id: string, history: { condition: string; diagnosedDate: Date; status: 'Active' | 'Resolved' | 'Chronic' }): Observable<{ message: string; medicalHistory: Patient['medicalHistory'] }> {
    return this.http.post<{ message: string; medicalHistory: Patient['medicalHistory'] }>(`${this.apiUrl}/${id}/medical-history`, history);
  }

  // Public method to manually trigger patient update notification
  notifyPatientUpdate(): void {
    console.log('🔔 MANUAL TRIGGER: Forcing patient update notification...');
    this.patientUpdated$.next();
  }

}
