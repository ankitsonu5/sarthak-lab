import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface Doctor {
  _id?: string;
  doctorId?: string;
  // Basic Information (Always required)
  name: string;
  fee: number;
  gender: 'Male' | 'Female' | 'Other';
  department: string | { _id: string; name: string; code?: string };
  // Additional Information (Optional)
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  age?: number;
  specialization?: string;
  qualification?: string;
  experience?: number;
  licenseNumber?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  availableSlots?: any[];
  isActive?: boolean;
  imageUrl?: string; // Backend returns imageUrl
  registrationDate?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ADDED: Response interface for paginated doctors
export interface DoctorResponse {
  doctors: Doctor[];
  totalPages: number;
  currentPage: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class DoctorService {
  private apiUrl = `${environment.apiUrl}/doctors`; // Backend API URL
  private doctorsSubject = new BehaviorSubject<Doctor[]>([]);
  public doctors$ = this.doctorsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadDoctors();
  }

  // Get all doctors (supports cache-busting)
  getDoctors(nocache: boolean = false): Observable<Doctor[]> {
    // No authentication headers needed for public /list endpoint
    // Set a very high limit to get all doctors (no pagination)
    let params = new HttpParams()
      .set('limit', '10000')  // Large limit to get all doctors
      .set('page', '1');

    if (nocache) {
      params = params.set('_', Date.now().toString());
    }

    console.log('🔍 Making API call to:', `${this.apiUrl}/list`, 'nocache=', nocache);

    return this.http.get<any>(`${this.apiUrl}/list`, { params }).pipe(
      tap(response => {
        console.log('API Response:', response);
        // Handle both array response and object response with doctors property
        const doctors = Array.isArray(response) ? response : (response.doctors || []);
        console.log('Doctors loaded from API:', doctors.length, 'doctors');
        this.doctorsSubject.next(doctors);
      }),
      catchError(error => {
        console.error('Error loading doctors from API:', error);
        console.log('Backend server might not be running. Starting with empty list.');
        this.doctorsSubject.next([]);
        return of([]);
      }),
      map((response: any) => Array.isArray(response) ? response : (response.doctors || []))
    );
  }

  // ADDED: Get doctors with pagination
  getDoctorsPaginated(page: number = 1, limit: number = 10, search: string = '', nocache: boolean = false): Observable<DoctorResponse> {
    // No authentication headers needed for public /list endpoint
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (search) {
      params = params.set('search', search);
    }

    if (nocache) {
      params = params.set('_', Date.now().toString());
    }

    console.log('🔍 Making API call to:', `${this.apiUrl}/list`, 'with params:', params.toString());

    // Use the same /list endpoint as getDoctors for consistency
    return this.http.get<DoctorResponse>(`${this.apiUrl}/list`, { params }).pipe(
      tap(response => {
        console.log('✅ Paginated doctors loaded:', response);
      }),
      catchError(error => {
        console.error('❌ Error loading paginated doctors:', error);
        // Return empty response on error
        return of({
          doctors: [],
          totalPages: 0,
          currentPage: 1,
          total: 0
        });
      })
    );
  }


  // Check if phone exists (for uniqueness validation)
  checkPhoneUnique(phone: string): Observable<{ exists: boolean }> {
    const params = new HttpParams().set('phone', phone);
    return this.http.get<{ exists: boolean }>(`${this.apiUrl}/check-phone`, { params });
  }

  // Get doctor by ID (supports cache-busting)
  getDoctorById(id: string, nocache: boolean = false): Observable<Doctor> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
    const params = nocache ? new HttpParams().set('_', Date.now().toString()) : undefined;

    return this.http.get<Doctor>(`${this.apiUrl}/${id}`, { headers, params }).pipe(
      catchError(error => {
        console.error('Error fetching doctor by ID:', error);
        throw error;
      })
    );
  }

  // Create new doctor
  createDoctor(doctorData: FormData | any): Observable<Doctor> {
    console.log('Creating doctor with data:', doctorData);

    // Check if it's FormData (with image) or JSON object (without image)
    const isFormData = doctorData instanceof FormData;
    const hasImage = isFormData && doctorData.has('image');
    console.log('Is FormData:', isFormData, 'Has image:', hasImage);

    // If FormData (with or without image), send directly to backend
    if (isFormData) {
      console.log('Sending FormData directly to backend...');

      // Log FormData contents for debugging
      console.log('FormData contents:');
      (doctorData as FormData).forEach((value, key) => {
        console.log(`${key}:`, value);
      });

      const token = localStorage.getItem('token');
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`
        // Don't set Content-Type for FormData, let browser set it with boundary
      });

      return this.http.post<Doctor>(this.apiUrl, doctorData, { headers }).pipe(
        tap(doctor => {
          console.log('Doctor created successfully:', doctor);
          this.loadDoctors(); // Refresh the list after creation
        }),
        catchError((error: any) => {
          console.error('Error creating doctor with FormData:', error);
          throw error;
        })
      );
    }

    // Handle JSON data (no image) or convert FormData to JSON
    let doctorObj: any;

    if (isFormData) {
      // Convert FormData to JSON for API call (without image)
      doctorObj = {};
      (doctorData as FormData).forEach((value: any, key: any) => {
        if (key === 'address') {
          doctorObj[key] = JSON.parse(value as string);
        } else if (key === 'availableSlots') {
          doctorObj[key] = JSON.parse(value as string);
        } else if (key === 'experience' || key === 'consultationFee') {
          doctorObj[key] = parseInt(value as string);
        } else if (key === 'isActive') {
          doctorObj[key] = value === 'true';
        } else if (key !== 'image') { // Skip image field for JSON
          doctorObj[key] = value;
        }
      });
    } else {
      // Already a JSON object
      doctorObj = doctorData;
    }

    console.log('Sending doctor object to API:', doctorObj);

    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.post<Doctor>(this.apiUrl, doctorObj, { headers }).pipe(
      tap(doctor => {
        console.log('Doctor created successfully:', doctor);
        this.loadDoctors(); // Refresh the list after creation
      }),
      catchError((error: any) => {
        console.error('Error creating doctor:', error);

        // If backend is not available, create mock doctor for testing
        if (error.status === 0 || error.status === 404) {
          console.log('Backend not available, creating mock doctor for testing');
          const mockDoctor: Doctor = {
            _id: Date.now().toString(),
            doctorId: `DOC${Date.now().toString().slice(-6)}`,
            ...doctorObj,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Add to local state
          this.addDoctorToState(mockDoctor);
          return of(mockDoctor);
        }

        throw error;
      })
    );
  }

  // Update doctor
  updateDoctor(id: string, doctorData: FormData | any): Observable<Doctor> {
    console.log('Updating doctor with data:', doctorData);

    // Check if it's FormData or JSON object
    const isFormData = doctorData instanceof FormData;
    console.log('Update - Is FormData:', isFormData);

    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
      // Don't set Content-Type for FormData, let browser set it with boundary
    });

    return this.http.put<Doctor>(`${this.apiUrl}/${id}`, doctorData, { headers }).pipe(
      tap(doctor => {
        console.log('Doctor updated successfully:', doctor);
        this.loadDoctors(); // Refresh the list after update
      })
    );
  }

  // Delete doctor
  deleteDoctor(id: string): Observable<any> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.delete(`${this.apiUrl}/${id}`, { headers }).pipe(
      tap(() => {
        console.log('Doctor deleted successfully');
        // Component will handle refresh - no need to refresh here
      })
    );
  }

  // Search doctors
  searchDoctors(searchTerm: string): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${this.apiUrl}/search?q=${searchTerm}`);
  }

  // Filter doctors by department (optional cache-busting to avoid stale data)
  getDoctorsByDepartment(department: string, nocache: boolean = false): Observable<Doctor[]> {
    let params = new HttpParams();
    if (nocache) {
      params = params.set('_', Date.now().toString());
    }
    return this.http.get<Doctor[]>(`${this.apiUrl}/department/${department}`, { params });
  }

  // Filter doctors by specialization
  getDoctorsBySpecialization(specialization: string): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${this.apiUrl}/specialization/${specialization}`);
  }

  // Toggle doctor active status
  toggleDoctorStatus(id: string): Observable<Doctor> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.patch<Doctor>(`${this.apiUrl}/${id}/toggle-status`, {}, { headers }).pipe(
      tap(() => this.loadDoctors()) // Refresh the list after status change
    );
  }

  // Private method to load doctors
  private loadDoctors(): void {
    this.getDoctors().subscribe();
  }

  // Get current doctors from subject
  getCurrentDoctors(): Doctor[] {
    return this.doctorsSubject.value;
  }

  // Add doctor to local state (for immediate UI update)
  addDoctorToState(doctor: Doctor): void {
    const currentDoctors = this.getCurrentDoctors();
    this.doctorsSubject.next([...currentDoctors, doctor]);
  }

  // Update doctor in local state
  updateDoctorInState(updatedDoctor: Doctor): void {
    const currentDoctors = this.getCurrentDoctors();
    const index = currentDoctors.findIndex(d => d._id === updatedDoctor._id);
    if (index !== -1) {
      currentDoctors[index] = updatedDoctor;
      this.doctorsSubject.next([...currentDoctors]);
    }
  }

  // Remove doctor from local state
  removeDoctorFromState(doctorId: string): void {
    const currentDoctors = this.getCurrentDoctors();
    const filteredDoctors = currentDoctors.filter(d => d._id !== doctorId);
    this.doctorsSubject.next(filteredDoctors);
  }




}
