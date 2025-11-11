import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError, Subject, of, BehaviorSubject } from 'rxjs';
import { catchError, tap, map, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { GlobalStateService } from '../core/services/global-state.service';
import { DataRefreshService } from '../core/services/data-refresh.service';

export interface PatientRegistrationData {
  aadharNo?: string;
  designation?: string;
  firstName: string;
  lastName: string;
  age: number;
  ageIn: string;
  gender: string;
  bloodGroup?: string;
  address?: string;
  // post, city and remark removed from the form UI; keep optional for backward compatibility
  post?: string;
  city?: string;
  contact?: string; // Optional: contact number is not mandatory
  remark?: string;
  date?: string;

  registrationTimestamp?: string; // Unique timestamp for each registration
}

export interface PatientRegistrationResponse {
  success: boolean;
  message: string;
  patient?: {
    patientId: string;
    registrationNumber?: number;
    firstName: string;
    lastName: string;
    _id: string;
  };
}

@Injectable({ providedIn: 'root' })
export class PatientService {
  private apiUrl = `${environment.apiUrl}/patients`;
  private appointmentApiUrl = `${environment.apiUrl}/appointments`;
  private departmentApiUrl = `${environment.apiUrl}/departments`;
  private roomApiUrl = `${environment.apiUrl}/rooms`;

  // Subject to notify when patients list should be refreshed
  private patientUpdatedSubject = new Subject<void>();
  public patientUpdated$ = this.patientUpdatedSubject.asObservable().pipe(
    debounceTime(300), // Wait 300ms before emitting
    distinctUntilChanged() // Only emit if different from previous
  );

  // Subject to notify about newly added patient
  private newPatientAddedSubject = new Subject<any>();
  public newPatientAdded$ = this.newPatientAddedSubject.asObservable().pipe(
    debounceTime(300), // Wait 300ms before emitting
    distinctUntilChanged() // Only emit if different from previous
  );

  // Debug: Track subscribers (unused)
  private subscriberCount = 0;
  // BehaviorSubject to maintain current patients list state - DEPARTMENT STYLE
  private patientsListSubject = new BehaviorSubject<any[]>([]);
  public patientsList$ = this.patientsListSubject.asObservable();

  // BehaviorSubject for loading state
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  constructor(
    private http: HttpClient,
    private globalState: GlobalStateService,
    private dataRefresh: DataRefreshService
  ) {
    console.log('🏗️ PatientService: Constructor called - Service instance created');

    // DEPARTMENT STYLE: Keep local BehaviorSubject, don't override with global state
    // this.patientsList$ = this.globalState.patients$;  // COMMENTED OUT
    // this.loading$ = this.globalState.patientsLoading$;  // COMMENTED OUT

    console.log('🏥 DEPARTMENT STYLE: Using local BehaviorSubject for patientsList$');
  }

  // Get current patients list
  getCurrentPatientsList(): any[] {
    return this.globalState.getPatients();
  }

  // DISABLED: Update patients list state to prevent infinite loops
  updatePatientsListState(patients: any[]): void {
    console.log('� Updating patients list state DISABLED to prevent infinite loops');
    // this.globalState.updatePatients(patients);
  }

  // DISABLED: Add new patient to existing list to prevent infinite loops
  addPatientToList(newPatient: any): void {
    console.log('🚫 Adding new patient to list DISABLED to prevent infinite loops');
    // this.globalState.addPatient(newPatient);
    // this.dataRefresh.notifyPatientCreated(newPatient);
  }

  // DISABLED: Remove patient from list to prevent infinite loops
  removePatientFromList(patientId: string): void {
    console.log('🚫 Removing patient from list DISABLED to prevent infinite loops');
    // this.globalState.removePatient(patientId);
    // this.dataRefresh.notifyPatientDeleted(patientId);
  }

  // Set loading state
  setLoadingState(loading: boolean): void {
    this.globalState.setLoading('patients', loading);
  }

  // 🚫 SIMPLIFIED: Single trigger method to prevent infinite loops
  triggerPatientUpdated(): void {
    console.log('� SINGLE TRIGGER: Patient updated notification');
    this.patientUpdatedSubject.next();
  }

  // DISABLED: Single new patient trigger to prevent infinite loops
  triggerNewPatientAdded(patientId: string): void {
    console.log('🚫 SINGLE TRIGGER: triggerNewPatientAdded DISABLED to prevent infinite loops');
    // this.newPatientAddedSubject.next({ patientId });
  }



  registerPatient(data: PatientRegistrationData): Observable<PatientRegistrationResponse> {
    console.log('🆕 PatientService: CREATING NEW PATIENT (not updating existing)');
    console.log('🆕 PatientService: Sending NEW registration data:', data);

    // Add cache-busting headers to ensure fresh request
    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };

    return this.http.post<PatientRegistrationResponse>(`${this.apiUrl}/register`, data, { headers })
      .pipe(
        tap((response) => {
          console.log('🔍 Patient registration response received:', response);
          if (response.success) {
            console.log('✅ Patient registered successfully - triggering notifications');

            // ✅ DATABASE-ONLY: Trigger service notification for real-time updates
            this.patientUpdatedSubject.next();
            console.log('🔔 DATABASE: Patient update notification sent');

            console.log('✅ Patient registration completed!');
          } else {
            console.log('❌ Patient registration failed:', response);
          }
        }),
        catchError(this.handleError)
      );
  }

  // DISABLED: Refresh method to prevent infinite loops
  private refreshPatients(): void {
    console.log('� DEPARTMENT STYLE: Refresh disabled to prevent infinite loops');
    // this.getAllPatients().subscribe();
  }

  // DEPARTMENT STYLE: Simple patients list (for dropdowns/OPD)
  getPatientsList(): Observable<any[]> {
    console.log('🏥 DEPARTMENT STYLE: Getting simple patients list...');
    const url = `${this.apiUrl}/list?t=${Date.now()}`;

    return this.http.get<any>(url, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    }).pipe(
      map((response: any) => {
        console.log('🏥 DEPARTMENT STYLE: Raw response:', response);

        // Handle both array response and object response
        if (Array.isArray(response)) {
          console.log('🏥 ✅ Direct array received:', response.length);
          return response;
        } else if (response && response.patients) {
          console.log('🏥 ✅ Object with patients array:', response.patients.length);
          return response.patients;
        } else {
          console.log('🏥 ❌ Unexpected response format, using empty array');
          return [];
        }
      }),
      catchError((error) => {
        console.error('❌ Error loading patients list:', error);
        return of([]);
      })
    );
  }

  // 🎯 NEW: Get latest registered patient from database
  getLatestRegisteredPatient(): Observable<any> {
    console.log('🎯 SERVICE: Getting latest registered patient from database...');

    const url = `${this.apiUrl}/latest`;

    return this.http.get<any>(url, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    }).pipe(
      tap((response: any) => {
        console.log('✅ SERVICE: Latest patient received:', response);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('❌ SERVICE: Error getting latest patient:', error);
        return throwError(() => error);
      })
    );
  }

  getAllPatients(page: number = 1, limit: number = 10, search: string = '', todayOnly: boolean = true, filters?: any): Observable<any> {
    const params: any = {
      page: page.toString(),
      limit: limit.toString(),
      search,
      todayOnly: todayOnly.toString()
    };

    // Add filters if provided
    if (filters) {
      if (filters.dateFilter && filters.dateFilter !== 'all') {
        params.dateFilter = filters.dateFilter;
      }
      if (filters.customDate) {
        params.customDate = filters.customDate;
      }
      if (filters.ageFilter && filters.ageFilter !== 'all') {
        params.ageFilter = filters.ageFilter;
      }
      if (filters.genderFilter && filters.genderFilter !== 'all') {
        params.genderFilter = filters.genderFilter;
      }
      // Add sort parameters for descending order (newest first)
      if (filters.sortBy) {
        params.sortBy = filters.sortBy;
      }
      if (filters.sortOrder) {
        params.sortOrder = filters.sortOrder;
      }
    }
    console.log('PatientService: Fetching patients with params:', params);

    // Set loading state
    this.setLoadingState(true);

    // Add cache-busting headers and param if nocache is requested
    const httpOptions: any = { params };
    if (filters && filters.nocache) {
      httpOptions.headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      };
      // Also add a timestamp query param to fully bypass browser/proxy caches
      httpOptions.params = { ...httpOptions.params, _: Date.now().toString() };
      console.log('🚫 CACHE: Using no-cache headers + timestamp param for fresh data');
    }

    // Perf label for timing
    const perfLabel = `API /patients/list page=${params.page} limit=${params.limit}`;
    const t0 = performance.now();

    return this.http.get<any>(`${this.apiUrl}/list`, httpOptions)
      .pipe(
        tap((response: any) => {
          const dt = Math.round(performance.now() - t0);
          console.log(`⏱️ ${perfLabel} -> ${dt}ms`);
          // DISABLED: BehaviorSubject update to prevent infinite loops
          const patients = response.patients || [];
          console.log('🏥 DEPARTMENT STYLE: Received', patients.length, 'patients (BehaviorSubject update disabled)');
          console.log('🏥 DEPARTMENT STYLE: First patient:', patients[0]?.firstName, patients[0]?.lastName);
          // this.patientsListSubject.next(patients);

          // DISABLED: Update patients list state to prevent loops
          // if (response.success && response.patients) {
          //   this.updatePatientsListState(response.patients);
          //   console.log('📋 Updated patients list state with', response.patients.length, 'patients');
          // }
          // Clear loading state
          this.setLoadingState(false);
        }),
        catchError((error) => {
          // Clear loading state on error
          this.setLoadingState(false);
          return this.handleError(error);
        })
      );
  }

  getPatientById(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  getPatientByRegistrationNumber(registrationNumber: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/registration/${registrationNumber}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Get patient registration number suggestions
  getPatientSuggestions(query: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/suggestions/${query}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Get appointment by registration number (appointmentId)
  getAppointmentByRegistrationNumber(registrationNumber: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/appointments/registration/${registrationNumber}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Get appointment registration number suggestions
  getAppointmentSuggestions(query: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/appointments/suggestions/${query}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  updatePatient(id: string, data: any): Observable<any> {
    console.log('PatientService: Updating patient with ID:', id, 'Data:', data);
    // Backend expects PUT /api/patients/:id (no /update)
    return this.http.put<any>(`${this.apiUrl}/${id}`, data)
      .pipe(
        tap((_response) => {
          // Trigger a single notification so lists refresh
          console.log('✅ Patient updated - notifying subscribers');
          this.patientUpdatedSubject.next();
        }),
        catchError(this.handleError)
      );
  }

  deletePatient(id: string): Observable<any> {
    console.log('PatientService: Deleting patient with ID:', id);
    return this.http.delete<any>(`${this.apiUrl}/${id}`)
      .pipe(
        tap((response) => {
          if (response.success) {
            console.log('✅ Patient deleted successfully - single notification');
            // 🚫 SINGLE TRIGGER: Only one notification to prevent loops
            console.log('✅ Patient deleted successfully, updating state and notifying components...');

            // OPTIMISTIC UPDATE: Remove patient from list immediately
            this.removePatientFromList(id);

            // Notify all subscribed components that patient list should be refreshed
            this.patientUpdatedSubject.next();
          }
        }),
        catchError(this.handleError)
      );
  }

  // Book OPD Appointment
  bookOpdAppointment(appointmentData: any): Observable<any> {
    console.log('PatientService: Booking OPD appointment:', appointmentData);
    return this.http.post<any>(`${this.appointmentApiUrl}/book-opd`, appointmentData)
      .pipe(
        tap((response: any) => {
          console.log('✅ OPD Appointment booked successfully:', response);

          const apt = response?.appointment || response;

          // Add appointment to global state
          if (apt) {
            this.globalState.addAppointment(apt);
            this.dataRefresh.notifyAppointmentCreated(apt);
          }

          // TRIGGER NOTIFICATIONS for automatic refresh
          this.patientUpdatedSubject.next();
          console.log('🔔 APPOINTMENT BOOKED: Triggered patient update notification');
        }),
        catchError(this.handleError)
      );
  }

  // Get all appointments (optionally bypass cache)
  getAllAppointments(
    page: number = 1,
    limit: number = 50,
    status: string = '',
    date: string = '',
    nocache: boolean = false,
    search?: string,
    opts?: { startDate?: string; endDate?: string; registrationNumber?: string }
  ): Observable<any> {
    const params: any = {
      page: page.toString(),
      limit: limit.toString(),
      status,
      date
    };

    if (search && search.trim()) {
      params.search = search.trim();
    }

    if (opts?.startDate) params.startDate = opts.startDate;
    if (opts?.endDate) params.endDate = opts.endDate;
    if (opts?.registrationNumber) params.registrationNumber = opts.registrationNumber;

    // Add cache-busting param when requested
    const httpOptions: any = { params };
    if (nocache) {
      params._ = Date.now().toString(); // query param to break cache keys
      params.nocache = 'true'; // explicit flag for interceptors
      httpOptions.headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      };
      console.log('🚫 CACHE: Forcing fresh appointments load with no-cache headers/params');
    }

    console.log('PatientService: Fetching all appointments with params:', params);
    return this.http.get<any>(`${this.appointmentApiUrl}/list`, httpOptions)
      .pipe(
        tap((response: any) => {
          // Update appointments in global state (response is standard JSON body)
          if (response && response.appointments) {
            this.globalState.updateAppointments(response.appointments);
            console.log('📋 Updated appointments in global state with', response.appointments.length, 'appointments');
          }
        }),
        catchError(this.handleError)
      );
  }

  private handleError(error: HttpErrorResponse) {
    console.error('PatientService error:', error);
    let errorMessage = 'An unknown error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = error.error?.message || `Error Code: ${error.status}\nMessage: ${error.message}`;
    }

    return throwError(() => new Error(errorMessage));
  }

  // Get all departments
  getDepartments(): Observable<any[]> {
    const url = `${this.departmentApiUrl}/list?t=${Date.now()}`;
    console.log('🏥 Making API call to:', url);
    return this.http.get<any[]>(url, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    })
      .pipe(
        map((response: any[]) => {
          console.log('🏥 Raw Department API response:', response);
          console.log('🏥 Response type:', typeof response);
          console.log('🏥 Is direct array?', Array.isArray(response));

          // Backend now returns direct array
          if (Array.isArray(response)) {
            console.log('🏥 ✅ Direct array received:', response.length);
            console.log('🏥 ✅ First department:', response[0]);
            return response;
          }

          // Fallback if not array
          console.log('🏥 ❌ Not an array, using empty array');
          return [];
        }),
        catchError((error) => {
          console.error('❌ Error loading departments:', error);
          console.error('❌ Error details:', error.status, error.statusText);
          // Return empty array on error
          return of([]);
        })
      );
  }

  // Get all rooms (non-paginated for fast ID->RoomNumber mapping)
  getRooms(): Observable<any[]> {
    // Ask backend for a large page to include all rooms. Also support multiple response shapes.
    const params = new HttpParams().set('limit', '1000').set('page', '1');

    return this.http.get<any>(`${this.roomApiUrl}`, { params })
      .pipe(
        map((response: any) => {
          console.log('🏠 Raw Rooms API response:', response);
          // Shape A: { rooms: [...] }
          if (response && Array.isArray(response.rooms)) {
            return response.rooms;
          }
          // Shape B: { success: true, data: [...] }
          if (response && Array.isArray(response.data)) {
            return response.data;
          }
          // Shape C: direct array
          if (Array.isArray(response)) {
            return response;
          }
          console.warn('🏠 Rooms API returned unexpected shape; defaulting to empty list');
          return [];
        }),
        catchError((error) => {
          console.error('❌ Error loading rooms:', error);
          return of([]);
        })
      );
  }

  // Get rooms by department
  getRoomsByDepartment(departmentId: string): Observable<any[]> {
    console.log('🏠 Fetching rooms for department:', departmentId);
    return this.http.get<any[]>(`${this.roomApiUrl}/department/${departmentId}`)
      .pipe(
        map((response: any) => {
          console.log('🏠 Rooms by department response:', response);
          // Backend returns array directly for this endpoint
          return Array.isArray(response) ? response : [];
        }),
        catchError((error) => {
          console.error('❌ Error loading rooms by department:', error);
          return of([]);
        })
      );
  }

  // Delete appointment
  deleteAppointment(appointmentId: string): Observable<any> {
    return this.http.delete(`${this.appointmentApiUrl}/${appointmentId}`)
      .pipe(
        tap((response: any) => {
          console.log('Delete appointment API response:', response);
        }),
        catchError(this.handleError)
      );
  }

  // Get daily patient registration count
  getDailyPatientCount(date?: string): Observable<any> {
    let params = new HttpParams();
    if (date) {
      params = params.set('date', date);
    }
    return this.http.get<any>(`${this.apiUrl}/daily-count`, { params })
      .pipe(
        catchError(this.handleError)
      );
  }

  // Get yearly patient registration count
  getYearlyPatientCount(year?: number): Observable<any> {
    let params = new HttpParams();
    if (year) {
      params = params.set('year', year.toString());
    }
    return this.http.get<any>(`${this.apiUrl}/yearly-count`, { params })
      .pipe(
        catchError(this.handleError)
      );
  }
}
