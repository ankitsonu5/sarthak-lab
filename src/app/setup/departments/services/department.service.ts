import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface Department {
  description: string;
  _id?: string;
  name: string;
  code?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DepartmentResponse {
  departments: Department[];
  totalPages: number;
  currentPage: number;
  total: number;
}

export interface DepartmentStats {
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class DepartmentService {
  private apiUrl = `${environment.apiUrl}/departments`;
  private departmentsSubject = new BehaviorSubject<Department[]>([]);
  public departments$ = this.departmentsSubject.asObservable();



  constructor(private http: HttpClient) {}

  // Get all departments with pagination and search
  getDepartments(page: number = 1, limit: number = 10, search: string = '', nocache: boolean = false): Observable<DepartmentResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (search) {
      params = params.set('search', search);
    }

    if (nocache) {
      params = params.set('_', Date.now().toString());
    }

    return this.http.get<DepartmentResponse>(this.apiUrl, { params }).pipe(
      tap(response => {
        this.departmentsSubject.next(response.departments);
      })
    );
  }

  // Get departments list (for dropdowns)
  getDepartmentsList(nocache: boolean = false): Observable<Department[]> {
    let params = new HttpParams();
    if (nocache) params = params.set('_', Date.now().toString());
    return this.http.get<{ departments: Department[] }>(`${this.apiUrl}/list`, { params }).pipe(
      map((response: any) => Array.isArray(response) ? response : (response.departments || []))
    );
  }

  // Get department by ID (supports cache-busting)
  getDepartmentById(id: string, nocache: boolean = false): Observable<Department> {
    let params = new HttpParams();
    if (nocache) {
      params = params.set('_', Date.now().toString());
    }

    const headers = nocache ? {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    } : undefined;

    return this.http.get<Department>(`${this.apiUrl}/${id}`, {
      params,
      headers,
      observe: 'body'
    });
  }

  // Create new department
  createDepartment(departmentData: Partial<Department>): Observable<Department> {
    return this.http.post<Department>(this.apiUrl, departmentData).pipe(
      tap(() => {
        // Refresh the departments list
        this.refreshDepartments();
      })
    );
  }

  // Update department
  updateDepartment(id: string, departmentData: Partial<Department>): Observable<Department> {
    return this.http.put<Department>(`${this.apiUrl}/${id}`, departmentData).pipe(
      tap(() => {
        // Refresh the departments list
        this.refreshDepartments();
      })
    );
  }

  // Delete department (soft delete)
  deleteDepartment(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        // Refresh the departments list
        this.refreshDepartments();
      })
    );
  }

  // Restore department
  restoreDepartment(id: string): Observable<Department> {
    return this.http.patch<Department>(`${this.apiUrl}/${id}/restore`, {}).pipe(
      tap(() => {
        // Refresh the departments list
        this.refreshDepartments();
      })
    );
  }

  // Get department statistics
  getDepartmentStats(): Observable<DepartmentStats> {
    return this.http.get<DepartmentStats>(`${this.apiUrl}/stats/overview`);
  }

  // Refresh departments list
  private refreshDepartments(): void {
    this.getDepartments().subscribe();
  }

  // Generate department code from name
  generateDepartmentCode(name: string): string {
    if (!name) return '';
    
    // Remove special characters and split by spaces
    const words = name.replace(/[^a-zA-Z\s]/g, '').split(' ');
    
    if (words.length === 1) {
      // Single word: take first 3-4 characters
      return words[0].substring(0, 4).toUpperCase();
    } else {
      // Multiple words: take first letter of each word
      return words.map(word => word.charAt(0)).join('').toUpperCase();
    }
  }

  // Validate department data
  validateDepartment(department: Partial<Department>): string[] {
    const errors: string[] = [];

    if (!department.name || department.name.trim().length === 0) {
      errors.push('Department name is required');
    }

    if (department.name && department.name.trim().length < 2) {
      errors.push('Department name must be at least 2 characters long');
    }

    if (department.code && department.code.trim().length > 10) {
      errors.push('Department code must be 10 characters or less');
    }

    return errors;
  }


}
