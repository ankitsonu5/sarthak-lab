import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Report {
  _id?: string;
  reportId?: string;
  patient: string;
  doctor: string;
  appointment: string;
  reportType: 'Lab Test' | 'X-Ray' | 'MRI' | 'CT Scan' | 'Blood Test' | 'Urine Test' | 'ECG' | 'Ultrasound' | 'Other';
  title: string;
  description: string;
  findings: string;
  recommendations?: string;
  testResults?: Array<{
    testName: string;
    result: string;
    normalRange?: string;
    unit?: string;
    status: 'Normal' | 'Abnormal' | 'Critical';
  }>;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileType: string;
    uploadedAt: Date;
  }>;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Reviewed';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  reportDate: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  isConfidential: boolean;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReportListResponse {
  reports: Report[];
  totalPages: number;
  currentPage: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private apiUrl = `${environment.apiUrl}/reports`;

  constructor(private http: HttpClient) { }

  getReports(
    page: number = 1, 
    limit: number = 10, 
    status: string = '', 
    reportType: string = '', 
    patientId: string = ''
  ): Observable<ReportListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    
    if (status) params = params.set('status', status);
    if (reportType) params = params.set('reportType', reportType);
    if (patientId) params = params.set('patientId', patientId);

    return this.http.get<ReportListResponse>(this.apiUrl, { params });
  }

  getReportById(id: string): Observable<Report> {
    return this.http.get<Report>(`${this.apiUrl}/${id}`);
  }

  createReport(report: Report): Observable<{ message: string; report: Report }> {
    return this.http.post<{ message: string; report: Report }>(this.apiUrl, report);
  }

  updateReport(id: string, report: Partial<Report>): Observable<{ message: string; report: Report }> {
    return this.http.put<{ message: string; report: Report }>(`${this.apiUrl}/${id}`, report);
  }

  reviewReport(id: string, data: { status: string; notes?: string }): Observable<{ message: string; report: Report }> {
    return this.http.patch<{ message: string; report: Report }>(`${this.apiUrl}/${id}/review`, data);
  }

  deleteReport(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  getReportsByPatient(patientId: string): Observable<Report[]> {
    return this.http.get<Report[]>(`${this.apiUrl}/patient/${patientId}`);
  }
}
