import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { DoctorService } from '../../doctors/services/doctor.service';
import { RoomService } from '../../rooms/services/room.service';

import { environment } from '../../../../environments/environment';

export interface DoctorRoomDirectory {
  _id?: string;
  directoryId?: string;
  // Only store/send IDs or populated refs. Do NOT send name/number fields separately.
  doctor: string | { _id: string; name: string; doctorId?: string };
  department: string | { _id: string; name: string; code?: string };
  room: string | { _id: string; roomNumber: string };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Doctor {
  _id: string;
  name: string;
  doctorId?: string;
  department?: string | { _id: string; name: string; code?: string };
}

export interface Department {
  _id: string;
  name: string;
  code?: string;
}

export interface Room {
  _id: string;
  roomNumber: string;
  department?: { _id: string; name: string };
}

@Injectable({
  providedIn: 'root'
})
export class DoctorRoomDirectoryService {
  private apiUrl = `${environment.apiUrl}/doctor-room-directory`;
  private directoriesSubject = new BehaviorSubject<DoctorRoomDirectory[]>([]);
  public directories$ = this.directoriesSubject.asObservable();

  constructor(private http: HttpClient, private doctorService: DoctorService, private roomService: RoomService) {}

  // Get all directories with pagination and search
  getDirectories(
    page: number = 1,
    limit: number = 10,
    search: string = '',
    department: string = '',
    room: string = '',
    nocache: boolean = false
  ): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (search) params = params.set('search', search);
    if (department) params = params.set('department', department);
    if (room) params = params.set('room', room);
    // Cache-busting param to avoid returning stale cached results after save/update/delete
    if (nocache) params = params.set('_', Date.now().toString());

    return this.http.get<any>(`${this.apiUrl}`, { params }).pipe(
      tap(response => {
        if (response.success) {
          this.directoriesSubject.next(response.data);
        }
      }),
      catchError(this.handleError)
    );
  }

  // Get single directory by ID
  getDirectory(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  // Create new directory
  createDirectory(directoryData: Partial<DoctorRoomDirectory>): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    
    return this.http.post<any>(this.apiUrl, directoryData, { headers }).pipe(
      tap(response => {
        if (response.success) {
          // Add to current list
          const currentDirectories = this.directoriesSubject.value;
          this.directoriesSubject.next([response.data, ...currentDirectories]);
        }
      }),
      catchError(this.handleError)
    );
  }

  // Update directory
  updateDirectory(id: string, directoryData: Partial<DoctorRoomDirectory>): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    
    return this.http.put<any>(`${this.apiUrl}/${id}`, directoryData, { headers }).pipe(
      tap(response => {
        if (response.success) {
          // Update in current list
          const currentDirectories = this.directoriesSubject.value;
          const index = currentDirectories.findIndex(d => d._id === id);
          if (index !== -1) {
            currentDirectories[index] = response.data;
            this.directoriesSubject.next([...currentDirectories]);
          }
        }
      }),
      catchError(this.handleError)
    );
  }

  // Delete directory
  deleteDirectory(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`).pipe(
      tap(response => {
        if (response.success) {
          // Remove from current list
          const currentDirectories = this.directoriesSubject.value;
          const filteredDirectories = currentDirectories.filter(d => d._id !== id);
          this.directoriesSubject.next(filteredDirectories);
        }
      }),
      catchError(this.handleError)
    );
  }

  // Get doctors for dropdown
  getDoctors(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/dropdowns/doctors`).pipe(
      catchError(this.handleError)
    );
  }

  // Get doctor details with department info
  getDoctorDetails(doctorId: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/doctors/${doctorId}`).pipe(
      catchError(this.handleError)
    );
  }

  // Get departments for dropdown
  getDepartments(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/dropdowns/departments`).pipe(
      catchError(this.handleError)
    );
  }

  // Get rooms for dropdown (optionally filtered by department)
  getRooms(departmentId?: string): Observable<any> {
    let params = new HttpParams();
    if (departmentId) {
      params = params.set('department', departmentId);
    }

    return this.http.get<any>(`${this.apiUrl}/dropdowns/rooms`, { params }).pipe(
      catchError(this.handleError)
    );
  }

  // Search directories
  searchDirectories(searchTerm: string, department?: string, room?: string): Observable<any> {
    let params = new HttpParams();
    if (searchTerm) params = params.set('search', searchTerm);
    if (department) params = params.set('department', department);
    if (room) params = params.set('room', room);

    return this.http.get<any>(`${this.apiUrl}`, { params }).pipe(
      tap(response => {
        if (response.success) {
          this.directoriesSubject.next(response.data);
        }
      }),
      catchError(this.handleError)
    );
  }

  // Get directories by doctor
  getDirectoriesByDoctor(doctorId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}?doctor=${doctorId}`).pipe(
      catchError(this.handleError)
    );
  }

  // Get directories by department
  getDirectoriesByDepartment(departmentId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}?department=${departmentId}`).pipe(
      catchError(this.handleError)
    );
  }

  // Get directories by room
  getDirectoriesByRoom(roomId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}?room=${roomId}`).pipe(
      catchError(this.handleError)
    );
  }

  // Refresh directories list
  refreshDirectories(): Observable<any> {
    // Force a fresh fetch bypassing cache so table updates instantly
    return this.getDirectories(1, 100, '', '', '', true);
  }

  // Clear directories list
  clearDirectories(): void {
    this.directoriesSubject.next([]);
  }

  // Get current directories value
  getCurrentDirectories(): DoctorRoomDirectory[] {
    return this.directoriesSubject.value;
  }

  // Helper method to get doctor name
  getDoctorName(doctor: string | { _id: string; name: string; doctorId?: string }): string {
    if (typeof doctor === 'string') {
      // Find doctor by ID in the loaded doctors list
      const foundDoctor = this.doctorService.getCurrentDoctors().find((d: any) => d._id === doctor);
      return foundDoctor ? foundDoctor.name : 'Unknown Doctor';
    }
    return doctor.name || 'Unknown Doctor';
  }

  // Helper method to get department name
  getDepartmentName(department: string | { _id: string; name: string; code?: string }): string {
    if (typeof department === 'string') {
      return 'Unknown Department';
    }
    return department.name || 'Unknown Department';
  }

  // Helper method to get room number
  getRoomNumber(room: string | { _id: string; roomNumber: string }): string {
    if (typeof room === 'string') {
      // Find room by ID in the loaded rooms list
      const foundRoom = this.roomService.getCurrentRooms().find((r: any) => r._id === room);
      return foundRoom ? foundRoom.roomNumber : 'Unknown Room';
    }
    return room.roomNumber || 'Unknown Room';
  }

  // Error handling
  private handleError(error: any): Observable<never> {
    console.error('DoctorRoomDirectoryService Error:', error);

    // Try to preserve as much server information as possible
    const serverErr = error?.error || {};

    let errorMessage = 'An error occurred';
    if (serverErr?.message) {
      errorMessage = serverErr.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Detect Mongo duplicate key error and normalize message for UI logic
    const rawErrors = serverErr?.errors || serverErr?.error || '';
    const rawText = typeof rawErrors === 'string' ? rawErrors : JSON.stringify(rawErrors || '');
    if (rawText && rawText.toString().includes('E11000')) {
      errorMessage = 'Duplicate: The selected room is already assigned';
    }

    // Return a normalized error while keeping original details
    const normalized = {
      ...error,
      error: {
        ...serverErr,
        message: errorMessage,
        raw: rawText
      }
    };

    return throwError(() => normalized);
  }

  // Validation helpers
  validateDirectoryData(data: Partial<DoctorRoomDirectory>): string[] {
    const errors: string[] = [];
    
    if (!data.doctor) {
      errors.push('Doctor is required');
    }
    
    if (!data.department) {
      errors.push('Department is required');
    }
    
    if (!data.room) {
      errors.push('Room is required');
    }
    
    return errors;
  }
}
