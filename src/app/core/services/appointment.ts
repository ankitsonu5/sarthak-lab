import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Patient } from './patient';
import { Doctor } from './doctor';
import { environment } from '../../../environments/environment';
import { DataRefreshService } from './data-refresh.service';

export interface Appointment {
  _id?: string;
  appointmentId?: string;
  patient: string | Patient;
  doctor: string | Doctor;
  appointmentDate: Date;
  appointmentTime: string;
  duration?: number;
  reason: string;
  status?: 'Scheduled' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled' | 'No Show';
  type?: 'Consultation' | 'Follow-up' | 'Emergency' | 'Routine Check-up';
  notes?: string;
  prescription?: {
    medicines: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
      instructions: string;
    }>;
    advice: string;
  };
  followUpDate?: Date;
  isFollowUp?: boolean;
  followUpCompleted?: boolean;
  consultationFee: number;
  paymentMethod?: string; // e.g., 'Cash' | 'UPI'
  isPaid?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AppointmentListResponse {
  appointments: Appointment[];
  totalPages: number;
  currentPage: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {
  private apiUrl = `${environment.apiUrl}/appointments`;

  constructor(private http: HttpClient, private dataRefresh: DataRefreshService) { }

  getAppointments(
    page: number = 1,
    limit: number = 10,
    status: string = '',
    date: string = '',
    doctorId: string = '',
    patientId: string = ''
  ): Observable<AppointmentListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (status) params = params.set('status', status);
    if (date) params = params.set('date', date);
    if (doctorId) params = params.set('doctorId', doctorId);
    if (patientId) params = params.set('patientId', patientId);

    return this.http.get<AppointmentListResponse>(this.apiUrl, { params });
  }

  getAppointmentById(id: string): Observable<Appointment> {
    return this.http.get<Appointment>(`${this.apiUrl}/${id}`);
  }

  createAppointment(appointment: Appointment): Observable<{ message: string; appointment: Appointment }> {
    return this.http.post<{ message: string; appointment: Appointment }>(this.apiUrl, appointment).pipe(
      tap(res => {
        try { this.dataRefresh.notifyAppointmentCreated(res.appointment || res as any); } catch {}
      })
    );
  }

  updateAppointment(id: string, appointment: Partial<Appointment>): Observable<{ message: string; appointment: Appointment }> {
    return this.http.put<{ message: string; appointment: Appointment }>(`${this.apiUrl}/${id}`, appointment).pipe(
      tap(res => {
        try { this.dataRefresh.notifyAppointmentUpdated(res.appointment || res as any); } catch {}
      })
    );
  }

  cancelAppointment(id: string): Observable<{ message: string; appointment: Appointment }> {
    return this.http.patch<{ message: string; appointment: Appointment }>(`${this.apiUrl}/${id}/cancel`, {}).pipe(
      tap(res => {
        try { this.dataRefresh.notifyAppointmentUpdated(res.appointment || res as any); } catch {}
      })
    );
  }

  completeAppointment(id: string, data: { prescription?: Appointment['prescription']; notes?: string; followUpDate?: Date }): Observable<{ message: string; appointment: Appointment }> {
    return this.http.patch<{ message: string; appointment: Appointment }>(`${this.apiUrl}/${id}/complete`, data).pipe(
      tap(res => {
        try { this.dataRefresh.notifyAppointmentUpdated(res.appointment || res as any); } catch {}
      })
    );
  }

  getAppointmentsByDateRange(startDate: string, endDate: string): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(`${this.apiUrl}/date-range/${startDate}/${endDate}`);
  }
}
