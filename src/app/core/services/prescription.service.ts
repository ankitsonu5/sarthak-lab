import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Medicine {
  medicineName: string;
  genericName?: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  beforeAfterMeal: 'Before meal' | 'After meal' | 'With meal' | 'Empty stomach' | 'Anytime';
  quantity: number;
  refills: number;
  isActive: boolean;
}

export interface Prescription {
  _id?: string;
  prescriptionId?: string;
  patient: string;
  doctor: string;
  appointment: string;
  medicines: Medicine[];
  diagnosis: {
    primary: string;
    secondary?: string[];
    icdCodes?: string[];
  };
  symptoms?: string[];
  vitalSigns?: {
    bloodPressure?: string;
    heartRate?: string;
    temperature?: string;
    weight?: string;
    height?: string;
    bmi?: string;
    oxygenSaturation?: string;
  };
  allergies?: string[];
  medicalHistory?: string[];
  labTests?: Array<{
    testName: string;
    instructions: string;
    urgent: boolean;
  }>;
  followUpInstructions?: string;
  followUpDate?: Date;
  emergencyInstructions?: string;
  status: 'Active' | 'Completed' | 'Cancelled' | 'Expired';
  prescribedDate: Date;
  validUntil: Date;
  digitalSignature?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PrescriptionListResponse {
  prescriptions: Prescription[];
  totalPages: number;
  currentPage: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class PrescriptionService {
  private apiUrl = `${environment.apiUrl}/prescriptions`;

  constructor(private http: HttpClient) { }

  getPrescriptions(
    page: number = 1, 
    limit: number = 10, 
    status: string = '', 
    patientId: string = ''
  ): Observable<PrescriptionListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    
    if (status) params = params.set('status', status);
    if (patientId) params = params.set('patientId', patientId);

    return this.http.get<PrescriptionListResponse>(this.apiUrl, { params });
  }

  getPrescriptionById(id: string): Observable<Prescription> {
    return this.http.get<Prescription>(`${this.apiUrl}/${id}`);
  }

  createPrescription(prescription: Prescription): Observable<{ message: string; prescription: Prescription }> {
    return this.http.post<{ message: string; prescription: Prescription }>(this.apiUrl, prescription);
  }

  updatePrescription(id: string, prescription: Partial<Prescription>): Observable<{ message: string; prescription: Prescription }> {
    return this.http.put<{ message: string; prescription: Prescription }>(`${this.apiUrl}/${id}`, prescription);
  }


  cancelPrescription(id: string): Observable<{ message: string; prescription: Prescription }> {
    return this.http.patch<{ message: string; prescription: Prescription }>(`${this.apiUrl}/${id}/cancel`, {});
  }

  deletePrescription(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  getPrescriptionsByPatient(patientId: string): Observable<Prescription[]> {
    return this.http.get<Prescription[]>(`${this.apiUrl}/patient/${patientId}`);
  }

  getActivePrescriptionsByPatient(patientId: string): Observable<Prescription[]> {
    return this.http.get<Prescription[]>(`${this.apiUrl}/patient/${patientId}/active`);
  }
}
