import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Doctor {
  _id?: string;
  doctorId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization: string;
  qualification: string;
  experience: number;
  department: string;
  availableSlots?: Array<{
    day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
    startTime: string;
    endTime: string;
  }>;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  licenseNumber: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DoctorListResponse {
  doctors: Doctor[];
  totalPages: number;
  currentPage: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class DoctorService {
  private apiUrl = `${environment.apiUrl}/doctors`;

  constructor(private http: HttpClient) { }

  getDoctors(page: number = 1, limit: number = 10, search: string = '', department: string = '', specialization: string = ''): Observable<DoctorListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (search) {
      params = params.set('search', search);
    }
    if (department) {
      params = params.set('department', department);
    }
    if (specialization) {
      params = params.set('specialization', specialization);
    }

    // Use public list endpoint for basic doctor info
    return this.http.get<DoctorListResponse>(`${this.apiUrl}/list`, { params });
  }

  getDoctorById(id: string): Observable<Doctor> {
    return this.http.get<Doctor>(`${this.apiUrl}/${id}`);
  }

  createDoctor(doctor: Doctor): Observable<{ message: string; doctor: Doctor }> {
    return this.http.post<{ message: string; doctor: Doctor }>(this.apiUrl, doctor);
  }

  updateDoctor(id: string, doctor: Partial<Doctor>): Observable<{ message: string; doctor: Doctor }> {
    return this.http.put<{ message: string; doctor: Doctor }>(`${this.apiUrl}/${id}`, doctor);
  }

  deleteDoctor(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  getDoctorAvailableSlots(id: string, date?: string): Observable<Doctor['availableSlots']> {
    let params = new HttpParams();
    if (date) {
      params = params.set('date', date);
    }
    return this.http.get<Doctor['availableSlots']>(`${this.apiUrl}/${id}/available-slots`, { params });
  }

  getDoctorsByDepartment(department: string): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${this.apiUrl}/department/${department}`);
  }

  getDepartments(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/meta/departments`);
  }

  getSpecializations(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/meta/specializations`);
  }
}
