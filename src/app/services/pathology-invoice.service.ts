import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PathologyInvoiceData {
  patient: {
    patientId: string;
    registrationNumber: string;
    name: string;
    phone: string;
    gender: string;
    age: number; // Store age as number only
    ageIn: string; // Store age unit separately (Years/Months/Days)
    address: string;
  };
  doctor: {
    name: string;
    specialization: string;
    roomNumber?: string;
  };
  department: {
    name: string;
    code?: string;
  };
  tests: Array<{
    name: string;
    category: string;
    cost: number;
    quantity: number;
    discount: number;
    netAmount: number;
  }>;
  payment: {
    subtotal: number;
    totalDiscount: number;
    totalAmount: number;
    paymentMethod?: string;
  };
  registrationNumber?: string;
  bookingDate?: Date;
  registrationDate?: Date;
  doctorRefNo?: string;
  // Extra context (optional)
  mode?: string;
  appointmentId?: string;
}

export interface PathologyInvoiceResponse {
  success: boolean;
  message: string;
  invoice?: {
    receiptNumber: number;
    invoiceNumber: string;
    bookingId: string;
    totalAmount: number;
    paymentDate: Date;
    _id: string;
  };
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PathologyInvoiceService {
  private apiUrl = `${environment.apiUrl}/pathology-invoice`;

  constructor(private http: HttpClient) { }

  /**
   * Create a new pathology invoice
   */
  createInvoice(invoiceData: PathologyInvoiceData): Observable<PathologyInvoiceResponse> {
    console.log('📄 Creating pathology invoice:', invoiceData);
    return this.http.post<PathologyInvoiceResponse>(`${this.apiUrl}/create`, invoiceData);
  }

  /**
   * Get invoice by receipt number
   */
  getInvoiceByReceiptNumber(receiptNumber: number): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/pathology-invoice/receipt/${receiptNumber}`);
  }

  /**
   * Get all invoices with pagination + optional server-side filters
   */
  getAllInvoices(page: number = 1, limit: number = 50, opts?: { search?: string; receipt?: string; registration?: string; phone?: string; dateRange?: string; startDate?: string; endDate?: string; status?: 'pending' | 'done' | ''; category?: string }): Observable<any> {
    const ts = Date.now();
    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    params.set('_', String(ts));
    if (opts) {
      if (opts.search) params.set('search', opts.search);
      if (opts.receipt) params.set('receipt', opts.receipt);
      if (opts.registration) params.set('registration', opts.registration);
      if (opts.phone) params.set('phone', opts.phone);
      if (opts.dateRange) params.set('dateRange', opts.dateRange);
      if (opts.startDate) params.set('startDate', opts.startDate);
      if (opts.endDate) params.set('endDate', opts.endDate);
      if (opts.status) params.set('status', opts.status);
      if (opts.category) params.set('category', opts.category);
    }
    return this.http.get<any>(`${this.apiUrl}/list?${params.toString()}`, { headers });
  }

  /**
   * Update print status of invoice
   */
  updatePrintStatus(invoiceId: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${invoiceId}/print`, {});
  }

  /**
   * Test the service connection
   */
  testConnection(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/test`);
  }

  /**
   * Get revenue report by department
   */
  getDepartmentRevenue(startDate?: string, endDate?: string): Observable<any> {
    let params = '';
    if (startDate && endDate) {
      params = `?startDate=${startDate}&endDate=${endDate}`;
    }
    return this.http.get<any>(`${this.apiUrl}/reports/department${params}`);
  }

  /**
   * Get revenue report by category
   */
  getCategoryRevenue(startDate?: string, endDate?: string, department?: string): Observable<any> {
    let params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (department) params.append('department', department);

    const queryString = params.toString();
    return this.http.get<any>(`${this.apiUrl}/reports/category${queryString ? '?' + queryString : ''}`);
  }

  /**
   * Get daily revenue summary
   */
  getDailyRevenue(startDate?: string, endDate?: string): Observable<any> {
    let params = '';
    if (startDate && endDate) {
      params = `?startDate=${startDate}&endDate=${endDate}`;
    }
    return this.http.get<any>(`${this.apiUrl}/reports/daily${params}`);
  }

  /**
   * Get receipt-level entries within a range (for chart tooltips)
   */
  getReceipts(startDate?: string, endDate?: string): Observable<any> {
    let params = '';
    if (startDate && endDate) {
      params = `?startDate=${startDate}&endDate=${endDate}`;
    }
    return this.http.get<any>(`${this.apiUrl}/reports/receipts${params}`);
  }

  /**
   * Get daily registration count for pathology
   */
  getDailyRegistrationCount(): Observable<any> {
    const today = (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
    console.log('📊 PathologyInvoiceService: Getting daily registration count for:', today);
    return this.http.get<any>(`${this.apiUrl}/daily-count?date=${today}`);
  }

  /**
   * Get yearly registration count for pathology
   */
  getYearlyRegistrationCount(year: number): Observable<any> {
    console.log('📅 PathologyInvoiceService: Getting yearly registration count for:', year);
    return this.http.get<any>(`${this.apiUrl}/yearly-count?year=${year}&_=${Date.now()}`);
  }

  /**
   * Get daily lab registration count for pathology registrations
   */
  getDailyLabRegistrationCount(mode?: string): Observable<any> {
    const today = (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
    const modeParam = mode ? `&mode=${encodeURIComponent(mode)}` : '';
    console.log('📊 PathologyInvoiceService: Getting daily lab registration count for:', today, 'mode:', mode || 'ALL');
    return this.http.get<any>(`${environment.apiUrl}/pathology-registration/daily-count?date=${today}${modeParam}&_=${Date.now()}`);
  }

  /**
   * Get yearly lab registration count for pathology registrations
   */
  getYearlyLabRegistrationCount(year: number, mode?: string): Observable<any> {
    const modeParam = mode ? `&mode=${encodeURIComponent(mode)}` : '';
    console.log('📅 PathologyInvoiceService: Getting yearly lab registration count for:', year, 'mode:', mode || 'ALL');
    return this.http.get<any>(`${environment.apiUrl}/pathology-registration/yearly-count?year=${year}${modeParam}&_=${Date.now()}`);
  }

  /**
   * Check if a receipt is linked to Pathology (registration/report exists)
   */
  isLinkedToPathology(receiptNumber: number | string): Observable<{ linked: boolean }> {
    return this.http.get<{ linked: boolean }>(`${this.apiUrl}/receipt/${receiptNumber}/linked`);
  }


  /**
   * Get latest global receipt number (for enabling delete button only on the last)
   */
  getLastReceipt(): Observable<{ success: boolean; lastReceiptNumber: number }> {
    // Cache-buster so the latest receipt number is reflected instantly without manual refresh
    const ts = Date.now();
    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    return this.http.get<{ success: boolean; lastReceiptNumber: number }>(`${this.apiUrl}/last-receipt?_=${ts}`, { headers });
  }

  /**
   * Delete invoice by receipt number
   */
  deleteByReceipt(receiptNumber: number | string, reason: string = ''): Observable<any> {
    const q = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    return this.http.delete<any>(`${this.apiUrl}/receipt/${receiptNumber}${q}`);
  }

}
